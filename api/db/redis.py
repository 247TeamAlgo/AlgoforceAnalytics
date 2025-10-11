"""Redis helpers for live unrealized PnL (uPnL)."""

from __future__ import annotations

import json
from collections.abc import Iterable, Sequence

import pandas as pd

from ..core.config import get_redis, now_utc_iso


def _decode(value: object) -> str | None:
    """Return a UTF-8 string from a Redis value (str/bytes/bytearray), else None."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    dec = getattr(value, "decode", None)
    # mypy/pylance friendly: ensure callability and return type
    if callable(dec):  # type: ignore[truthy-function]
        try:
            out = dec("utf-8")  # type: ignore[call-arg]
            return out if isinstance(out, str) else None
        except Exception:
            return None
    return None


def _sum_unrealized(text_payload: str | None) -> float:
    """Parse JSON array and sum its `unrealizedProfit` numbers; return 0.0 if unknown."""
    if not text_payload:
        return 0.0
    try:
        parsed = json.loads(text_payload)
        frame = pd.DataFrame(parsed)
        if frame.empty or "unrealizedProfit" not in frame.columns:
            return 0.0
        ser = pd.to_numeric(frame["unrealizedProfit"], errors="coerce")
        return float(ser.fillna(0.0).sum())
    except Exception:
        return 0.0


def read_upnl(accounts: Sequence[str]) -> dict[str, float]:
    """Read current unrealized PnL for each account from Redis `{account}_live` keys.

    Returns a mapping with per-account values and a `total` key.
    """
    if not accounts:
        return {"total": 0.0}

    r = get_redis()
    keys = [f"{a}_live" for a in accounts]

    raws: Iterable[object] = r.mget(keys) or []  # type: ignore[assignment]

    out: dict[str, float] = {}
    total = 0.0
    for acc, raw in zip(accounts, raws, strict=False):
        val = _sum_unrealized(_decode(raw))
        out[str(acc)] = val
        total += val

    out["total"] = total
    return out


def upnl_payload(accounts: Sequence[str]) -> dict[str, object]:
    """Return API payload for uPnl: {asOf, perAccount, combined}."""
    m = read_upnl(accounts)
    per = {a: float(m.get(a, 0.0)) for a in accounts}
    return {
        "asOf": now_utc_iso(),
        "perAccount": per,
        "combined": float(m.get("total", 0.0)),
    }
