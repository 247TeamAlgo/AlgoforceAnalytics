"""Returns calculation helpers."""

from __future__ import annotations

import pandas as pd


def pct_change(series: pd.Series) -> pd.Series:
    """Percent change with NaNs handled (first value -> 0.0)."""
    out = series.pct_change()
    return out.fillna(0.0)


def daily_returns(equity_curve: pd.Series) -> pd.Series:
    """Daily returns from an equity curve series (index = date/datetime)."""
    return pct_change(equity_curve)
