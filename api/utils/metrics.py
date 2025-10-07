# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\index.py
"""Metrics helpers for returns and drawdowns.

Utilities to compute simple returns, month-to-date (MTD) returns, and MTD drawdowns on
balance/returns series indexed by datetime.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

__all__ = ["pct_returns", "mtd_return", "mtd_drawdown"]


def pct_returns(balance: pd.DataFrame) -> pd.DataFrame:
    """Compute period-over-period returns along the index (axis=0).

    Avoids pct_change/fillna to keep type checkers quiet:
    returns = (balance - balance.shift(1)) / balance.shift(1), NaNs replaced with 0.0.
    """
    prev = balance.shift(1)
    out = (balance - prev) / prev
    # Use where instead of fillna to dodge stub overload issues.
    return out.where(~out.isna(), 0.0)


def _latest_year_month(idx: pd.DatetimeIndex) -> tuple[int, int]:
    """Return the (year, month) pair for the latest month present in the index.

    Uses vectorized NumPy math to avoid Pandas methods that trip Pylance.
    """
    years = idx.year.values.astype(np.int64)
    months = idx.month.values.astype(np.int64)
    combined = years * 100 + months  # e.g., 202510 for Oct 2025
    combined_max = int(np.max(combined)) if combined.size else 0
    return combined_max // 100, combined_max % 100


def mtd_return(balance: pd.DataFrame) -> dict[str, float]:
    """Compute month-to-date returns per column.

    For the latest month present in the index:
      - pick the first and last rows of that month
      - compute (last - first) / first
      - if the first value is 0, return 0 for that column to avoid division by zero
    """
    if balance.empty:
        return {}

    idx = pd.DatetimeIndex(balance.index)
    latest_year, latest_month = _latest_year_month(idx)
    mask = (idx.year == latest_year) & (idx.month == latest_month)
    month_frame = balance.loc[mask]
    if month_frame.empty:
        return {}

    first = month_frame.iloc[0]
    last = month_frame.iloc[-1]

    out: dict[str, float] = {}
    for col in month_frame.columns:
        first_val = float(first[col])
        last_val = float(last[col])
        out[str(col)] = round(((last_val - first_val) / first_val) if first_val != 0.0 else 0.0, 6)
    return out


def mtd_drawdown(returns: pd.DataFrame) -> dict[str, float]:
    """Compute month-to-date drawdown (min from peak) per column.

    For each column in the latest month of ``returns``, build an equity curve as
    (1 + r).cumprod(), track the running peak, then compute (eq - peak) / peak.
    The minimum value in that month is the MTD drawdown.
    """
    if returns.empty:
        return {}

    idx = pd.DatetimeIndex(returns.index)
    latest_year, latest_month = _latest_year_month(idx)
    mask = (idx.year == latest_year) & (idx.month == latest_month)
    month_returns = returns.loc[mask]
    if month_returns.empty:
        return {}

    out: dict[str, float] = {}
    for col in month_returns.columns:
        s = month_returns[col]
        eq = (1.0 + s).cumprod()
        peak = eq.cummax()
        dd = (eq - peak) / peak
        out[str(col)] = round(float(dd.min()) if not dd.empty else 0.0, 6)
    return out
