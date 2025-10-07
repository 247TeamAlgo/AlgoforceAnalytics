# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\io.py
"""DB/Redis I/O helpers for accounts, balances, trades, transactions, earnings, and uPnL.

This module centralizes:
- Account metadata loading from JSON.
- Initial day-open balance anchors from SQL tables.
- Trades / transactions / earnings readers.
- Real-time unrealized PnL aggregation from Redis.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import TypeAlias, cast

import pandas as pd
from pandas import DataFrame, Series
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.sql.elements import TextClause

from .config import (
    ACCOUNT_KEY_FIELD,
    ACCOUNTS_JSON_PATH,
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
    get_engine,
    get_redis,
)

__all__ = [
    "load_accounts",
    "load_accounts_info",
    "load_day_open_balances",
    "read_account_trades",
    "read_account_txn",
    "read_account_earnings",
    "read_upnl",
    "read_account_transactions",
]


# ---------------- Types ----------------

# Keep in sync with pandas-stubs Scalar union closely enough for Pyright.
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


# ---------------- Internal helpers (typed wrappers) ----------------


def _sql_to_df(
    conn: Connection,
    sql_stmt: TextClause,
    params: SQLParamsMapping | None = None,
) -> DataFrame:
    """Run the SQL and materialize a DataFrame without pandas' SQL overloads."""
    result = conn.execute(sql_stmt, params or {})
    try:
        cols = list(result.keys())
        mappings = result.mappings().all()  # list[RowMapping]
        if not mappings:
            return DataFrame(columns=cols)
        # Convert RowMapping -> dict; annotate as Mapping for pandas stubs.
        rows: list[Mapping[str, object]] = [dict(m) for m in mappings]
        return pd.DataFrame(rows, columns=cols)
    finally:
        result.close()


def _pd_to_numeric_series(s: Series) -> Series:
    """Typed shim over pandas.to_numeric for Series -> Series."""
    res = pd.to_numeric(  # type: ignore[reportUnknownMemberType]
        s, errors="coerce", downcast=None
    )
    return res


def _series_fillna_float(s: Series, val: float) -> Series:
    """Typed shim for Series.fillna returning Series."""
    return s.fillna(val)  # type: ignore[reportUnknownMemberType]


def _df_dropna_subset(df: DataFrame, subset: list[str]) -> DataFrame:
    """Typed shim for DataFrame.dropna with subset, returning DataFrame."""
    return df.dropna(subset=subset)  # type: ignore[reportUnknownMemberType]


def _coerce_numeric_series(s: Series) -> Series:
    """Coerce to numeric (NaN on failure) and ensure float64 dtype."""
    coerced = _pd_to_numeric_series(s)
    return coerced.astype("float64", copy=False)


def _to_numeric_filled(s: Series) -> Series:
    """Coerce a Series to numeric, replacing NaN with 0.0 (float64)."""
    numeric = _coerce_numeric_series(s)
    return _series_fillna_float(numeric, 0.0)


def _to_indexed(df: DataFrame, time_col: str) -> DataFrame:
    """Return a dataframe indexed by a parsed datetime column, sorted ascending."""
    if df.empty:
        return df
    tmp: DataFrame = df.copy()
    tmp[time_col] = pd.to_datetime(tmp[time_col], errors="coerce")
    no_na: DataFrame = _df_dropna_subset(tmp, [time_col])
    sorted_df: DataFrame = no_na.sort_values(time_col)
    indexed: DataFrame = sorted_df.set_index(time_col)
    return indexed


# ---------------- Accounts metadata ----------------


@lru_cache(maxsize=1)
def load_accounts(monitored_only: bool = True) -> list[str]:
    """Return cached list of account keys (e.g., redisName) from accounts.json.

    If ``monitored_only`` is True, filter to items with ``"monitored": true``.
    """
    with open(ACCOUNTS_JSON_PATH, encoding="utf-8") as f:
        raw_obj = json.load(f)

    if not isinstance(raw_obj, list):
        raise ValueError("accounts file must be a list")

    raw_list: list[object] = cast(list[object], raw_obj)

    records: list[dict[str, object]] = []
    for o in raw_list:
        if isinstance(o, dict):
            item: dict[str, object] = cast(dict[str, object], o)
            records.append(item)

    keys: list[str] = []
    for item in records:
        if monitored_only and not bool(item.get("monitored", False)):
            continue
        key_val = item.get(ACCOUNT_KEY_FIELD)
        if isinstance(key_val, str):
            keys.append(key_val)
    return keys


@lru_cache(maxsize=1)
def load_accounts_info() -> list[dict[str, object]]:
    """Return the full cached account objects from accounts.json."""
    with open(ACCOUNTS_JSON_PATH, encoding="utf-8") as f:
        raw_obj = json.load(f)

    if not isinstance(raw_obj, list):
        raise ValueError("accounts file must be a list of objects")

    raw_list: list[object] = cast(list[object], raw_obj)

    data_list: list[dict[str, object]] = []
    for o in raw_list:
        if isinstance(o, dict):
            item: dict[str, object] = cast(dict[str, object], o)
            data_list.append(item)

    return data_list


# ---------------- Balance seed (DB only) ----------------


