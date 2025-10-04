#!/usr/bin/env python3
# algoforce-analytics/api/index.py
from __future__ import annotations

from typing import Dict, Any, List, Optional
from datetime import date, datetime, timedelta

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse

from api.utils.calculations.balance import (
    _round6,
    _serialize_balances_6dp,
    build_day_end_balances_fixed,
    build_margin_last_day,
    compute_metrics_from_balances,
)
from api.utils.io import read_account_trades, read_upnl
from api.utils.accounts import get_accounts

load_dotenv(".env.local")
app = FastAPI(title="Algoforce Metrics API", version="3.1.0")

PH_DAY_START_HOUR = 8  # PH cut for losing-days (trades-only)


def _today() -> date:
    return pd.Timestamp.utcnow().date()


def _mtd_window() -> tuple[date, date]:
    t = _today()
    return t.replace(day=1), t


def _trailing_losses_trades_only_PH(
    accounts: List[str], start_day: date, end_day: date
) -> Dict[str, Any]:
    full_idx = pd.date_range(start_day, end_day, freq="D")

    def daily_local_from_trades(df: pd.DataFrame) -> pd.Series:
        if df.empty:
            return pd.Series(0.0, index=full_idx)
        s = df["realizedPnl"].copy()
        shifted = s.copy()
        shifted.index = shifted.index - pd.Timedelta(hours=PH_DAY_START_HOUR)
        return (
            shifted.groupby(shifted.index.floor("D"))
            .sum()
            .reindex(full_idx, fill_value=0.0)
        )

    per_acc: Dict[str, Any] = {}
    comb = pd.Series(0.0, index=full_idx, dtype=float)

    for a in accounts:
        df = read_account_trades(a, f"{start_day} 00:00:00", f"{end_day} 23:59:59")
        daily = daily_local_from_trades(df)
        streak = 0
        for v in reversed(daily.tolist()):
            if float(v) < 0.0:
                streak += 1
            else:
                break
        if streak == 0:
            per_acc[a] = {"consecutive": 0, "days": {}}
        else:
            seg = daily.iloc[-streak:]
            per_acc[a] = {
                "consecutive": streak,
                "days": {ts.strftime("%Y-%m-%d"): float(v) for ts, v in seg.items()},
            }
        comb = comb.add(daily, fill_value=0.0)

    c_streak = 0
    for v in reversed(comb.tolist()):
        if float(v) < 0.0:
            c_streak += 1
        else:
            break
    if c_streak == 0:
        combined = {"consecutive": 0, "days": {}}
    else:
        seg = comb.iloc[-c_streak:]
        combined = {
            "consecutive": c_streak,
            "days": {ts.strftime("%Y-%m-%d"): float(v) for ts, v in seg.items()},
        }

    return {"perAccount": per_acc, "combined": combined}


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


# -------- single Accounts endpoint (returns the array) --------
@app.get("/api/accounts")
def api_accounts(monitoredOnly: bool = False) -> JSONResponse:
    """
    Returns the accounts as an array of objects in the exact shape you provided.
    Example item:
      {
        "binanceName": "...",
        "redisName": "...",
        "dbName": "...",
        "strategy": "...",
        "leverage": 10,
        "monitored": true
      }
    """
    items = get_accounts(monitored_only=monitoredOnly)
    return JSONResponse(content=items, headers={"Cache-Control": "private, max-age=30"})


# -------------------- Metrics (bulk) --------------------
@app.get("/api/metrics/bulk")
def metrics_bulk(
    accounts: Optional[str] = Query(None, description="Comma-separated redisName list. Required.")
) -> JSONResponse:
    if not accounts:
        raise HTTPException(status_code=400, detail="Missing 'accounts' parameter")
    accs = [a.strip() for a in accounts.split(",") if a.strip()]
    if not accs:
        raise HTTPException(status_code=400, detail="No valid accounts provided")

    start_day, end_day = _mtd_window()

    # Day-end fixed balances (no uPnL) — EXACT CLI/IPyNB end_balance
    fixed_balances, initial_map = build_day_end_balances_fixed(
        accs, start_day=start_day, end_day=end_day
    )

    # Margin last-day row with uPnL injected
    margin_last = build_margin_last_day(fixed_balances, accs)

    # Metrics from day-end balances (REALIZED vs MARGIN)
    mret_fixed, mdd_fixed, mret_margin, mdd_margin = compute_metrics_from_balances(
        fixed_balances, accs
    )

    # Losing-days (trades-only, PH 08:00 cut)
    losing = _trailing_losses_trades_only_PH(accs, start_day, end_day)

    # Serialize balances (6 dp, total from per-account rounded parts)
    realized_block = _serialize_balances_6dp(fixed_balances, accs)
    margin_block = _serialize_balances_6dp(margin_last, accs)

    # Symbol PnL (MTD), 6 dp
    sym_frames: List[pd.Series] = []
    for a in accs:
        df = read_account_trades(a, f"{start_day} 00:00:00", f"{end_day} 23:59:59")
        if df.empty:
            continue
        sym_frames.append(df.groupby("symbol")["realizedPnl"].sum().rename(a))
    symbols_dict: Dict[str, Dict[str, float]] = {}
    totals_by_account: Dict[str, float] = {a: 0.0 for a in accs}
    if sym_frames:
        tbl = pd.concat(sym_frames, axis=1).fillna(0.0)
        tbl["TOTAL"] = tbl.sum(axis=1)
        tbl = tbl.sort_values("TOTAL", ascending=False)
        symbols_dict = {
            sym: {col: _round6(float(tbl.loc[sym, col])) for col in tbl.columns}
            for sym in tbl.index
        }
        totals_by_account = {
            col: _round6(float(tbl[col].sum())) for col in tbl.columns if col != "TOTAL"
        }

    # UPnL snapshot (rounded 6 dp)
    up = read_upnl(accs)
    up_payload = {
        "as_of": datetime.utcnow().isoformat() + "Z",
        "combined": _round6(float(up.get("total", 0.0))),
        "perAccount": {a: _round6(float(up.get(a, 0.0))) for a in accs},
    }

    payload: Dict[str, Any] = {
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
        "initialBalances": {a: _round6(float(initial_map.get(a, 0.0))) for a in accs},
        "balances": {
            "realized": realized_block,
            "margin": margin_block,
        },
        "mtdDrawdown": {
            "realized": {k: _round6(v) for k, v in mdd_fixed.items()},
            "margin": {k: _round6(v) for k, v in mdd_margin.items()},
        },
        "mtdReturn": {
            "realized": {k: _round6(v) for k, v in mret_fixed.items()},
            "margin": {k: _round6(v) for k, v in mret_margin.items()},
        },
        "losingDays": {**losing["perAccount"], "combined": losing["combined"]},
        "symbolRealizedPnl": {
            "symbols": symbols_dict,
            "totalPerAccount": totals_by_account,
        },
        "uPnl": up_payload,
    }

    return JSONResponse(content=payload, headers={"Cache-Control": "private, max-age=5"})
