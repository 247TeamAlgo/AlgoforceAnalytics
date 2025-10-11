"""Convenience wrapper exposing MTD max drawdown from returns."""

from __future__ import annotations

import pandas as pd

from .drawdown import mtd_drawdown_from_returns


def mtd_max_drawdown(returns: pd.Series) -> float:
    """Return month-to-date maximum drawdown (negative float)."""
    return mtd_drawdown_from_returns(returns)
