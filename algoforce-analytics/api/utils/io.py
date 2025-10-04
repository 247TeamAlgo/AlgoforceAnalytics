# algoforce-analytics/api/utils/io.py
from __future__ import annotations

import json
from functools import lru_cache
from typing import Dict, List, Any, Optional
from datetime import date, datetime, timedelta

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Connection

from .config import (
    ACCOUNTS_JSON_PATH,
    ACCOUNT_KEY_FIELD,
    get_engine,
    get_redis,
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
)

# ---------------- Accounts metadata ----------------

@lru_cache(maxsize=1)
def load_accounts(monitored_only: bool = True) -> List[str]:
    with open(ACCOUNTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("accounts file must be a list")
    keys: List[str] = []
    for a in data:
        if not isinstance(a, dict):
            continue
        if monitored_only and not a.get("monitored", False):
            continue
        key = a.get(ACCOUNT_KEY_FIELD)
        if isinstance(key, str) and key:
            keys.append(key)
    return keys

@lru_cache(maxsize=1)
def load_accounts_info() -> List[Dict[str, Any]]:
    with open(ACCOUNTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("accounts file must be a list of objects")
    return data

# ---------------- Balance seed (DB only) ----------------

def _column_exists(conn: Connection, schema: str, table: str, column: str) -> bool:
    sql = text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = :schema AND table_name = :table AND column_name = :column
        LIMIT 1
    """)
    row = conn.execute(sql, {"schema": schema, "table": table, "column": column}).first()
    return row is not None

def _fetch_month_open_for_balance_table(
    conn: Connection,
    schema: str,
    table: str,
    time_col: str,
    balance_expr_sql: str,  # raw validated SQL expr (column or sum of columns)
    start_ts_utc: str,      # "YYYY-mm-dd HH:MM:SS"
    end_ts_utc: str,        # "YYYY-mm-dd HH:MM:SS"
) -> Optional[float]:
    # Earliest on the (UTC) window
    q1 = text(f"""
        SELECT {balance_expr_sql} AS bal
        FROM `{schema}`.`{table}`
        WHERE `{time_col}` >= :start AND `{time_col}` <= :end
        ORDER BY `{time_col}` ASC
        LIMIT 1
    """)
    df = pd.read_sql_query(q1, conn, params={"start": start_ts_utc, "end": end_ts_utc})
    if not df.empty:
        v = pd.to_numeric(df["bal"], errors="coerce").dropna()
        if not v.empty:
            return float(v.iloc[0])

    # Last before the window
    q2 = text(f"""
        SELECT {balance_expr_sql} AS bal
        FROM `{schema}`.`{table}`
        WHERE `{time_col}` < :start
        ORDER BY `{time_col}` DESC
        LIMIT 1
    """)
    df2 = pd.read_sql_query(q2, conn, params={"start": start_ts_utc})
    if not df2.empty:
        v = pd.to_numeric(df2["bal"], errors="coerce").dropna()
        if not v.empty:
            return float(v.iloc[0])

    return None

def load_day_open_balances(accounts: List[str], day: date, day_start_hour: int = 0) -> Dict[str, float]:
    """
    Month-open equity anchor:
      - 'day' is the local month-open day (e.g., 2025-10-01).
      - 'day_start_hour' is the local-to-UTC offset in hours (0 for UTC).
      - Prefer earliest balance on [local 00:00, local 23:59:59] converted to UTC;
        otherwise last balance strictly before local 00:00 UTC.
    """
    eng = get_engine()
    out: Dict[str, float] = {}

    # Convert local window to UTC strings
    local_start = datetime(day.year, day.month, day.day, 0, 0, 0)
    utc_start = local_start - timedelta(hours=day_start_hour)
    utc_end = utc_start + timedelta(days=1) - timedelta(seconds=1)
    start_ts_utc = utc_start.strftime("%Y-%m-%d %H:%M:%S")
    end_ts_utc = utc_end.strftime("%Y-%m-%d %H:%M:%S")

    with eng.connect() as conn:
        for acc in accounts:
            table = f"{acc}_balance"

            # Ensure time column exists
            if not _column_exists(conn, BALANCE_SCHEMA, table, BALANCE_TIME_COLUMN):
                continue

            # Prefer explicit overall_balance; fallback to sum of components
            if _column_exists(conn, BALANCE_SCHEMA, table, BALANCE_VALUE_COLUMN):
                balance_expr = f"`{BALANCE_VALUE_COLUMN}`"
            else:
                components = ["earn_balance", "spot_balance", "futures_balance"]
                if not all(_column_exists(conn, BALANCE_SCHEMA, table, c) for c in components):
                    continue
                balance_expr = "`earn_balance` + `spot_balance` + `futures_balance`"

            val = _fetch_month_open_for_balance_table(
                conn=conn,
                schema=BALANCE_SCHEMA,
                table=table,
                time_col=BALANCE_TIME_COLUMN,
                balance_expr_sql=balance_expr,
                start_ts_utc=start_ts_utc,
                end_ts_utc=end_ts_utc,
            )
            if val is not None:
                out[acc] = float(val)

    return out

# ---------------- Trades / Txn / Earnings / UPnL ----------------

def _to_indexed(df: pd.DataFrame, time_col: str) -> pd.DataFrame:
    if df.empty:
        return df
    df[time_col] = pd.to_datetime(df[time_col], errors="coerce")
    df = df.dropna(subset=[time_col]).sort_values(time_col).set_index(time_col)
    return df

def read_account_trades(account: str, start_dt: str, end_dt: str) -> pd.DataFrame:
    """
    Trades: realizedPnl net of commission, indexed by 'time' (UTC-naive).
    """
    eng = get_engine()
    sql = (
        "SELECT symbol, id, orderId, side, price, qty, realizedPnl, commission, time, positionSide "
        f"FROM `{account}` WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df = pd.read_sql_query(text(sql), conn, params={"start": start_dt, "end": end_dt})

    if df.empty:
        return pd.DataFrame(
            columns=[
                "symbol","id","orderId","side","price","qty",
                "realizedPnl","commission","positionSide","account",
            ],
        ).set_index(pd.DatetimeIndex([], name="time"))

    df = _to_indexed(df, "time")
    to_num = lambda s: pd.to_numeric(s, errors="coerce").fillna(0.0)
    df["realizedPnl"] = to_num(df["realizedPnl"]) - to_num(df["commission"])
    df["account"] = account
    return df

def read_account_txn(account: str, start_dt: str, end_dt: str) -> pd.DataFrame:
    """
    Transaction history from `transaction_history.{account}_transaction`
    Columns used: incomeType (str), income (float), time (datetime index).
    """
    eng = get_engine()
    sql = (
        f"SELECT incomeType, income, time "
        f"FROM `transaction_history`.`{account}_transaction` "
        f"WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df = pd.read_sql_query(text(sql), conn, params={"start": start_dt, "end": end_dt})
    if df.empty:
        return pd.DataFrame(columns=["incomeType", "income"]).set_index(
            pd.DatetimeIndex([], name="time")
        )
    df = _to_indexed(df, "time")
    df["incomeType"] = df["incomeType"].astype(str)
    df["income"] = pd.to_numeric(df["income"], errors="coerce").fillna(0.0)
    return df

def read_account_earnings(account: str, start_dt: str, end_dt: str) -> pd.DataFrame:
    """
    Earnings from `earnings.{account}_earnings`
    Columns used: rewards (float), time (datetime index).
    """
    eng = get_engine()
    sql = (
        f"SELECT rewards, time "
        f"FROM `earnings`.`{account}_earnings` "
        f"WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df = pd.read_sql_query(text(sql), conn, params={"start": start_dt, "end": end_dt})
    if df.empty:
        return pd.DataFrame(columns=["rewards"]).set_index(
            pd.DatetimeIndex([], name="time")
        )
    df = _to_indexed(df, "time")
    df["rewards"] = pd.to_numeric(df["rewards"], errors="coerce").fillna(0.0)
    return df

def read_upnl(accounts: List[str]) -> Dict[str, float]:
    """
    Redis keys: '{account}_live' JSON with 'unrealizedProfit' per row.
    """
    r = get_redis()
    keys = [f"{acc}_live" for acc in accounts]
    raws = r.mget(keys) if keys else []

    out: Dict[str, float] = {}
    total = 0.0
    for acc, raw in zip(accounts, raws):
        if not raw:
            out[acc] = 0.0
            continue
        try:
            df = pd.DataFrame(json.loads(raw))
            val = float(pd.to_numeric(df.get("unrealizedProfit", 0.0), errors="coerce").fillna(0.0).sum()) if not df.empty else 0.0
        except Exception:
            val = 0.0
        out[acc] = val
        total += val
    if accounts:
        out["total"] = total
    return out
