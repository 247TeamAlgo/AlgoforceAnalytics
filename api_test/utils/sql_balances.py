# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\index.py
"""Build day-end balances and compute related metrics."""


from __future__ import annotations

from datetime import date
from typing import SupportsFloat, cast

import pandas as pd
from sqlalchemy import text

from api_test.utils.io import (
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
    get_engine,
    read_account_earnings,
    read_account_trades,
    read_account_txn,
    read_upnl,
)
from api_test.utils.metrics import mtd_drawdown, mtd_return, pct_returns

__all__ = [
    "round6",
    "serialize_balances_6dp",
    "build_day_end_balances_fixed",
    "build_margin_last_day",
    "compute_metrics_from_balances",
]


def round6(x: float) -> float:
    """Round a float to 6 decimal places."""
    return float(round(float(x), 6))


def serialize_balances_6dp(df: pd.DataFrame, accounts: list[str]) -> dict[str, dict[str, float]]:
    """Serialize a date-indexed balance DataFrame to a nested dict.

    {
      "YYYY-mm-dd 00:00:00": {"fund2": 123.456789, "fund3": 456.123456, "total": 579.580245},
      ...
    }
    Total is recomputed from per-account parts (all rounded 6 dp).
    """
    if df.empty:
        return {}
    out: dict[str, dict[str, float]] = {}
    accs = [a for a in accounts if a in df.columns]
    for ts, row in df[accs].sort_index().iterrows():
        key = str(ts)
        per = {a: round6(float(row[a])) for a in accs}
        out[key] = {**per, "total": round6(sum(per.values()))}
    return out


def _nearest_balance_before(account: str, start_ts: pd.Timestamp) -> tuple[float, pd.Timestamp]:
    """Pick the nearest snapshot <= start_ts; fallback to first row if none."""
    eng = get_engine()
    with eng.connect() as conn:
        q1 = text(
            f"SELECT `{BALANCE_TIME_COLUMN}` AS ts, `{BALANCE_VALUE_COLUMN}` AS bal "
            f"FROM `{BALANCE_SCHEMA}`.`{account}_balance` "
            f"WHERE `{BALANCE_TIME_COLUMN}` <= :start "
            f"ORDER BY `{BALANCE_TIME_COLUMN}` DESC LIMIT 1"
        )
        df: pd.DataFrame = pd.read_sql_query(  # pyright: ignore[reportUnknownMemberType]
            q1,
            conn,
            params={"start": f"{start_ts:%Y-%m-%d %H:%M:%S}"},
            parse_dates=["ts"],
            chunksize=None,
        )
        if not df.empty:
            ts_val = cast(pd.Timestamp, df.at[0, "ts"])
            bal_val = float(cast(SupportsFloat, df.at[0, "bal"]))
            return bal_val, ts_val

        q2 = text(
            f"SELECT `{BALANCE_TIME_COLUMN}` AS ts, `{BALANCE_VALUE_COLUMN}` AS bal "
            f"FROM `{BALANCE_SCHEMA}`.`{account}_balance` "
            f"ORDER BY `{BALANCE_TIME_COLUMN}` ASC LIMIT 1"
        )
        df2: pd.DataFrame = pd.read_sql_query(  # pyright: ignore[reportUnknownMemberType]
            q2, conn, parse_dates=["ts"], chunksize=None
        )
        if df2.empty:
            return 0.0, start_ts
        ts2_val = cast(pd.Timestamp, df2.at[0, "ts"])
        bal2_val = float(cast(SupportsFloat, df2.at[0, "bal"]))
        return bal2_val, ts2_val


def _initial_balance_at_start(account: str, start_ts: pd.Timestamp) -> float:
    """Reconstruct initial balance at start_ts from snapshot plus pre-start deltas."""
    nearest_val, anchor_ts = _nearest_balance_before(account, start_ts)

    start_str = f"{anchor_ts:%Y-%m-%d %H:%M:%S}"
    end_str = f"{(start_ts - pd.Timedelta(seconds=1)):%Y-%m-%d %H:%M:%S}"

    if anchor_ts >= start_ts:
        return float(nearest_val)

    trades = read_account_trades(account, start_str, end_str)
    txn = read_account_txn(account, start_str, end_str)
    earn = read_account_earnings(account, start_str, end_str)

    pieces: list[pd.Series] = []

    if not trades.empty:
        pieces.append(trades["realizedPnl"])

    if not txn.empty:
        it = txn["incomeType"].str.upper()
        if it.eq("TRANSFER").any():
            pieces.append(txn.loc[it.eq("TRANSFER"), "income"])
        if it.eq("FUNDING_FEE").any():
            pieces.append(txn.loc[it.eq("FUNDING_FEE"), "income"])

    if not earn.empty:
        pieces.append(earn["rewards"])

    pre_sum = 0.0
    if pieces:
        s: pd.Series = pd.concat(pieces).sort_index()
        ss: pd.Series = pd.to_numeric(s, errors="coerce")  # pyright: ignore[reportUnknownMemberType]
        pre_sum = float(ss.sum(skipna=True))

    return float(nearest_val) + pre_sum


