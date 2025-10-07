# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\index.py
"""JSON baselines and live equity composition helpers."""

from __future__ import annotations

import json
import os
from collections.abc import Iterable, Mapping
from typing import Protocol, cast, runtime_checkable

from api.utils.io import read_upnl

from .config import (
    baseline_balance_candidates,
    baseline_unrealized_candidates,
    get_redis,
)

__all__ = [
    "get_json_balances",
    "get_json_unrealized",
    "compute_json_initial_balances",
    "equity_components_now",
    "equity_now",
]


@runtime_checkable
class _SupportsFloat(Protocol):
    def __float__(self) -> float: ...


@runtime_checkable
class _SupportsIndex(Protocol):
    def __index__(self) -> int: ...


# Union of things `float()` accepts that we can also check at runtime
_ConvertibleToFloat = str | bytes | bytearray | _SupportsFloat | _SupportsIndex


def _coerce_float(x: object, default: float = 0.0) -> float:
    """Best-effort float conversion that never raises.

    We first narrow `x` to a runtime-checkable union accepted by `float()`.
    """
    if isinstance(x, _SupportsFloat | _SupportsIndex | str | bytes | bytearray):
        try:
            return float(x)
        except (TypeError, ValueError):
            return default
    return default


def _first_existing_path(paths: Iterable[str]) -> str | None:
    """Return the first existing path from an iterable, or None if none exist."""
    for p in paths:
        if p and os.path.exists(p):
            return p
    return None


def _load_json_map(paths: Iterable[str]) -> dict[str, float]:
    """Load a JSON mapping {account: numberlike} from the first existing path.

    Unknown shapes are treated as empty. Values are coerced to float; invalid entries
    are skipped.
    """
    path = _first_existing_path(paths)
    if not path:
        return {}

    try:
        with open(path, encoding="utf-8") as f:
            raw_obj: object = json.load(f)
    except Exception:
        return {}

    if not isinstance(raw_obj, Mapping):
        return {}

    raw_map = cast(Mapping[object, object], raw_obj)

    out: dict[str, float] = {}
    for k_obj, v_obj in raw_map.items():
        key = str(k_obj).lower()
        val = _coerce_float(v_obj, float("nan"))
        if val == val:  # filter NaN without importing math
            out[key] = val
    return out


def get_json_balances() -> dict[str, float]:
    """Baseline equity per account from balance.json."""
    return _load_json_map(baseline_balance_candidates())


def get_json_unrealized() -> dict[str, float]:
    """Baseline unrealized per account from unrealized.json."""
    return _load_json_map(baseline_unrealized_candidates())


def compute_json_initial_balances(accounts: list[str]) -> dict[str, float]:
    """Per-account initial = json_balance + json_unrealized."""
    bal = get_json_balances()
    unrl = get_json_unrealized()
    return {a: float(bal.get(a, 0.0)) + float(unrl.get(a, 0.0)) for a in accounts}


def _normalize_mget_result(result: object) -> list[bytes | str | None]:
    """Normalize a Redis mget result to a list[bytes | str | None].

    Accepts sync/async unions and unknown iterables; non-string/bytes items are mapped to None.
    """
    out: list[bytes | str | None] = []
    if isinstance(result, Iterable):
        iterable = cast(Iterable[object], result)  # avoid Iterable[Unknown]
        for item in iterable:
            if isinstance(item, (bytes | str)) or item is None:
                out.append(item)  # no cast needed; Pylance knows the narrowed type
            else:
                out.append(None)
    return out


def equity_components_now(
    accounts: list[str],
) -> tuple[dict[str, float], dict[str, float], dict[str, float], dict[str, float]]:
    """Return (futures, earn, spot, upnl_now) per account from Redis and read_upnl()."""
    r = get_redis()

    fut: dict[str, float] = {}
    ern: dict[str, float] = {}
    spt: dict[str, float] = {}

    keys: list[str] = [f"{a}_balance" for a in accounts]
    raw_mget: object = r.mget(keys) if keys else []
    raws: list[bytes | str | None] = _normalize_mget_result(raw_mget)

    for acc, raw in zip(accounts, raws, strict=False):
        try:
            # json.loads accepts str|bytes|bytearray; treat falsy as {}
            parsed: object = json.loads(raw) if raw else {}
        except Exception:
            parsed = {}

        if isinstance(parsed, Mapping):
            parsed_map = cast(Mapping[str, object], parsed)
            fut[acc] = _coerce_float(parsed_map.get("balance", 0.0))
            ern[acc] = _coerce_float(parsed_map.get("earn_balance", 0.0))
            spt[acc] = _coerce_float(parsed_map.get("spot_balance", 0.0))
        else:
            fut[acc] = 0.0
            ern[acc] = 0.0
            spt[acc] = 0.0

    up_map = read_upnl(accounts)  # if needed, annotate: Mapping[str, float]
    up_now: dict[str, float] = {a: _coerce_float(up_map.get(a, 0.0)) for a in accounts}

    return fut, ern, spt, up_now


def equity_now(accounts: list[str]) -> dict[str, float]:
    """Compute equity_now = futures + earn + spot + today_upnl."""
    fut, ern, spt, upn = equity_components_now(accounts)
    return {
        a: float(fut.get(a, 0.0))
        + float(ern.get(a, 0.0))
        + float(spt.get(a, 0.0))
        + float(upn.get(a, 0.0))
        for a in accounts
    }
