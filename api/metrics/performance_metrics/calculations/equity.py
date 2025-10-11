# api/metrics/performance_metrics/calculations/equity.py
"""Equity construction from SQL deltas and initial balances."""

from __future__ import annotations

import pandas as pd
from pandas import DataFrame, Series

from ....db.sql import read_earnings, read_trades, read_transactions


def _daily_pnl(trades: DataFrame, txn: DataFrame, earn: DataFrame) -> Series:
    """Sum daily PnL from trades (net), funding fee, earnings. Excludes transfers."""
    parts: list[Series] = []
    if not trades.empty:
        parts.append(trades["realizedPnl"])
    if not txn.empty:
        it = txn["incomeType"].astype(str).str.upper()
        if it.eq("FUNDING_FEE").any():
            parts.append(txn.loc[it.eq("FUNDING_FEE"), "income"])
        # Exclude TRANSFER by design
    if not earn.empty:
        parts.append(earn["rewards"])
    if not parts:
        return pd.Series(dtype="float64")
    s = pd.concat(parts).sort_index()
    s.index = pd.DatetimeIndex(s.index)
    return s.resample("D").sum()


def _coerce_float(x: object) -> float:
    """Robust scalar→float conversion to satisfy pandas-stubs/pylance."""
    if isinstance(x, int | float):
        return float(x)
    try:
        ser = pd.Series([x])
        val = pd.to_numeric(ser, errors="coerce").iloc[0]
        return float(val) if pd.notna(val) else 0.0
    except Exception:
        return 0.0


def build_fixed_balances(
    accounts: list[str],
    start_day: pd.Timestamp,
    end_day: pd.Timestamp,
) -> tuple[DataFrame, dict[str, float]]:
    """Build realized equity series (no UPnL, no unrealized shift), daily frequency."""
    idx = pd.date_range(start_day.normalize(), end_day.normalize(), freq="D")
    cols: list[Series] = []
    init_map: dict[str, float] = {}

    # Initial balance is fetched by orchestrator; here we only build deltas.
    for acc in accounts:
        tr = read_trades(acc, f"{start_day.date()} 00:00:00", f"{end_day.date()} 23:59:59")
        tx = read_transactions(acc, f"{start_day.date()} 00:00:00", f"{end_day.date()} 23:59:59")
        er = read_earnings(acc, f"{start_day.date()} 00:00:00", f"{end_day.date()} 23:59:59")

        daily = _daily_pnl(tr, tx, er)
        if daily.empty:
            s = pd.Series(0.0, index=idx, name=acc, dtype="float64")
        else:
            s = daily.reindex(idx).fillna(0.0).cumsum()
        cols.append(s.rename(acc))

    delta = (
        pd.concat(cols, axis=1)
        if cols
        else pd.DataFrame(index=idx, columns=accounts, dtype="float64")
    )
    return delta, init_map  # init_map kept for signature parity


def build_margin_series(
    fixed_balances: DataFrame,
    unrealized_map: dict[str, float],
    upnl_map: dict[str, float],
    accounts: list[str],
) -> DataFrame:
    """Margin = realized + unrealizedJson (constant), then inject UPnL on last row only."""
    if fixed_balances.empty:
        return fixed_balances
    out = fixed_balances.copy()
    for a in accounts:
        out[a] = out[a] + float(unrealized_map.get(a, 0.0))
    last = out.index[-1]
    for a in accounts:
        base_val = _coerce_float(out.at[last, a])
        out.at[last, a] = base_val + float(upnl_map.get(a, 0.0))
    return out
