"""Date/time helpers used around the codebase."""

from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd


def now_utc() -> datetime:
    """Return aware UTC datetime."""
    return datetime.now(UTC)


def coerce_series_to_datetime(series: pd.Series) -> pd.Series:
    """Coerce series to datetime dtype; invalid -> NaT."""
    return pd.to_datetime(series, errors="coerce")
