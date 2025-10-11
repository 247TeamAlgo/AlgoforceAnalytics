# api/db/sql.py
"""SQL readers and helpers (type-checker and linter friendly)."""

from __future__ import annotations

from collections.abc import Mapping

import pandas as pd
from pandas import DataFrame
from sqlalchemy import text
from sqlalchemy.engine import Connection

from ..core.config import (
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
    get_engine,
)


def _sql_to_df(
    conn: Connection, stmt: str, params: Mapping[str, object] | None = None
) -> DataFrame:
    """Execute SQL and materialize a DataFrame."""
    q = text(stmt)
    res = conn.execute(q, params or {})
    try:
        cols = list(res.keys())
        rows = [dict(m) for m in res.mappings().all()]
        return pd.DataFrame(rows, columns=cols)
    finally:
        res.close()


def _coerce_float(x: object) -> float:
    """Robust scalar→float conversion that keeps type checkers quiet."""
    if isinstance(x, int | float):
        return float(x)
    try:
        s = pd.Series([x])
        v = pd.to_numeric(s, errors="coerce").iloc[0]
        return float(v) if pd.notna(v) else 0.0
    except Exception:
        return 0.0


def _coerce_ts(x: object, *, default: pd.Timestamp) -> pd.Timestamp:
    """Coerce a single value to pd.Timestamp; fallback to provided default.

    Uses a Series-based path to satisfy pandas-stubs overloads for to_datetime.
    """
    try:
        s = pd.Series([x])
        ts_series = pd.to_datetime(s, errors="coerce")
        ts0 = ts_series.iloc[0]
        if isinstance(ts0, pd.Timestamp) and not pd.isna(ts0):
            return ts0
    except Exception:
        pass
    return default


def nearest_balance_on_or_before(
    account: str, start_ts: pd.Timestamp
) -> tuple[float, pd.Timestamp]:
    """Return (balance, timestamp) for nearest snapshot <= start_ts; fallback to earliest."""
    eng = get_engine()
    with eng.connect() as conn:
        q1 = (
            f"SELECT `{BALANCE_TIME_COLUMN}` AS ts, `{BALANCE_VALUE_COLUMN}` AS bal "
            f"FROM `{BALANCE_SCHEMA}`.`{account}_balance` "
            f"WHERE `{BALANCE_TIME_COLUMN}` <= :start "
            f"ORDER BY `{BALANCE_TIME_COLUMN}` DESC LIMIT 1"
        )
        df = _sql_to_df(conn, q1, {"start": f"{start_ts:%Y-%m-%d %H:%M:%S}"})
        if not df.empty:
            bal = _coerce_float(df.at[0, "bal"])
            ts = _coerce_ts(df.at[0, "ts"], default=start_ts)
            return bal, ts

        q2 = (
            f"SELECT `{BALANCE_TIME_COLUMN}` AS ts, `{BALANCE_VALUE_COLUMN}` AS bal "
            f"FROM `{BALANCE_SCHEMA}`.`{account}_balance` "
            f"ORDER BY `{BALANCE_TIME_COLUMN}` ASC LIMIT 1"
        )
        df2 = _sql_to_df(conn, q2)
        if df2.empty:
            return 0.0, start_ts
        bal2 = _coerce_float(df2.at[0, "bal"])
        ts2 = _coerce_ts(df2.at[0, "ts"], default=start_ts)
        return bal2, ts2


def read_trades(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Trades with realizedPnl net of commission; index=time."""
    eng = get_engine()
    sql = (
        "SELECT symbol, id, orderId, side, price, qty, realizedPnl, commission, time, positionSide "
        f"FROM `{account}` WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df = _sql_to_df(conn, sql, {"start": start_dt, "end": end_dt})
    if df.empty:
        return DataFrame(columns=["symbol", "realizedPnl"]).set_index(
            pd.DatetimeIndex([], name="time"),
        )
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"]).set_index("time").sort_index()
    pnl = pd.to_numeric(df["realizedPnl"], errors="coerce").fillna(0.0)
    fee = pd.to_numeric(df["commission"], errors="coerce").fillna(0.0)
    df["realizedPnl"] = pnl - fee
    return df


def read_transactions(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Transaction history: incomeType, income, time; index=time."""
    eng = get_engine()
    sql = (
        "SELECT incomeType, income, time "
        f"FROM `transaction_history`.`{account}_transaction` "
        "WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df = _sql_to_df(conn, sql, {"start": start_dt, "end": end_dt})
    if df.empty:
        return DataFrame(columns=["incomeType", "income"]).set_index(
            pd.DatetimeIndex([], name="time"),
        )
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"]).set_index("time").sort_index()
    df["income"] = pd.to_numeric(df["income"], errors="coerce").fillna(0.0)
    df["incomeType"] = df["incomeType"].astype(str)
    return df


def read_earnings(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Earnings (rewards, time); index=time."""
    eng = get_engine()
    sql = (
        "SELECT rewards, time "
        f"FROM `earnings`.`{account}_earnings` "
        "WHERE time >= :start AND time <= :end"
    )
    with eng.connect() as conn:
        df = _sql_to_df(conn, sql, {"start": start_dt, "end": end_dt})
    if df.empty:
        return DataFrame(columns=["rewards"]).set_index(pd.DatetimeIndex([], name="time"))
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"]).set_index("time").sort_index()
    df["rewards"] = pd.to_numeric(df["rewards"], errors="coerce").fillna(0.0)
    return df
