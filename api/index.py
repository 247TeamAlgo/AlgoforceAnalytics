#!/usr/bin/env python3
# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\index.py
"""FastAPI entrypoint for Algoforce Metrics API.

Provides MTD metrics, health checks, and accounts endpoints.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from api.utils.accounts import get_accounts
from api.utils.calculations.consecutive_losing_days import (
    compute_consecutive_losses_mtd,
)
from api.utils.calculations.return_mtd import compute_return_mtd_from_json
from api.utils.config import now_utc_iso
from api.utils.io import read_account_trades, read_upnl
from api.utils.json_balances import get_json_balances, get_json_unrealized
from api.utils.sql_balances import (
    build_day_end_balances_fixed,
    build_margin_last_day,
    compute_metrics_from_balances,
    round6,
    serialize_balances_6dp,
)

load_dotenv(".env.local")
app = FastAPI(title="Algoforce Metrics API", version="3.5.0")

PH_DAY_START_HOUR = 8  # PH cut for losing-days (trades-only)


def _today() -> date:
    """Return today's UTC date (timezone-aware)."""
    return pd.Timestamp.now(tz="UTC").date()


def _mtd_window() -> tuple[date, date]:
    """Return the month-to-date window (start-day, end-day) in UTC dates."""
    t = _today()
    return t.replace(day=1), t


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a simple health status."""
    return {"status": "ok"}


@app.get("/api/accounts")
def api_accounts(monitored: bool = False) -> JSONResponse:
    """Return account objects; optionally filter to monitored=True."""
    items = get_accounts(monitored_only=monitored)
    return JSONResponse(content=items, headers={"Cache-Control": "private, max-age=30"})


def _safe_to_float_series(values: Iterable[Any], index: pd.Index) -> pd.Series:
    """Safely coerce an iterable to float Series (bad values -> NaN)."""
    out: list[float] = []
    for v in values:
        try:
            out.append(float(v))
        except Exception:
            out.append(float("nan"))
    return pd.Series(out, index=index, dtype="float64")


def _sum_realized_by_symbol(df: pd.DataFrame, account: str) -> pd.Series:
    """Sum realized PnL by symbol without using pandas.groupby (for clean type info)."""
    view = df.loc[:, ["symbol", "realizedPnl"]]
    pnl = _safe_to_float_series(view["realizedPnl"], view.index)
    symbols = view["symbol"].astype(str)

    # Manual accumulation to avoid pandas groupby typing overloads.
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
    """Convert a numeric row into {column: rounded-float}, treating NaN as 0.0."""
    out: dict[str, float] = {}
    for k, v in row.items():
        num = 0.0 if pd.isna(v) else float(v)
        out[str(k)] = round6(num)
    return out


@app.get("/api/metrics/bulk")
def metrics_bulk(
    accounts: str | None = Query(
        None,
        description="Comma-separated redisName list. Required.",
    ),
) -> JSONResponse:
    """Return the complete MTD metrics bundle for the requested accounts."""
    if not accounts:
        raise HTTPException(status_code=400, detail="Missing 'accounts' parameter")
    accs = [a.strip().lower() for a in accounts.split(",") if a.strip()]
    if not accs:
        raise HTTPException(status_code=400, detail="No valid accounts provided")

    start_day, end_day = _mtd_window()

    # SQL: day-end fixed balances (no uPnL)
    fixed_balances, initial_map_sql = build_day_end_balances_fixed(
        accs,
        start_day=start_day,
        end_day=end_day,
    )

    # Margin last-day (inject uPnL on the last row only)
    margin_last = build_margin_last_day(fixed_balances, accs)

    # Drawdown metrics from historical series
    _, mdd_fixed, _, mdd_margin = compute_metrics_from_balances(
        fixed_balances,
        accs,
    )

    # Serialize SQL historical balances
    realized_block: dict[str, dict[str, float]] = serialize_balances_6dp(
        fixed_balances,
        accs,
    )
    margin_block: dict[str, dict[str, float]] = serialize_balances_6dp(
        margin_last,
        accs,
    )

    # Trades → symbol PnL (sum per account, then join)
    sym_frames: list[pd.Series] = []
    for a in accs:
        df = read_account_trades(a, f"{start_day} 00:00:00", f"{end_day} 23:59:59")
        if df.empty:
            continue
        sym_frames.append(_sum_realized_by_symbol(df, a))

    symbols_dict: dict[str, dict[str, float]] = {}
    totals_by_account: dict[str, float] = {a: 0.0 for a in accs}

    if sym_frames:
        tbl: pd.DataFrame = pd.concat(sym_frames, axis=1)

        # NaN-safe TOTAL column; avoid .fillna typing noise.
        totals_col = tbl.sum(axis=1, skipna=True)
        tbl = tbl.assign(TOTAL=totals_col)
        tbl = tbl.sort_values("TOTAL", ascending=False)

        # Materialize symbol rows (NaN → 0.0) and round.
        for idx_label, row in tbl.iterrows():
            sym_key = str(idx_label)
            symbols_dict[sym_key] = _row_to_rounded_float_dict(row)

        # Column totals (NaN-safe).
        for col in [c for c in tbl.columns if str(c) != "TOTAL"]:
            s = tbl[col]
            col_sum = float(s.sum(skipna=True)) if not s.empty else 0.0
            totals_by_account[str(col)] = round6(col_sum)

    # uPnL snapshot (Redis)
    up = read_upnl(accs)
    up_payload: dict[str, Any] = {
        "as_of": now_utc_iso(),
        "combined": round6(float(up.get("total", 0.0))),
        "perAccount": {a: round6(float(up.get(a, 0.0))) for a in accs},
    }

    # JSON baselines (metadata only; transparency + returns calc)
    json_balances_map = get_json_balances()
    json_unrealized_map = get_json_unrealized()
    json_balances: dict[str, float] = {
        a: round6(float(json_balances_map.get(a, 0.0))) for a in accs
    }
    json_unrealized_balances: dict[str, float] = {
        a: round6(float(json_unrealized_map.get(a, 0.0))) for a in accs
    }
    json_initial_balances: dict[str, float] = {
        a: round6(float(json_balances_map.get(a, 0.0)) + float(json_unrealized_map.get(a, 0.0)))
        for a in accs
    }

    # Returns (JSON+Redis only)
    json_returns = compute_return_mtd_from_json(override_accounts=accs)

    # Losing-days (SQL/Trades)
    losing_payload = compute_consecutive_losses_mtd(
        override_accounts=accs,
        day_start_hour=PH_DAY_START_HOUR,
        include_zero=False,  # strict negatives only
        ignore_trailing_zero=True,  # do not let today's 0 break a streak
        eps=1e-9,
    )

    payload: dict[str, Any] = {
        "meta": {
            "asOfStartAnchor": start_day.isoformat(),
            "initialBalancesDate": (start_day - timedelta(days=1)).isoformat(),
        },
        "window": {
            "startDay": start_day.isoformat(),
            "endDay": end_day.isoformat(),
            "mode": "MTD",
        },
        "accounts": accs,
        "json_balances": json_balances,
        "json_unrealized_balances": json_unrealized_balances,
        "json_initial_balances": json_initial_balances,
        "initial_balances": {a: round6(float(initial_map_sql.get(a, 0.0))) for a in accs},
        "sql_historical_balances": {
            "realized": realized_block,
            "margin": margin_block,
        },
        "mtdDrawdown": {
            "realized": {k: round6(v) for k, v in mdd_fixed.items()},
            "margin": {k: round6(v) for k, v in mdd_margin.items()},
        },
        "mtdReturn": {
            "realized": json_returns["realized"],
            "margin": json_returns["margin"],
        },
        "losingDays": {
            **losing_payload["perAccount"],
            "combined": losing_payload["combined"],
        },
        "symbolRealizedPnl": {
            "symbols": symbols_dict,
            "totalPerAccount": totals_by_account,
        },
        "uPnl": up_payload,
    }

    return JSONResponse(content=payload, headers={"Cache-Control": "private, max-age=5"})
