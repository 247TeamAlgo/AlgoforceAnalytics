# path: api/io/upnl.py
"""Redis readers for unrealized PnL and live equity composition."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from typing import cast

import pandas as pd

from api_test.core.config import get_redis


def _decode_redis_payload(raw: object) -> str | None:
    """Decode Redis value into text if possible."""
    if isinstance(raw, str):
        return raw
    decoder = getattr(raw, "decode", None)
    if decoder is not None:
        try:
            return decoder("utf-8")
        except Exception:
            return None
    return None


def _extract_upnl_value(text_payload: str | None) -> float:
    """Parse JSON payload and sum 'unrealizedProfit' fields; return 0.0 if invalid."""
    if not text_payload:
        return 0.0
    try:
        parsed = json.loads(text_payload)
        frame = pd.DataFrame(parsed)
        if frame.empty or "unrealizedProfit" not in frame.columns:
            return 0.0
        ser: pd.Series = pd.to_numeric(frame["unrealizedProfit"], errors="coerce").fillna(0.0)
        return float(ser.sum())
    except Exception:
        return 0.0


def read_upnl(accounts: list[str]) -> dict[str, float]:
    """Read unrealized PnL per account from Redis and include a 'total' sum."""
    r = get_redis()
    keys: list[str] = [f"{acc}_live" for acc in accounts]

    mget = getattr(r, "mget", None)
    if not callable(mget):
        return {"total": 0.0, **{a: 0.0 for a in accounts}}

    res = mget(keys)

    if res is None:
        raws_list: list[object] = []
    elif isinstance(res, list):
        raws_list = cast(list[object], res)
    elif isinstance(res, tuple):
        raws_list = list(cast(tuple[object, ...], res))
    else:
        raws_list = []

    out: dict[str, float] = {}
    total = 0.0

    for acc, raw in zip(accounts, raws_list, strict=False):
        val = _extract_upnl_value(_decode_redis_payload(raw))
        out[acc] = val
        total += val

    if accounts:
        out["total"] = total
    return out


def equity_components_now(
    accounts: list[str],
) -> tuple[dict[str, float], dict[str, float], dict[str, float], dict[str, float]]:
    """Return component balances (futures, earn, spot) and current uPnL per account."""
    r = get_redis()

    fut: dict[str, float] = {}
    ern: dict[str, float] = {}
    spt: dict[str, float] = {}

    keys: list[str] = [f"{a}_balance" for a in accounts]
    raw_mget: object = r.mget(keys) if keys else []
    raws: list[bytes | str | None] = []
    if isinstance(raw_mget, Iterable):
        for item in cast(Iterable[object], raw_mget):
            if isinstance(item, (bytes | str)) or item is None:
                raws.append(cast(bytes | str | None, item))
            else:
                raws.append(None)

    for acc, raw in zip(accounts, raws, strict=False):
        try:
            parsed: object = json.loads(raw) if raw else {}
        except Exception:
            parsed = {}

        if isinstance(parsed, Mapping):
            parsed_map = cast(Mapping[str, object], parsed)
            fut[acc] = float(parsed_map.get("balance", 0.0))  # type: ignore[arg-type]
            ern[acc] = float(parsed_map.get("earn_balance", 0.0))  # type: ignore[arg-type]
            spt[acc] = float(parsed_map.get("spot_balance", 0.0))  # type: ignore[arg-type]
        else:
            fut[acc] = 0.0
            ern[acc] = 0.0
            spt[acc] = 0.0

    up_map = read_upnl(accounts)
    up_now: dict[str, float] = {a: float(up_map.get(a, 0.0)) for a in accounts}

    return fut, ern, spt, up_now


def equity_now(accounts: list[str]) -> dict[str, float]:
    """Compute equity_now = futures + earn + spot + today_upnl per account."""
    fut, ern, spt, upn = equity_components_now(accounts)
    return {
        a: float(fut.get(a, 0.0))
        + float(ern.get(a, 0.0))
        + float(spt.get(a, 0.0))
        + float(upn.get(a, 0.0))
        for a in accounts
    }
