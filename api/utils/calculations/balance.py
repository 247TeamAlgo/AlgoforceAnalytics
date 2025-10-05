from __future__ import annotations

from typing import Dict, List, Tuple
from datetime import date

import pandas as pd
from sqlalchemy import text

from api.utils.io import (
    get_engine,
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
    read_account_trades,
    read_account_txn,
    read_account_earnings,
    read_upnl,
)
from api.utils.metrics import pct_returns, mtd_return, mtd_drawdown


# ---------- rounding / serialization ----------

def _round6(x: float) -> float:
    return float(round(float(x), 6))

def _serialize_balances_6dp(df: pd.DataFrame, accounts: List[str]) -> Dict[str, Dict[str, float]]:
    """
    Turn a (date-indexed) balance dataframe into:
    {
      "YYYY-mm-dd 00:00:00": {"fund2": 123.456789, "fund3": 456.123456, "total": 579.580245},
      ...
    }
    Total is recomputed from per-account parts (all rounded 6dp).
    """
    if df.empty:
        return {}
    out: Dict[str, Dict[str, float]] = {}
    accs = [a for a in accounts if a in df.columns]
    for ts, row in df[accs].sort_index().iterrows():
        key = str(ts)
        per = {a: _round6(row[a]) for a in accs}
        out[key] = {**per, "total": _round6(sum(per.values()))}
    return out


# ---------- helpers to reproduce CLI initial balance ----------

def _nearest_balance_before(account: str, start_ts: pd.Timestamp) -> Tuple[float, pd.Timestamp]:
    """
    From balance.{account}_balance, pick the nearest snapshot <= start_ts,
    else the first row (ascending). Returns (value, snapshot_time).
    """
    eng = get_engine()
    with eng.connect() as conn:
        # nearest <= start
        q1 = text(
            f"SELECT `{BALANCE_TIME_COLUMN}` AS ts, `{BALANCE_VALUE_COLUMN}` AS bal "
            f"FROM `{BALANCE_SCHEMA}`.`{account}_balance` "
            f"WHERE `{BALANCE_TIME_COLUMN}` <= :start "
            f"ORDER BY `{BALANCE_TIME_COLUMN}` DESC LIMIT 1"
        )
        df = pd.read_sql_query(q1, conn, params={"start": f"{start_ts:%Y-%m-%d %H:%M:%S}"})
        if not df.empty:
            ts = pd.to_datetime(df.loc[0, "ts"])
            bal = float(df.loc[0, "bal"])
            return bal, ts

        # fallback: first snapshot
        q2 = text(
            f"SELECT `{BALANCE_TIME_COLUMN}` AS ts, `{BALANCE_VALUE_COLUMN}` AS bal "
            f"FROM `{BALANCE_SCHEMA}`.`{account}_balance` "
            f"ORDER BY `{BALANCE_TIME_COLUMN}` ASC LIMIT 1"
        )
        df2 = pd.read_sql_query(q2, conn)
        if df2.empty:
            return 0.0, start_ts
        ts = pd.to_datetime(df2.loc[0, "ts"])
        bal = float(df2.loc[0, "bal"])
        return bal, ts


def _initial_balance_at_start(account: str, start_ts: pd.Timestamp) -> float:
    """
    Exact CLI logic:
      1) nearest balance snapshot <= start_ts
      2) ledger between (snapshot_time, start_ts) inclusive on start of range, exclusive at end
         using trades(net), funding_fee, earnings, transfers
      3) initial = nearest + sum(pre_start_deltas)
    """
    nearest_val, anchor_ts = _nearest_balance_before(account, start_ts)

    # build pre-start ledger
    start_str = f"{anchor_ts:%Y-%m-%d %H:%M:%S}"
    end_str   = f"{(start_ts - pd.Timedelta(seconds=1)):%Y-%m-%d %H:%M:%S}"

    if anchor_ts >= start_ts:
        return float(nearest_val)

    trades = read_account_trades(account, start_str, end_str)
    txn    = read_account_txn(account, start_str, end_str)
    earn   = read_account_earnings(account, start_str, end_str)

    pieces: List[pd.Series] = []

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
        s = pd.concat(pieces).sort_index()
        pre_sum = float(pd.to_numeric(s, errors="coerce").fillna(0.0).sum())

    return float(nearest_val) + pre_sum


# ---------- notebook-exact daily balance builder ----------

