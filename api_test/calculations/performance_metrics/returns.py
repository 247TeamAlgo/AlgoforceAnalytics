# path: api/calculations/performance_metrics/returns.py
"""Return calculations for performance metrics (series-based helpers)."""

from __future__ import annotations

import pandas as pd

__all__ = ["pct_returns", "mtd_return"]


def pct_returns(balance: pd.DataFrame) -> pd.DataFrame:
    """Compute period-over-period returns row-wise; replace NaNs with 0.0."""
    prev = balance.shift(1)
    out = (balance - prev) / prev
    return out.where(~out.isna(), 0.0)


def mtd_return(balance: pd.DataFrame) -> dict[str, float]:
    """Compute month-to-date returns per column for the latest month in the index."""
    if balance.empty:
        return {}

    idx = pd.DatetimeIndex(balance.index)
    latest_year = int(idx.year.max())
    latest_month = int(idx[idx.year == latest_year].month.max())
    mask = (idx.year == latest_year) & (idx.month == latest_month)
    month_frame = balance.loc[mask]
    if month_frame.empty:
        return {}

    first = month_frame.iloc[0]
    last = month_frame.iloc[-1]

    out: dict[str, float] = {}
    for col in month_frame.columns:
        a = float(first[col])
        b = float(last[col])
        out[str(col)] = 0.0 if a == 0.0 else round((b - a) / a, 6)
    return out
