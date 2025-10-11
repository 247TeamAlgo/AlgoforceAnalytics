"""PnL by symbol summarization."""

from __future__ import annotations

import pandas as pd


def pnl_by_symbol(trades: pd.DataFrame) -> pd.DataFrame:
    """Aggregate realized PnL by 'symbol' column; returns two columns.

    Output columns: ['symbol', 'pnl'].
    """
    if trades.empty or "symbol" not in trades.columns or "pnl" not in trades.columns:
        return pd.DataFrame(columns=["symbol", "pnl"])
    out = (
        trades.groupby("symbol", dropna=False, as_index=False)  # DataFrameGroupBy
        .agg({"pnl": "sum"})
    )
    return out