def _column_exists(conn: Connection, schema: str, table: str, column: str) -> bool:
    """Return True if a column exists in the given schema.table."""
    sql_stmt = text(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = :schema
          AND table_name   = :table
          AND column_name  = :column
        LIMIT 1
        """
    )
    row = conn.execute(sql_stmt, {"schema": schema, "table": table, "column": column}).first()
    return row is not None


def _fetch_month_open_for_balance_table(
    conn: Connection,
    schema: str,
    table: str,
    time_col: str,
    balance_expr_sql: str,
    start_ts_utc: str,
    end_ts_utc: str,
) -> float | None:
    """Get the day-open balance from first in-window row or last pre-window row."""
    # Earliest in-window
    q1 = text(
        f"""
        SELECT {balance_expr_sql} AS bal
        FROM `{schema}`.`{table}`
        WHERE `{time_col}` >= :start
          AND `{time_col}` <= :end
        ORDER BY `{time_col}` ASC
        LIMIT 1
        """
    )
    df1: DataFrame = _sql_to_df(conn, q1, {"start": start_ts_utc, "end": end_ts_utc})
    if not df1.empty:
        v1: Series = _coerce_numeric_series(df1["bal"]).dropna()
        if not v1.empty:
            return float(v1.iloc[0])

    # Last before start
    q2 = text(
        f"""
        SELECT {balance_expr_sql} AS bal
        FROM `{schema}`.`{table}`
        WHERE `{time_col}` < :start
        ORDER BY `{time_col}` DESC
        LIMIT 1
        """
    )
    df2: DataFrame = _sql_to_df(conn, q2, {"start": start_ts_utc})
    if not df2.empty:
        v2: Series = _coerce_numeric_series(df2["bal"]).dropna()
        if not v2.empty:
            return float(v2.iloc[0])

    return None


def load_day_open_balances(
    accounts: list[str],
    day: date,
    day_start_hour: int = 0,
) -> dict[str, float]:
    """Compute day-open equity anchors per account from balance tables.

    Args:
        accounts: list of account keys.
        day: local day-open date (e.g., 2025-10-01).
        day_start_hour: local-to-UTC hour offset for the day boundary (0 for UTC).
    """
    eng = get_engine()
    out: dict[str, float] = {}

    # Convert local day window to UTC strings
    local_start = datetime(day.year, day.month, day.day, 0, 0, 0)
    utc_start = local_start - timedelta(hours=day_start_hour)
    utc_end = utc_start + timedelta(days=1) - timedelta(seconds=1)
    start_ts_utc = utc_start.strftime("%Y-%m-%d %H:%M:%S")
    end_ts_utc = utc_end.strftime("%Y-%m-%d %H:%M:%S")

    with eng.connect() as conn:
        for acc in accounts:
            table = f"{acc}_balance"

            if not _column_exists(conn, BALANCE_SCHEMA, table, BALANCE_TIME_COLUMN):
                continue

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


def read_account_trades(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Read trades for an account between the given timestamps (inclusive).

    Realized PnL is normalized to be net of commission and the index is ``time``.
    """
    eng = get_engine()
    sql_stmt = text(
        "SELECT symbol, id, orderId, side, price, qty, realizedPnl, commission, time, "
        "positionSide "
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
    """Read transaction history from ``transaction_history.{account}_transaction``.

    Uses columns: ``incomeType`` (str), ``income`` (float), ``time`` (datetime index).
    """
    eng = get_engine()
    sql_stmt = text(
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
    """Read earnings from ``earnings.{account}_earnings`` with columns (rewards, time)."""
    eng = get_engine()
    sql_stmt = text(
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


# -------- UPnL helpers --------


def _decode_redis_payload(raw: object) -> str | None:
    """Decode a Redis value into text."""
    if isinstance(raw, str):
        return raw
    # Duck-type for a .decode method (e.g., bytes/bytearray).
    decoder = getattr(raw, "decode", None)
    if decoder is not None:
        try:
            return decoder("utf-8")
        except Exception:
            return None
    return None


def _extract_upnl_value(text_payload: str | None) -> float:
    """Parse JSON payload and sum 'unrealizedProfit' values."""
    if not text_payload:
        return 0.0
    try:
        parsed = json.loads(text_payload)
        frame = pd.DataFrame(parsed)
        if frame.empty or "unrealizedProfit" not in frame.columns:
            return 0.0
        ser: Series = _to_numeric_filled(frame["unrealizedProfit"])
        return float(ser.sum())
    except Exception:
        return 0.0


def read_upnl(accounts: list[str]) -> dict[str, float]:
    """Aggregate unrealized PnL from Redis for the given accounts.

    Expects Redis keys ``{account}_live`` with a JSON array whose rows have an
    ``unrealizedProfit`` field. Returns a mapping per account plus a ``"total"`` key
    with the sum across accounts.
    """
    r = get_redis()
    keys: list[str] = [f"{acc}_live" for acc in accounts]

    # Call r.mget safely without assuming sync/awaitable types.
    mget = getattr(r, "mget", None)
    res: object | None
    if callable(mget):
        res = mget(keys)
    else:
        res = None

    # Normalize to a list[object] without constructing from an unknown union.
    if res is None:
        raws_list: list[object] = []
    elif isinstance(res, list):
        raws_list = cast(list[object], res)
    elif isinstance(res, tuple):
        raws_list = list(cast(tuple[object, ...], res))
    else:
        # Unknown/unsupported container type — ignore at runtime.
        raws_list = []

    out: dict[str, float] = {}
    total = 0.0

    for acc, raw in zip(accounts, raws_list, strict=False):
        val = _extract_upnl_value(_decode_redis_payload(raw))
        out[acc] = val
        total += val

    if accounts:
        out["total"] = total
    return out


# -------- Compatibility alias for modules that import read_account_transactions --------


def read_account_transactions(account: str, start_dt: str, end_dt: str) -> DataFrame:
    """Backward-compat alias for ``read_account_txn``."""
    return read_account_txn(account, start_dt, end_dt)
