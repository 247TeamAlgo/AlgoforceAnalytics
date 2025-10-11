"""Equity curve helpers built from simple trade PnL records."""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd


def equity_from_pnl_records(records: Iterable[dict[str, float]]) -> pd.Series:
    """Build an equity curve (cumulative PnL) from iterable of records.

    Each record must contain a 'pnl' number and optional 'asOf' timestamp-like.
    """
    df = pd.DataFrame.from_records(list(records))
    if df.empty:
        return pd.Series(dtype=float)
    if "asOf" in df.columns:
        df["asOf"] = pd.to_datetime(df["asOf"], errors="coerce")
        df = df.set_index("asOf").sort_index()
    return df["pnl"].fillna(0.0).cumsum()
