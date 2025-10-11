"""Lightweight SQL helpers (type-checker friendly)."""

from __future__ import annotations

from datetime import date, datetime
from typing import cast, overload

import numpy as np
import pandas as pd

ScalarDateLike = str | int | float | date | datetime | pd.Timestamp | np.datetime64


def read_table(_table: str, _where: str | None = None) -> pd.DataFrame:
    """Return a DataFrame for a table (placeholder; wire up your real SQL here)."""
    return pd.DataFrame()


@overload
def parse_dt(value: None) -> None: ...
@overload
def parse_dt(value: ScalarDateLike) -> pd.Timestamp | None: ...


def parse_dt(value: object | None) -> pd.Timestamp | None:
    """Parse a single datetime-like scalar to pandas.Timestamp; invalid → None."""
    if value is None:
        return None
    # isinstance requires a tuple of types (not a union)
    if not isinstance(
        value,
        str | int | float | date | datetime | pd.Timestamp | np.datetime64,
    ):
        return None

    val = cast(ScalarDateLike, value)
    try:
        ts = pd.Timestamp(val)
    except Exception:
        return None
    return None if pd.isna(ts) else ts


def ensure_datetime(series: pd.Series) -> pd.Series:
    """Coerce a Series to datetime; invalid rows become NaT."""
    return pd.to_datetime(series, errors="coerce")


def group_sum(df: pd.DataFrame, by: list[str], col: str) -> pd.DataFrame:
    """Group by the given columns and sum a numeric column (returns a DataFrame)."""
    if df.empty or not by or col not in df.columns:
        return pd.DataFrame(columns=[*by, col])
    return df.groupby(by, dropna=False, as_index=False).agg({col: "sum"})


def frame_from_records(records: list[dict[str, object]]) -> pd.DataFrame:
    """Create a DataFrame from a list of record dictionaries."""
    return pd.DataFrame.from_records(records or [])
