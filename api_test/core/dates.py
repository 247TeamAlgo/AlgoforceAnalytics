# path: api/core/dates.py
"""Date/time helpers."""

from __future__ import annotations

from datetime import date

import pandas as pd


def today_utc() -> str:
    """Return a timezone-aware UTC ISO 8601 string with trailing 'Z'."""
    return pd.Timestamp.now(tz="UTC").isoformat().replace("+00:00", "Z")


def mtd_window() -> tuple[date, date]:
    """Return (start_day, end_day) for month-to-date using UTC calendar days."""
    t = pd.Timestamp.now(tz="UTC").date()
    return t.replace(day=1), t
