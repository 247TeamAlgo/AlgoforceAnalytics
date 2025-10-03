#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, Any, List, Optional, Tuple
from decimal import Decimal, ROUND_DOWN
from datetime import date, datetime
import time  # <-- added

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse

# --- logging (added) ---
from pathlib import Path
import logging
from logging.handlers import TimedRotatingFileHandler
# -----------------------

from api.utils.io import (
    load_accounts,
    load_accounts_info,
    read_account_trades,
    read_upnl,
    load_day_open_balances,
)
from api.utils.metrics import pct_returns, monthly_return, monthly_drawdown

load_dotenv(".env.local")
app = FastAPI(title="Algoforce Metrics API", version="1.8.2")

# === local file logger (api/backend.log) ===
LOG_DIR = Path(__file__).resolve().parent
LOG_FILE = LOG_DIR / "backend.log"

logger = logging.getLogger("api.index")
logger.setLevel(logging.INFO)
logger.handlers.clear()
_file_handler = TimedRotatingFileHandler(
    LOG_FILE, when="midnight", backupCount=14, encoding="utf-8", utc=True
)
_file_handler.setFormatter(
    logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        "%Y-%m-%dT%H:%M:%S%z",
    )
)
logger.addHandler(_file_handler)
logger.propagate = False
# ======================================


# ---------------- helpers ----------------

def _sanitize_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    return (
        df.sort_index()
          .ffill()
          .replace([np.inf, -np.inf], 0.0)
          .fillna(0.0)
          .astype(float)
    )

