# api/metrics/performance_metrics/calculations/pnl_by_symbol.py
"""PnL by symbol (month-to-date, realized only)."""

from __future__ import annotations

import pandas as pd

from ....db.sql import read_trades


def pnl_by_symbol_mtd(
    accounts: list[str],
    start_day_iso: str,
    end_day_iso: str,
) -> tuple[dict[str, dict[str, float]], dict[str, float]]:
    """Aggregate realized PnL per symbol across accounts."""
    frames: list[pd.Series] = []
    for a in accounts:
        df = read_trades(a, start_day_iso, end_day_iso)
        if df.empty:
            continue
        use = df.loc[:, ["symbol", "realizedPnl"]].copy()
        use["symbol"] = use["symbol"].astype("string")
        use["realizedPnl"] = pd.to_numeric(use["realizedPnl"], errors="coerce").fillna(0.0)
        grp = use.groupby("symbol", sort=False)["realizedPnl"].sum()
        frames.append(grp.rename(a))

    if not frames:
        return {}, {a: 0.0 for a in accounts}

    table = pd.concat(frames, axis=1).fillna(0.0).astype("float64")
    table["TOTAL"] = table.sum(axis=1)
    table.sort_values("TOTAL", ascending=False, inplace=True)

    symbols: dict[str, dict[str, float]] = {}
    for idx, row in table.iterrows():
        symbols[str(idx)] = {str(k): float(v) for k, v in row.items()}

    totals: dict[str, float] = {
        str(c): float(table[c].sum()) for c in table.columns if str(c) != "TOTAL"
    }
    return symbols, totals
