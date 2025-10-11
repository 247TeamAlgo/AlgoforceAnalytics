# api/db/redis.py
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
    if callable(dec):
        try:
            out = dec("utf-8")
            return out if isinstance(out, str) else None
        except Exception:
            return None
    return None


def _sum_unrealized(text_payload: str | None) -> float:
    """Parse JSON array and sum `unrealizedProfit`; return 0.0 if unknown."""
    if not text_payload:
        return 0.0
    try:
        parsed = json.loads(text_payload)
        frame = pd.DataFrame(parsed)
        if frame.empty or "unrealizedProfit" not in frame.columns:
            return 0.0
        ser = pd.to_numeric(frame["unrealizedProfit"], errors="coerce").fillna(0.0)
        return float(ser.sum())
    except Exception:
        return 0.0


def _normalize_mget_result(result: object) -> list[object]:
    """Normalize r.mget(...) into a plain list[object], handling various stubbed types.

    - If it's already a list/tuple → return list(...)
    - If it's any other Iterable (but not str/bytes) → list(...)
    - If it's awaitable/unknown → return []
    """
    if isinstance(result, list):
        return result
    if isinstance(result, tuple):
        return list(result)
    # Avoid treating str/bytes as iterables of chars
    if isinstance(result, str | bytes | bytearray):
        return []
    try:
        if isinstance(result, Iterable):
            return list(result)
    except Exception:
        pass
    # Could be an awaitable from async client stubs; we don't await in this sync module.
    return []


def read_upnl(accounts: Sequence[str]) -> dict[str, float]:
    """Read unrealized PnL from Redis `{account}_live`. Returns map + 'total' key."""
    if not accounts:
        return {"total": 0.0}

    r = get_redis()
    keys: list[str] = [f"{a}_live" for a in accounts]

    # Do not annotate directly as Iterable to avoid stub unions (ResponseT | ...).
    raw_res: object
    try:
        raw_res = r.mget(keys)  # type: ignore[no-any-return]
    except Exception:
        raw_res = []

    raws: list[object] = _normalize_mget_result(raw_res)

    out: dict[str, float] = {}
    total = 0.0
    for acc, raw in zip(accounts, raws, strict=False):
        val = _sum_unrealized(_decode(raw))
        out[str(acc)] = val
        total += val

    out["total"] = total
    return out


def upnl_payload(accounts: Sequence[str]) -> dict[str, object]:
    """Return API block for uPnl: {asOf, perAccount, combined}."""
    m = read_upnl(accounts)
    per = {a: float(m.get(a, 0.0)) for a in accounts}
    return {
        "asOf": now_utc_iso(),
        "perAccount": per,
        "combined": float(m.get("total", 0.0)),
    }
