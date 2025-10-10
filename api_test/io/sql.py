# path: api/io/sql.py
"""SQL I/O helpers for trades, transactions, earnings, and balance schema metadata."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime, timedelta
from typing import TypeAlias

import pandas as pd
from pandas import DataFrame, Series
from sqlalchemy import text
from sqlalchemy.engine import Connection

from api_test.core.config import (
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
    get_engine,
)

__all__ = [
    "BALANCE_SCHEMA",
    "BALANCE_TIME_COLUMN",
    "BALANCE_VALUE_COLUMN",
    "get_engine",
    "read_account_trades",
    "read_account_txn",
    "read_account_earnings",
]

SQLScalar: TypeAlias = (
    str
    | bytes
    | date
    | datetime
    | timedelta
    | pd.Timestamp
    | pd.Timedelta
    | bool
    | int
    | float
    | complex
)
SQLParamsMapping: TypeAlias = Mapping[str, SQLScalar] | Mapping[str, tuple[SQLScalar, ...]]


def _sql_to_df(
    conn: Connection, sql_stmt: str, params: SQLParamsMapping | None = None
) -> DataFrame:
    """Execute SQL and return a DataFrame using RowMapping to dict conversion."""
    res = conn.execute(text(sql_stmt), params or {})
    try:
        cols = list(res.keys())
        mappings = res.mappings().all()
        if not mappings:
            return DataFrame(columns=cols)
        rows: list[Mapping[str, object]] = [dict(m) for m in mappings]
        return pd.DataFrame(rows, columns=cols)
    finally:
        res.close()


def _to_indexed(df: DataFrame, time_col: str) -> DataFrame:
    """Return a copy indexed by a parsed datetime column, sorted ascending."""
    if df.empty:
        return df
    tmp: DataFrame = df.copy()
    tmp[time_col] = pd.to_datetime(tmp[time_col], errors="coerce")
    no_na: DataFrame = tmp.dropna(subset=[time_col])
    sorted_df: DataFrame = no_na.sort_values(time_col)
    indexed: DataFrame = sorted_df.set_index(time_col)
    return indexed


def _to_numeric_filled(s: Series) -> Series:
    """Convert to numeric with NaN→0.0."""
    numeric = pd.to_numeric(s, errors="coerce")
    return numeric.fillna(0.0)


def read_account_trades(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Read trades for an account in a time window and normalize realizedPnl minus commission."""
    eng = get_engine()
    sql_stmt = (
        "SELECT symbol, id, orderId, side, price, qty, realizedPnl, commission, time, positionSide "
        f"FROM `{account}` WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df: DataFrame = _sql_to_df(conn, sql_stmt, {"start": start_dt, "end": end_dt})

    if df.empty:
        empty = DataFrame(
            columns=[
                "symbol",
                "id",
                "orderId",
                "side",
                "price",
                "qty",
                "realizedPnl",
                "commission",
                "positionSide",
                "account",
            ],
        ).set_index(pd.DatetimeIndex([], name="time"))
        return empty

    indexed: DataFrame = _to_indexed(df, "time")
    pnl: Series = _to_numeric_filled(indexed["realizedPnl"])
    fee: Series = _to_numeric_filled(indexed["commission"])
    indexed["realizedPnl"] = pnl - fee
    indexed["account"] = account
    return indexed


def read_account_txn(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Read funding fees and transfers for an account from transaction history."""
    eng = get_engine()
    sql_stmt = (
        "SELECT incomeType, income, time "
        f"FROM `transaction_history`.`{account}_transaction` "
        "WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df: DataFrame = _sql_to_df(conn, sql_stmt, {"start": start_dt, "end": end_dt})

    if df.empty:
        return DataFrame(columns=["incomeType", "income"]).set_index(
            pd.DatetimeIndex([], name="time")
        )

    indexed: DataFrame = _to_indexed(df, "time")
    indexed["incomeType"] = indexed["incomeType"].astype(str)
    indexed["income"] = _to_numeric_filled(indexed["income"])
    return indexed


def read_account_earnings(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Read earnings (e.g., rewards) for an account in a time window."""
    eng = get_engine()
    sql_stmt = (
        "SELECT rewards, time "
        f"FROM `earnings`.`{account}_earnings` "
        "WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df: DataFrame = _sql_to_df(conn, sql_stmt, {"start": start_dt, "end": end_dt})

    if df.empty:
        return DataFrame(columns=["rewards"]).set_index(pd.DatetimeIndex([], name="time"))

    indexed: DataFrame = _to_indexed(df, "time")
    indexed["rewards"] = _to_numeric_filled(indexed["rewards"])
    return indexed