def _frame(df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    if df.empty:
        return {}
    safe = _sanitize_frame(df)
    out: Dict[str, Dict[str, float]] = {}
    for ts, row in safe.iterrows():
        # keep naive "YYYY-mm-dd HH:MM:SS" like your sample JSON
        if isinstance(ts, pd.Timestamp) and ts.tzinfo is not None:
            ts = ts.tz_convert("UTC").tz_localize(None)
        out[str(ts)] = {str(c): float(row[c]) for c in safe.columns}
    return out

def _mtd_window() -> tuple[date, date]:
    today = date.today()
    return today.replace(day=1), today

def _last_row_to_dict(df: pd.DataFrame) -> Dict[str, float]:
    if df.empty:
        return {}
    row = df.iloc[-1]
    return {str(c): float(row[c]) for c in df.columns}

def _mtd_snapshot_like_script(equity: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    if equity.empty:
        return {"pnl": {}, "return": {}}
    mask = equity.index.to_period("M") == equity.index[-1].to_period("M")
    m = equity.loc[mask]
    if m.empty:
        return {"pnl": {}, "return": {}}
    first = m.iloc[0].replace(0.0, np.nan)
    last = m.iloc[-1]
    pnl = (last - m.iloc[0]).fillna(0.0)
    ret = ((last - first) / first).replace([np.inf, -np.inf], 0.0).fillna(0.0)
    return {
        "pnl": {c: float(pnl[c]) for c in m.columns},
        "return": {c: float(ret[c]) for c in m.columns},
    }

def _streak_current(values: List[float]) -> int:
    s = 0
    for v in reversed(values):
        if v < 0.0:
            s += 1
        else:
            break
    return s

def _streak_max(values: List[float]) -> int:
    s = m = 0
    for v in values:
        if v < 0.0:
            s += 1
            m = max(m, s)
        else:
            s = 0
    return m

def _truncate4(x: float) -> float:
    # Truncate (not round) to 4 dp to match CLI constants exactly
    return float(Decimal(str(x)).quantize(Decimal("0.0000"), rounding=ROUND_DOWN))


# ---------------- lifecycle logs (added) ----------------
@app.on_event("startup")
async def _on_startup():
    logger.info("API starting up")

@app.on_event("shutdown")
async def _on_shutdown():
    logger.info("API shutting down")
# -------------------------------------------------------


# ---------------- routes ----------------

@app.get("/api/health")
def health() -> Dict[str, str]:
    logger.info("GET /api/health")
    return {"status": "ok"}


@app.get("/api/metrics/bulk")
def metrics_bulk_mtd(
    accounts: Optional[str] = Query(None, description="Comma-separated redisName list. Defaults to monitored.")
) -> JSONResponse:
    """
    MTD metrics with and without UPnL, mirroring the CLI’s equity construction:
      - seed with month-open equity (truncated to 4 dp to match CLI constants)
      - build per-account equity from realized PnL only
      - full month index + seed row + ffill
      - returns pre-UPnL are pct_change of pre-UPnL equity
      - inject UPnL per-account ONLY on the last row; recompute total
      - returns-with-UPnL override only the last row using prev from PRE-UPnL
    """
    t0 = time.perf_counter()
    logger.info("GET /api/metrics/bulk accounts_param=%s", accounts)

    start_day, end_day = _mtd_window()

    # Accounts requested
    defaults = load_accounts(monitored_only=True)
    override = [a.strip() for a in accounts.split(",")] if accounts else None
    req_accs = override or defaults

    # Month-open equity (DB) → truncate to 4 dp so it matches CLI
    init = load_day_open_balances(req_accs, start_day)
    accs = [a for a in req_accs if a in init]
    if not accs:
        payload = {
            "window": {"startDay": start_day.isoformat(), "endDay": end_day.isoformat(), "mode": "MTD"},
            "accounts": [],
            "message": "No accounts had month-open equity in balance.{account}_balance.",
        }
        logger.info(
            "bulk empty: start=%s end=%s accs=0 duration_ms=%.2f",
            start_day, end_day, (time.perf_counter() - t0) * 1000.0
        )
        return JSONResponse(content=payload, status_code=200)
    init = {a: _truncate4(init[a]) for a in accs}

    # Pull trades once per account → daily realized
    acc_df: Dict[str, pd.DataFrame] = {}
    daily_net: Dict[str, pd.Series] = {}
    for a in accs:
        df = read_account_trades(a, f"{start_day} 00:00:00", f"{end_day} 23:59:59")
        acc_df[a] = df
        if not df.empty:
            daily_net[a] = df["realizedPnl"].groupby(pd.Grouper(freq="D")).sum()

    # === PRE-UPnL equity (exactly like CLI) ===
    full_idx = pd.date_range(start_day, end_day, freq="D")
    seed_idx = full_idx[0] - pd.Timedelta(days=1)

    per_acc_equity: List[pd.Series] = []
    for a in accs:
        s = daily_net.get(a)
        if s is None or s.empty:
            eq = pd.Series(index=full_idx, dtype=float)  # to be ffilled from seed
        else:
            eq = (s.cumsum() + float(init[a])).reindex(full_idx)
        eq.name = a
        per_acc_equity.append(eq)

    bal_pre = (
        pd.concat(per_acc_equity, axis=1)
        if per_acc_equity else
        pd.DataFrame(index=full_idx, columns=accs, dtype=float)
    )
    seed_row = pd.DataFrame({a: float(init[a]) for a in accs}, index=[seed_idx])
    bal_pre = pd.concat([seed_row, bal_pre]).sort_index()

    bal_pre[accs] = (
        bal_pre[accs]
        .ffill()
        .replace([np.inf, -np.inf], 0.0)
        .fillna(0.0)
        .astype(float)
    )
    bal_pre["total"] = bal_pre[accs].sum(axis=1)

    # Pre-UPnL returns
    rets_pre = pct_returns(bal_pre)

    # === WITH UPnL ===
    up_used = read_upnl(accs)  # snapshot; no overrides
    bal_with = bal_pre.copy()
    last = bal_with.index[-1]
    for a in accs:
        bal_with.at[last, a] = float(bal_with.at[last, a]) + float(up_used.get(a, 0.0))
    bal_with["total"] = bal_with[accs].sum(axis=1)

    # Returns WITH UPnL: copy pre and override ONLY last row; prev comes from PRE-UPnL
    rets_with = rets_pre.copy()
    if len(bal_with) >= 2:
        prev = bal_pre.index[-2]
        last_ret = (bal_with.loc[last, bal_with.columns] / bal_pre.loc[prev, bal_pre.columns]) - 1.0
        rets_with.loc[last, bal_with.columns] = last_ret

    # Monthly metrics (same math as CLI)
    mret_pre_df  = monthly_return(rets_pre)
    mdd_pre_df   = monthly_drawdown(rets_pre)
    mret_with_df = monthly_return(rets_with)
    mdd_with_df  = monthly_drawdown(rets_with)

    # MTD snapshots (from equity, like CLI)
    mtd_pre  = _mtd_snapshot_like_script(bal_pre)
    mtd_with = _mtd_snapshot_like_script(bal_with)

    # ---------- Streaks ----------
    day_index = pd.date_range(start_day, end_day, freq="D").strftime("%Y-%m-%d")
    per_account_streak: Dict[str, Dict[str, int]] = {}
    series_for_concat: List[pd.Series] = []

    for a in accs:
        df = acc_df.get(a, pd.DataFrame())
        if df.empty:
            daily = pd.Series([0.0] * len(day_index), index=day_index, name=a)
        else:
            g = df["realizedPnl"].groupby(pd.Grouper(freq="D")).sum().reindex(
                pd.date_range(start_day, end_day, freq="D"), fill_value=0.0
            )
            daily = pd.Series(g.values, index=g.index.strftime("%Y-%m-%d"), name=a)
        series_for_concat.append(daily)
        vals = daily.tolist()
        per_account_streak[a] = {"currentStreak": _streak_current(vals), "maxStreak": _streak_max(vals)}

    if series_for_concat:
        comb = pd.concat(series_for_concat, axis=1).fillna(0.0)
        combined_vals = comb.sum(axis=1).tolist()
        combined_daily_map = {d: float(v) for d, v in zip(comb.index.tolist(), combined_vals)}
        combined_current = _streak_current(combined_vals)
        combined_max = _streak_max(combined_vals)
    else:
        combined_daily_map = {}
        combined_current = combined_max = 0

    # ---------- Symbol PnL ----------
    sym_frames: List[pd.Series] = []
    for a in accs:
        df = acc_df.get(a, pd.DataFrame())
        if not df.empty:
            sym_frames.append(df.groupby("symbol")["realizedPnl"].sum().rename(a))
    if sym_frames:
        sym_tbl = pd.concat(sym_frames, axis=1).fillna(0.0)
        sym_tbl["TOTAL"] = sym_tbl.sum(axis=1)
        sym_tbl = sym_tbl.sort_values("TOTAL", ascending=False)
        symbols = {sym: {col: float(sym_tbl.loc[sym, col]) for col in sym_tbl.columns} for sym in sym_tbl.index}
        totals_by_account = {col: float(sym_tbl[col].sum()) for col in sym_tbl.columns if col != "TOTAL"}
    else:
        symbols = {}
        totals_by_account = {a: 0.0 for a in accs}

    payload: Dict[str, Any] = {
        "window": {"startDay": start_day.isoformat(), "endDay": end_day.isoformat(), "mode": "MTD"},
        "accounts": accs,

        "returns": _frame(rets_pre),
        "balancePreUpnl": _frame(bal_pre),
        "combinedLiveMonthlyReturn": _last_row_to_dict(mret_pre_df),
        "combinedLiveMonthlyDrawdown": _last_row_to_dict(mdd_pre_df),

        "returnsWithUpnl": _frame(rets_with),
        "balance": _frame(bal_with),
        "combinedLiveMonthlyReturnWithUpnl": _last_row_to_dict(mret_with_df),
        "combinedLiveMonthlyDrawdownWithUpnl": _last_row_to_dict(mdd_with_df),

        "mtd": {"preUpnl": mtd_pre, "withUpnl": mtd_with},

        "losingStreak": {
            "perAccount": per_account_streak,
            "combined": {"currentStreak": combined_current, "maxStreak": combined_max},
            "daily": {"combined": combined_daily_map},
        },
        "symbolPnL": {"symbols": symbols, "totalPerAccount": totals_by_account},

        "uPnl": {
            "as_of": datetime.utcnow().isoformat() + "Z",
            "combined": float(sum(read_upnl(accs).get(a, 0.0) for a in accs)),
            "perAccount": {a: float(read_upnl(accs).get(a, 0.0)) for a in accs},
        },
    }

    # logger.info(
    #     "bulk ok: start=%s end=%s accs=%d returns_rows=%d duration_ms=%.2f",
    #     start_day,
    #     end_day,
    #     len(accs),
    #     len(payload.get("returns", {})),
    #     (time.perf_counter() - t0) * 1000.0,
    # )
    
    logger.info("START OF PAYLOAD")
    for key, value in payload.items():
        logger.info(f"{key}: {value}")
    logger.info("END OF PAYLOAD")

    return JSONResponse(content=payload)


@app.get("/api/accounts")
def accounts_info() -> JSONResponse:
    logger.info("GET /api/accounts")
    data = load_accounts_info()
    return JSONResponse(content=data, headers={"Cache-Control": "private, max-age=30"})


@app.get("/api/upnl")
def upnl_endpoint(
    accounts: Optional[str] = Query(None, description="Comma-separated redisName list."),
) -> JSONResponse:
    """
    DEPRECATED: UPnL is now included in /api/metrics/bulk under `uPnl`.
    """
    logger.info("GET /api/upnl (deprecated) accounts_param=%s", accounts)
    return JSONResponse(
        status_code=410,
        content={
            "error": "deprecated",
            "message": "Use /api/metrics/bulk; UPnL is included under 'uPnl'.",
            "replacement": "/api/metrics/bulk",
        },
        headers={"Cache-Control": "no-store, must-revalidate"},
    )
