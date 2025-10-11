# api/metrics/performance_metrics/calculations/drawdown.py
"""Drawdown helpers."""

from __future__ import annotations

import pandas as pd
from pandas import DataFrame


def current_drawdown(live_value: float, peak_value: float) -> float:
    """Current drawdown = (live - peak) / peak."""
    return (live_value - peak_value) / peak_value if peak_value != 0.0 else 0.0


def mtd_drawdown_from_returns(r: DataFrame) -> dict[str, float]:
    """MTD max drawdown computed from returns series (latest month per column)."""
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
