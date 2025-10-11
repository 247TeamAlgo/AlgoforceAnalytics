# api/metrics/performance_metrics/calculations/returns.py
"""Returns calculation helpers (series-based and live formulas)."""

from __future__ import annotations

import pandas as pd
from pandas import DataFrame


def pct_returns(balance: DataFrame) -> DataFrame:
    """Period-over-period returns by column; NaN->0.0."""
    prev = balance.shift(1)
    out = (balance - prev) / prev
    return out.where(~out.isna(), 0.0)


def mtd_return(balance: DataFrame) -> dict[str, float]:
    """Month-to-date simple return per column (latest month in index)."""
    if balance.empty:
        return {}
    idx = pd.DatetimeIndex(balance.index)
    ym = idx.year * 100 + idx.month
    latest = int(ym.max())
    month = balance.loc[ym == latest]
    if month.empty:
        return {}
    first = month.iloc[0]
    last = month.iloc[-1]
    out: dict[str, float] = {}
    for col in month.columns:
        first_val = float(first[col])
        last_val = float(last[col])
        out[str(col)] = (last_val - first_val) / first_val if first_val != 0.0 else 0.0
    return out


def live_return_realized(
    last_value: float, initial_value: float, upnl: float
) -> tuple[float, float]:
    """Realized live dollars and fraction using CLI formula."""
    dollars = (last_value + upnl) - initial_value
    frac = ((last_value + upnl) / initial_value - 1.0) if initial_value != 0.0 else 0.0
    return dollars, frac


def live_return_margin(
    last_realized: float,
    initial_value: float,
    unrealized_json: float,
    upnl: float,
) -> tuple[float, float]:
    """Margin live dollars and fraction using CLI formula (denom includes unrealized)."""
    last_margin_live = last_realized + unrealized_json + upnl
    denom = initial_value + unrealized_json
    dollars = last_margin_live - denom
    frac = (last_margin_live / denom - 1.0) if denom != 0.0 else 0.0
    return dollars, frac
