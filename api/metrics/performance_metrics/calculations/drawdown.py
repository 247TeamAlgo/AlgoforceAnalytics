"""Drawdown helpers for return/equity series."""

from __future__ import annotations

import pandas as pd


def drawdown_from_equity(equity: pd.Series) -> pd.Series:
    """Return drawdown series from equity curve."""
    if equity.empty:
        return equity
    roll_max = equity.cummax()
    return (equity - roll_max) / roll_max.replace(0, pd.NA)


def mdd_from_equity(equity: pd.Series) -> float:
    """Maximum drawdown as a float (negative number)."""
    dd = drawdown_from_equity(equity)
    return float(dd.min()) if not dd.empty else 0.0


def mtd_drawdown_from_returns(returns: pd.Series) -> float:
    """Month-to-date drawdown computed from a returns series."""
    if returns.empty:
        return 0.0
    # Ensure a DatetimeIndex so `.to_period` is available to the type checker.
    idx = pd.DatetimeIndex(returns.index)
    month = idx.to_period("M")
    this_month = returns[month == month[-1]]
    if this_month.empty:
        return 0.0
    equity = (1.0 + this_month).cumprod()
    return mdd_from_equity(equity)
