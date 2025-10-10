# path: api/calculations/performance_metrics/symbol_pnl.py
"""Per-symbol realized PnL calculations for performance."""

from __future__ import annotations

from datetime import date

import pandas as pd
from api_test.core.numbers import round6
from api_test.io.sql import read_account_trades


def _safe_to_float_series(values: pd.Series, index: pd.Index) -> pd.Series:
    """Coerce a Series to float64 with NaN for invalid values."""
    out: list[float] = []
    for v in values:
        try:
            out.append(float(v))
        except Exception:
            out.append(float("nan"))
    return pd.Series(out, index=index, dtype="float64")


def _sum_realized_by_symbol(df: pd.DataFrame, account: str) -> pd.Series:
    """Sum realized PnL by symbol for a single account."""
    view = df.loc[:, ["symbol", "realizedPnl"]]
    pnl = _safe_to_float_series(view["realizedPnl"], view.index)
    symbols = view["symbol"].astype(str)

    totals: dict[str, float] = {}
    for sym, val in zip(symbols.tolist(), pnl.tolist(), strict=False):
        if pd.isna(val):
            continue
        key = str(sym)
        totals[key] = totals.get(key, 0.0) + float(val)

    ser = pd.Series(totals, dtype="float64")
    ser.index = ser.index.astype(str)
    return ser.rename(account)


def _row_to_rounded_float_dict(row: pd.Series) -> dict[str, float]:
    """Round a numeric row to 6dp; NaN becomes 0.0."""
    out: dict[str, float] = {}
    for k, v in row.items():
        num = 0.0 if pd.isna(v) else float(v)
        out[str(k)] = round6(num)
    return out


DateLike = date | str | pd.Timestamp


def compute_symbol_realized_mtd(
    accounts: list[str],
    start_day: DateLike,
    end_day: DateLike,
) -> tuple[dict[str, dict[str, float]], dict[str, float]]:
    """Return (symbols_dict, totals_by_account) for MTD realized PnL per symbol."""
    start_iso = pd.Timestamp(start_day).date().isoformat()
    end_iso = pd.Timestamp(end_day).date().isoformat()

    frames: list[pd.Series] = []
    for a in accounts:
        df = read_account_trades(a, f"{start_iso} 00:00:00", f"{end_iso} 23:59:59")
        if df.empty:
            continue
        frames.append(_sum_realized_by_symbol(df, a))

    symbols_dict: dict[str, dict[str, float]] = {}
    totals_by_account: dict[str, float] = {a: 0.0 for a in accounts}

    if not frames:
        return symbols_dict, totals_by_account

    tbl: pd.DataFrame = pd.concat(frames, axis=1)

    totals_col = tbl.sum(axis=1, skipna=True)
    tbl = tbl.assign(TOTAL=totals_col).sort_values("TOTAL", ascending=False)

    for idx_label, row in tbl.iterrows():
        sym_key = str(idx_label)
        symbols_dict[sym_key] = _row_to_rounded_float_dict(row)

    for col in [c for c in tbl.columns if str(c) != "TOTAL"]:
        s = tbl[col]
        col_sum = float(s.sum(skipna=True)) if not s.empty else 0.0
        totals_by_account[str(col)] = round6(col_sum)

    return symbols_dict, totals_by_account
