# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\calculations\drawdown_mtd.py  # noqa: E501
"""Compute live month-to-date drawdown per account, including UPnL injection.

This module builds an equity curve from trades, funding (excluding transfers),
and earnings since the first day of the month, injects live UPnL on the latest
day, computes returns, and derives MTD drawdown per account and in aggregate
("total").
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import TypedDict, overload

import numpy as np
import pandas as pd
from pandas import DataFrame, Series

from ..io import (
    load_accounts,
    load_day_open_balances,
    read_account_earnings,
    read_account_trades,
    read_account_transactions,
    read_upnl,
)
from ..metrics import mtd_drawdown, pct_returns

# Accept common number-like inputs that we might see from pandas/numpy/IO.
NumberLike = float | int | np.floating | str | None


class DrawdownResult(TypedDict):
    """Return type for compute_drawdown_mtd."""

    mtdDrawdown: dict[str, float]
    accounts: list[str]


def _truncate4(x: NumberLike) -> float:
    """Convert to float and truncate to 4 decimals (never raises)."""
    try:
        xf = float(x)  # type: ignore[arg-type]
    except Exception:
        return 0.0
    return float(int(xf * 10_000) / 10_000.0)


def _truncate4_map(d: Mapping[str, NumberLike]) -> dict[str, float]:
    return {k: _truncate4(v) for k, v in d.items()}


def _collect_parts(df_tr: DataFrame, df_tx: DataFrame, df_er: DataFrame) -> list[DataFrame]:
    """Collect normalized ledgers for pnl-related rows."""
    parts: list[DataFrame] = []

    if not df_tr.empty:
        p = df_tr.loc[:, ["realizedPnl"]].rename(columns={"realizedPnl": "dollar_val"})
        p["transaction_type"] = "realizedPnl"
        parts.append(p)

    if not df_tx.empty:
        ff = (
            df_tx[df_tx["incomeType"] == "FUNDING_FEE"]
            .loc[:, ["income"]]
            .rename(columns={"income": "dollar_val"})
        )
        ff["transaction_type"] = "funding_fee"
        parts.append(ff)

        tr = (
            df_tx[df_tx["incomeType"] == "TRANSFER"]
            .loc[:, ["income"]]
            .rename(columns={"income": "dollar_val"})
        )
        tr["transaction_type"] = "transfer"
        parts.append(tr)

    if not df_er.empty:
        er = df_er.loc[:, ["rewards"]].rename(columns={"rewards": "dollar_val"})
        er["transaction_type"] = "earnings"
        parts.append(er)

    return parts


def _daily_pnl(parts: list[DataFrame]) -> Series:
    """Sum daily PnL from parts, excluding transfers."""
    if not parts:
        return pd.Series(dtype="float64")

    ledger: DataFrame = pd.concat(parts, axis=0, ignore_index=False).sort_index()
    ledger = ledger[ledger["transaction_type"] != "transfer"]

    # Ensure DatetimeIndex to satisfy resample's typing and avoid overload noise.
    ledger = ledger.copy()
    ledger.index = pd.DatetimeIndex(ledger.index)

    return ledger["dollar_val"].resample("D").sum()


def _equity_from_daily(daily: Series, opening_balance: float, start_day: pd.Timestamp) -> Series:
    """Build equity curve series from daily PnL and opening balance."""
    if not daily.empty:
        eq = daily.cumsum() + float(opening_balance)
    else:
        # Ensure a DatetimeIndex-present series even for no-activity accounts.
        eq = pd.Series([float(opening_balance)], index=[pd.Timestamp(start_day)])
    return eq


@overload
def _to_float_map(x: Mapping[str, float]) -> dict[str, float]: ...
@overload
def _to_float_map(x: Series) -> dict[str, float]: ...


def _to_float_map(x: Mapping[str, float] | Series) -> dict[str, float]:
    """Normalize dict/Series into dict[str, float] with concrete floats."""
    if isinstance(x, pd.Series):
        s = pd.Series(x, dtype="float64")
        return {str(k): float(v) for k, v in s.items()}
    # Mapping path
    return {str(k): float(v) for k, v in x.items()}


def _inject_upnl_inplace(
    bal: DataFrame, upnl: Mapping[str, float], accounts: Sequence[str]
) -> None:
    """Inject UPnL into the last row in-place and recompute 'total'."""
    if bal.empty or not accounts:
        return

    last_idx = bal.index[-1]
    cols = list(accounts)

    # Work with a one-row DataFrame to avoid Series|DataFrame ambiguity.
    row_df: DataFrame = bal.loc[[last_idx], cols]
    row_vals = row_df.astype("float64").to_numpy().ravel()

    add_vals = np.array([upnl.get(a, 0.0) for a in cols], dtype="float64")

    bal.loc[last_idx, cols] = row_vals + add_vals
    bal["total"] = bal[cols].sum(axis=1)


def compute_drawdown_mtd(*, override_accounts: list[str] | None = None) -> DrawdownResult:
    """Live MTD drawdown per account and combined (via 'total').

    UPnL is injected on the last day (margin view).
    """
    today = pd.Timestamp.today().date()
    start_day = today.replace(day=1)

    all_accounts: Sequence[str] = (
        override_accounts if override_accounts is not None else load_accounts(True)
    )

    # Use tz-naive month-open to match baseline. Normalize to plain floats.
    init_raw = load_day_open_balances(all_accounts, start_day, day_start_hour=0)
    init: dict[str, float] = {str(k): float(v) for k, v in init_raw.items()}
    accounts: list[str] = [a for a in all_accounts if a in init]

    eq_list: list[Series] = []

    for acc in accounts:
        df_tr: DataFrame = read_account_trades(
            acc, f"{start_day} 00:00:00", f"{today} 23:59:59"
        )
        df_tx: DataFrame = read_account_transactions(
            acc, f"{start_day} 00:00:00", f"{today} 23:59:59"
        )
        df_er: DataFrame = read_account_earnings(
            acc, f"{start_day} 00:00:00", f"{today} 23:59:59"
        )

        parts = _collect_parts(df_tr, df_tx, df_er)
        daily = _daily_pnl(parts)
        eq = _equity_from_daily(
            daily, opening_balance=float(init[acc]), start_day=pd.Timestamp(start_day)
        )
        eq.name = acc
        eq_list.append(eq)

    if not eq_list:
        return {"mtdDrawdown": {}, "accounts": accounts}

    bal: DataFrame = pd.concat(eq_list, axis=1).sort_index()

    # Seed the day before first datapoint, so returns/drawdown have a baseline.
    first_idx = bal.index[0]
    seed_idx = first_idx - pd.Timedelta(days=1)
    seed = DataFrame({a: float(init[a]) for a in accounts}, index=[seed_idx])

    bal = pd.concat([seed, bal], axis=0).sort_index()
    bal["total"] = bal[accounts].sum(axis=1)

    # Inject current UPnL on the latest timestamp.
    upnl_raw = read_upnl(accounts) or {}
    upnl: dict[str, float] = {str(k): float(v) for k, v in upnl_raw.items()}
    _inject_upnl_inplace(bal, upnl, accounts)

    # Compute returns and MTD drawdown.
    r = pct_returns(bal)
    mtd_dd_raw: Mapping[str, float] | Series = mtd_drawdown(r)
    mtd_map = _to_float_map(mtd_dd_raw)

    return {"mtdDrawdown": _truncate4_map(mtd_map), "accounts": list(bal.columns)}
