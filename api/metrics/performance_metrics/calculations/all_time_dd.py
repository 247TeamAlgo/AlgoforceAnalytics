# api/metrics/performance_metrics/calculations/all_time_dd.py
"""
Definitions:
- Levels = realized equity: SQL initial balance + cumulative daily realized PnL
           (trades net of commission) + funding fees + earnings. No UPnL in history.
- Max DD  (all-time) is computed from *levels* over the full window.
- Current DD (all-time) uses (last realized + UPnL_total) vs peak(levels) over the full window.
"""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd
from pandas import DataFrame

from ....db.redis import read_upnl
from ....db.sql import nearest_balance_on_or_before
from ..calculations.drawdown import current_drawdown
from ..calculations.equity import build_fixed_balances


def _max_dd_from_levels(levels: DataFrame) -> dict[str, float]:
    """Max drawdown over the *entire* span of each column in `levels`."""
    if levels.empty:
        return {}
    out: dict[str, float] = {}
    for col in levels.columns:
        s = pd.to_numeric(levels[col], errors="coerce").dropna()
        if s.empty:
            out[str(col)] = 0.0
            continue
        peak = s.cummax()
        dd = (s - peak) / peak
        out[str(col)] = float(dd.min())
    return out


def _offset_with_initial(
    level_delta: DataFrame, init_map: dict[str, float], accs: list[str]
) -> DataFrame:
    """Apply SQL initial balances to per-account delta series to get realized levels."""
    if level_delta.empty:
        return level_delta
    out = level_delta.copy()
    for a in accs:
        if a in out.columns:
            out[a] = out[a] + float(init_map.get(a, 0.0))
    return out


def compute_all_time_max_current_dd(accounts: Sequence[str]) -> dict[str, object]:
    """Return all-time realized current/max drawdown for selected accounts.

    Payload shape:
    {
      "window": {"startDay": "YYYY-MM-DD", "endDay": "YYYY-MM-DD"},
      "realized": {
        "current": { "total": float, "<acc>": float, ... },
        "max":     { "total": float, "<acc>": float, ... }
      }
    }
    """
    accs = [a.strip().lower() for a in accounts if a and a.strip()]
    if not accs:
        return {
            "window": {"startDay": None, "endDay": None},
            "realized": {"current": {}, "max": {}},
        }

    # ---- Pick an all-time window ----
    # Use the earliest balance snapshot across the selected accounts as the global start;
    # end is "today" at local midnight (tz-naive, like the rest of Code B).
    very_early = pd.Timestamp("1970-01-01")
    earliest_per_acc: dict[str, pd.Timestamp] = {}
    for a in accs:
        _bal, ts = nearest_balance_on_or_before(a, very_early)
        earliest_per_acc[a] = ts

    start_day = (
        min(earliest_per_acc.values()) if earliest_per_acc else pd.Timestamp.today().normalize()
    )
    end_day = pd.Timestamp.today().normalize()

    # ---- Build realized equity levels (no UPnL in history) ----
    # 1) Per-account realized deltas from trades/txn/earnings
    fixed_delta, _ignored_init_map = build_fixed_balances(accs, start_day, end_day)

    # 2) Initial balances from SQL at start_day (per account), then offset
    init_map: dict[str, float] = {}
    for a in accs:
        bal, _ts = nearest_balance_on_or_before(a, start_day)
        init_map[a] = float(bal)

    fixed_levels = _offset_with_initial(fixed_delta, init_map, accs)

    # 3) Add a 'total' column (sum of accounts) for combined DD
    levels_total = (
        fixed_levels.assign(total=fixed_levels[accs].sum(axis=1))
        if not fixed_levels.empty
        else fixed_levels
    )

    # ---- Max DD over the full window (levels) ----
    max_dd_map = _max_dd_from_levels(levels_total) if not levels_total.empty else {}

    # ---- Current DD (live): (last realized + total UPnL) vs peak(levels) ----
    if levels_total.empty:
        current_dd_map: dict[str, float] = {}
    else:
        last_ts = pd.Timestamp(levels_total.index[-1])

        # UPnL map includes per-account and "total"
        up_map = read_upnl(accs)  # {acc: upnl, ..., "total": ...}
        current_dd_map = {}

        # Per-account current DD
        for a in accs:
            if a in fixed_levels.columns:
                s = fixed_levels[a].dropna()
                if s.empty:
                    current_dd_map[a] = 0.0
                    continue
                peak_a = float(s.cummax().iloc[-1])
                last_realized_a = float(s.loc[last_ts]) if last_ts in s.index else float(s.iloc[-1])
                live_a = last_realized_a + float(up_map.get(a, 0.0))
                current_dd_map[a] = current_drawdown(live_a, peak_a) if peak_a else 0.0
            else:
                current_dd_map[a] = 0.0

        # Total current DD
        st = levels_total["total"].dropna()
        if st.empty:
            current_dd_map["total"] = 0.0
        else:
            peak_t = float(st.cummax().iloc[-1])
            last_realized_t = float(st.loc[last_ts]) if last_ts in st.index else float(st.iloc[-1])
            live_t = last_realized_t + float(up_map.get("total", 0.0))
            current_dd_map["total"] = current_drawdown(live_t, peak_t) if peak_t else 0.0

    # ---- Package ----
    out = {
        "window": {"startDay": str(start_day.date()), "endDay": str(end_day.date())},
        "realized": {
            "current": current_dd_map,
            "max": max_dd_map,
        },
    }
    return out