def _build_post_start_ledger_daily_end_with_transfers(
    account: str,
    *,
    start_ts: pd.Timestamp,
    end_ts_excl: pd.Timestamp,
    initial_value: float,
) -> pd.Series:
    """
    Include TRADES (realized - commission), FUNDING_FEE, EARNINGS, TRANSFER after start;
    running_balance = initial_value + cumsum(dollar_val);
    drop 'transfer' rows after computing running_balance; take LAST per UTC day.
    """
    start_str = f"{start_ts:%Y-%m-%d %H:%M:%S}"
    end_str   = f"{(end_ts_excl - pd.Timedelta(seconds=1)):%Y-%m-%d %H:%M:%S}"

    trades = read_account_trades(account, start_str, end_str)
    txn    = read_account_txn(account, start_str, end_str)
    earn   = read_account_earnings(account, start_str, end_str)

    pieces: List[pd.DataFrame] = []

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

    ledger = pd.concat(pieces, axis=0).sort_index()
    ledger["running_balance"] = float(initial_value) + ledger["dollar_val"].cumsum()

    no_transfer = ledger[ledger["transaction_type"] != "transfer"]

    daily = no_transfer.groupby(no_transfer.index.floor("D"))["running_balance"].last()
    daily.index = pd.to_datetime(daily.index)
    return daily.rename(account)


def build_day_end_balances_fixed(
    accounts: List[str],
    *,
    start_day: date,
    end_day: date,
) -> Tuple[pd.DataFrame, Dict[str, float]]:
    """
    Returns:
      - fixed (no uPnL) day-end balances (index=UTC days, columns=accounts) matching CLI/IPyNB end_balance
      - initial balances mapping (month-open anchor as computed by CLI)
    """
    start_ts = pd.Timestamp(f"{start_day} 00:00:00")
    end_ts_excl = pd.Timestamp(f"{end_day} 00:00:00") + pd.Timedelta(days=1)
    full_idx = pd.date_range(start_day, end_day, freq="D")

    init_map: Dict[str, float] = {}
    cols: List[pd.Series] = []

    for acc in accounts:
        # exact CLI initial @ start
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
            s = s.ffill().fillna(init_val)
        cols.append(s.rename(acc))

    bal = pd.concat(cols, axis=1) if cols else pd.DataFrame(index=full_idx, columns=accounts, dtype=float)
    return bal, init_map


def build_margin_last_day(
    fixed_balances: pd.DataFrame,
    accounts: List[str],
) -> pd.DataFrame:
    """
    Return a 1-row dataframe (last day only) with uPnL injected per account and a computed 'total'.
    """
    if fixed_balances.empty:
        return pd.DataFrame(columns=accounts + ["total"])
    last_day = fixed_balances.index[-1]
    upnl = read_upnl(accounts)
    row = {a: float(fixed_balances.at[last_day, a]) + float(upnl.get(a, 0.0)) for a in accounts}
    row["total"] = sum(row[a] for a in accounts)
    return pd.DataFrame([row], index=[last_day])


def compute_metrics_from_balances(
    fixed_balances: pd.DataFrame,
    accounts: List[str],
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float], Dict[str, float]]:
    """
    Compute MTD Return & Drawdown for both tracks:
      - fixed (REALIZED): no uPnL
      - margin (MARGIN):  uPnL injected on the last day only
    Includes 'total' column/keys, matching CLI.
    """
    if fixed_balances.empty:
        return {}, {}, {}, {}

    # REALIZED track
    fixed = fixed_balances.copy()
    fixed["total"] = fixed[accounts].sum(axis=1)

    # MARGIN track (uPnL injected on last day)
    margin = fixed.copy()
    last = fixed.index[-1]
    upnl = read_upnl(accounts)
    for a in accounts:
        margin.at[last, a] = float(margin.at[last, a]) + float(upnl.get(a, 0.0))
    margin["total"] = margin[accounts].sum(axis=1)

    # Returns & drawdown
    r_fixed = pct_returns(fixed)
    r_margin = pct_returns(margin)

    mret_fixed  = {k: _round6(v) for k, v in mtd_return(fixed).items()}
    mret_margin = {k: _round6(v) for k, v in mtd_return(margin).items()}
    mdd_fixed   = {k: _round6(v) for k, v in mtd_drawdown(r_fixed).items()}
    mdd_margin  = {k: _round6(v) for k, v in mtd_drawdown(r_margin).items()}
    return mret_fixed, mdd_fixed, mret_margin, mdd_margin
