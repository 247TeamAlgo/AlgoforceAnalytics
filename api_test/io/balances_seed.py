# path: api/io/balances_seed.py
"""Day-open balance anchor loading from SQL balance tables."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import text

from api_test.core.config import (
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
    get_engine,
)


def _column_exists(schema: str, table: str, column: str) -> bool:
    """Return True if a column exists in schema.table."""
    eng = get_engine()
    with eng.connect() as conn:
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


def load_day_open_balances(
    accounts: list[str],
    day: date,
    day_start_hour: int = 0,
) -> dict[str, float]:
    """Compute day-open equity anchors per account from balance tables."""
    eng = get_engine()
    out: dict[str, float] = {}

    local_start = datetime(day.year, day.month, day.day, 0, 0, 0)
    utc_start = local_start - timedelta(hours=day_start_hour)
    utc_end = utc_start + timedelta(days=1) - timedelta(seconds=1)
    start_ts_utc = utc_start.strftime("%Y-%m-%d %H:%M:%S")
    end_ts_utc = utc_end.strftime("%Y-%m-%d %H:%M:%S")

    with eng.connect() as conn:
        for acc in accounts:
            table = f"{acc}_balance"

            if not _column_exists(BALANCE_SCHEMA, table, BALANCE_TIME_COLUMN):
                continue

            if _column_exists(BALANCE_SCHEMA, table, BALANCE_VALUE_COLUMN):
                balance_expr = f"`{BALANCE_VALUE_COLUMN}`"
            else:
                components = ["earn_balance", "spot_balance", "futures_balance"]
                # Skip if any component column missing
                if not all(_column_exists(BALANCE_SCHEMA, table, c) for c in components):
                    continue
                balance_expr = "`earn_balance` + `spot_balance` + `futures_balance`"

            q = text(
                f"""
                SELECT {balance_expr} AS bal
                FROM `{BALANCE_SCHEMA}`.`{table}`
                WHERE `{BALANCE_TIME_COLUMN}` >= :start
                  AND `{BALANCE_TIME_COLUMN}` <= :end
                ORDER BY `{BALANCE_TIME_COLUMN}` ASC
                LIMIT 1
                """
            )
            df1 = conn.execute(q, {"start": start_ts_utc, "end": end_ts_utc}).mappings().all()
            if df1:
                out[acc] = float(df1[0]["bal"])
                continue

            q2 = text(
                f"""
                SELECT {balance_expr} AS bal
                FROM `{BALANCE_SCHEMA}`.`{table}`
                WHERE `{BALANCE_TIME_COLUMN}` < :start
                ORDER BY `{BALANCE_TIME_COLUMN}` DESC
                LIMIT 1
                """
            )
            df2 = conn.execute(q2, {"start": start_ts_utc}).mappings().all()
            if df2:
                out[acc] = float(df2[0]["bal"])

    return out
