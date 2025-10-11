# api/metrics/performance_metrics/calculations/drawdown.py
"""Drawdown helpers."""

from __future__ import annotations

import pandas as pd
from pandas import DataFrame


def current_drawdown(live_value: float, peak_value: float) -> float:
    """Current drawdown = (live - peak) / peak."""
    return (live_value - peak_value) / peak_value if peak_value != 0.0 else 0.0


def mtd_drawdown_from_returns(r: DataFrame) -> dict[str, float]:
    """Compute MTD max drawdown from a returns series.

    The input is a DataFrame of percentage returns (not levels). The function
    extracts the latest month per column, converts returns to a normalized
    equity curve via cumulative product, and then computes the minimum
    drawdown over that month.
    """
    if r.empty:
        return {}
    idx = pd.DatetimeIndex(r.index)
    ym = idx.year * 100 + idx.month
    latest = int(ym.max())
    month = r.loc[ym == latest]
    if month.empty:
        return {}
    out: dict[str, float] = {}
    for col in month.columns:
        eq = (1.0 + month[col]).cumprod()
        peak = eq.cummax()
        dd = (eq - peak) / peak
        out[str(col)] = float(dd.min()) if not dd.empty else 0.0
    return out


def mtd_max_dd_from_levels(levels: DataFrame) -> dict[str, float]:
    """Compute MTD max drawdown directly from equity *levels*.

    Mirrors the CLI logic that computes drawdown on running balances, not on
    returns. For each column, we isolate the latest month, take the cumulative
    max, and measure the minimum (level - peak) / peak over that window.
    """
    if levels.empty:
        return {}
    idx = pd.DatetimeIndex(levels.index)
    ym = idx.year * 100 + idx.month
    latest = int(ym.max())
    month = levels.loc[ym == latest]
    if month.empty:
        return {}
    out: dict[str, float] = {}
    for col in month.columns:
        s = pd.to_numeric(month[col], errors="coerce").dropna()
        if s.empty:
            out[str(col)] = 0.0
            continue
        peak = s.cummax()
        dd = (s - peak) / peak
        out[str(col)] = float(dd.min())
    return out