def _build_post_start_ledger_daily_end_with_transfers(
    account: str,
    *,
    start_ts: pd.Timestamp,
    end_ts_excl: pd.Timestamp,
    initial_value: float,
) -> pd.Series:
    """Build daily end-of-day balances (exclude transfers in daily buckets)."""
    start_str = f"{start_ts:%Y-%m-%d %H:%M:%S}"
    end_str = f"{(end_ts_excl - pd.Timedelta(seconds=1)):%Y-%m-%d %H:%M:%S}"

    trades = read_account_trades(account, start_str, end_str)
    txn = read_account_txn(account, start_str, end_str)
    earn = read_account_earnings(account, start_str, end_str)

    pieces: list[pd.DataFrame] = []

    if not trades.empty:
        t = trades[["realizedPnl"]].rename(columns={"realizedPnl": "dollar_val"})
        t["transaction_type"] = "realizedPnl"
        pieces.append(t)

    if not txn.empty:
        it = txn["incomeType"].str.upper()
        if it.eq("TRANSFER").any():
            tr = txn.loc[it.eq("TRANSFER"), ["income"]].rename(columns={"income": "dollar_val"})
            tr["transaction_type"] = "transfer"
            pieces.append(tr)
        if it.eq("FUNDING_FEE").any():
            ff = txn.loc[it.eq("FUNDING_FEE"), ["income"]].rename(columns={"income": "dollar_val"})
            ff["transaction_type"] = "funding_fee"
            pieces.append(ff)

    if not earn.empty:
        e = earn[["rewards"]].rename(columns={"rewards": "dollar_val"})
        e["transaction_type"] = "earnings"
        pieces.append(e)

    if not pieces:
        return pd.Series([], dtype=float, name=account)

    ledger: pd.DataFrame = pd.concat(pieces, axis=0).sort_index()
    # Ensure DatetimeIndex for downstream resampling (and for Pylance's benefit).
    ledger.index = pd.to_datetime(ledger.index, utc=False)
    ledger = ledger.sort_index()
    ledger["running_balance"] = float(initial_value) + ledger["dollar_val"].cumsum()

    no_transfer = ledger[ledger["transaction_type"] != "transfer"]
    series: pd.Series = no_transfer["running_balance"]
    daily: pd.Series = series.resample("D").last()
    daily.index = pd.to_datetime(daily.index)
    return daily.rename(account)


def build_day_end_balances_fixed(
    accounts: list[str],
    *,
    start_day: date,
    end_day: date,
) -> tuple[pd.DataFrame, dict[str, float]]:
    """Build fixed (no uPnL) end-of-day balances and initial map for the MTD window."""
    start_ts = pd.Timestamp(f"{start_day} 00:00:00")
    end_ts_excl = pd.Timestamp(f"{end_day} 00:00:00") + pd.Timedelta(days=1)
    full_idx = pd.date_range(start_day, end_day, freq="D")

    init_map: dict[str, float] = {}
    cols: list[pd.Series] = []

    for acc in accounts:
        init_val = _initial_balance_at_start(acc, start_ts)
        init_map[acc] = init_val

        s = _build_post_start_ledger_daily_end_with_transfers(
            acc, start_ts=start_ts, end_ts_excl=end_ts_excl, initial_value=init_val
        )
        if s.empty:
            s = pd.Series(init_val, index=full_idx, name=acc)
        else:
            s = s.reindex(full_idx)
            s.iloc[0] = s.iloc[0] if pd.notna(s.iloc[0]) else init_val
            s = s.ffill()
            s = s.where(pd.notna(s), other=float(init_val))
        cols.append(s.rename(acc))

    bal = (
        pd.concat(cols, axis=1)
        if cols
        else pd.DataFrame(index=full_idx, columns=accounts, dtype=float)
    )
    return bal, init_map


def build_margin_last_day(
    fixed_balances: pd.DataFrame,
    accounts: list[str],
) -> pd.DataFrame:
    """Return a 1-row DataFrame (last day only) with uPnL injected and total recomputed."""
    if fixed_balances.empty:
        return pd.DataFrame(columns=[*accounts, "total"])
    last_day = fixed_balances.index[-1]
    upnl = read_upnl(accounts)
    row = {
        a: float(cast(SupportsFloat, fixed_balances.at[last_day, a])) + float(upnl.get(a, 0.0))
        for a in accounts
    }
    row["total"] = sum(row[a] for a in accounts)
    return pd.DataFrame([row], index=[last_day])


def compute_metrics_from_balances(
    fixed_balances: pd.DataFrame, accounts: list[str]
) -> tuple[dict[str, float], dict[str, float], dict[str, float], dict[str, float]]:
    """Compute MTD Return & Drawdown for both tracks (fixed, margin), including totals."""
    if fixed_balances.empty:
        return {}, {}, {}, {}

    fixed = fixed_balances.copy()
    fixed["total"] = fixed[accounts].sum(axis=1)

    margin = fixed.copy()
    last = fixed.index[-1]
    upnl = read_upnl(accounts)
    for a in accounts:
        current = float(cast(SupportsFloat, margin.at[last, a]))
        margin.at[last, a] = current + float(upnl.get(a, 0.0))
    margin["total"] = margin[accounts].sum(axis=1)

    r_fixed = pct_returns(fixed)
    r_margin = pct_returns(margin)

    mret_fixed = {k: round6(v) for k, v in mtd_return(fixed).items()}
    mret_margin = {k: round6(v) for k, v in mtd_return(margin).items()}
    mdd_fixed = {k: round6(v) for k, v in mtd_drawdown(r_fixed).items()}
    mdd_margin = {k: round6(v) for k, v in mtd_drawdown(r_margin).items()}
    return mret_fixed, mdd_fixed, mret_margin, mdd_margin
