"""Compute count/ratio of losing days from a returns series."""

from __future__ import annotations

import pandas as pd


def losing_days_count(returns: pd.Series) -> int:
    """Return the number of days with negative return."""
    if returns.empty:
        return 0
    return int((returns < 0).sum())


def losing_days_ratio(returns: pd.Series) -> float:
    """Return the share of days that are negative (0.0..1.0)."""
    if returns.empty:
        return 0.0
    return float((returns < 0).mean())
