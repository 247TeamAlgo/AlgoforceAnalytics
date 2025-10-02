from __future__ import annotations

from datetime import date, datetime
from typing import Dict, Any, List, Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse

from api.utils.io import (
    load_initial_balances,
    load_accounts,
    load_accounts_info,
    read_account_trades,
    read_upnl,
)

load_dotenv(".env.local")
app = FastAPI(title="Algoforce Metrics API", version="1.0.1")


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


def _mtd_window() -> tuple[date, date]:
    today = date.today()
    start = today.replace(day=1)
    return start, today


@app.get("/api/metrics/bulk")
def metrics_bulk_mtd(
    accounts: Optional[str] = Query(None, description="Comma-separated redisName list. Defaults to monitored."),
) -> JSONResponse:
    """
    MTD-only bulk metrics (UTC day boundary = PH 08:00, i.e., no shift):
      - Equity (daily) with live uPnL injected ONLY in the last row
      - Returns (daily pct) computed on PRE-uPnL equity (matches your reference script)
      - Live MTD Return (geometric) & MTD Drawdown (worst DD) computed on PRE-uPnL returns
      - Consecutive losing days = CURRENT streak (strict negative), on UTC calendar days
      - Total PnL per symbol (MTD, full), no trimming
      - Live uPnL snapshot
    """
    # Window = MTD
    start_day, end_day = _mtd_window()

    # Accounts (filter to those present in initial balances)
    init = load_initial_balances()  # comes from balance.json; update that file if numbers are "wrong"
    defaults = load_accounts(monitored_only=True)
    override = [a.strip() for a in accounts.split(",")] if accounts else None
    accs = override if override is not None else defaults
    accs = [a for a in accs if a in init]

    # ---------- Build PRE-uPnL equity from SQL (MTD) ----------
    series_list: List[pd.Series] = []
    for acc in accs:
        df = read_account_trades(
            acc,
            f"{start_day} 00:00:00",
            f"{end_day} 23:59:59",
        )
        if df.empty:
            continue
        # Group by UTC calendar day; your data is UTC, and PH 08:00 == 00:00 UTC, so no shift.
        daily = df["realizedPnl"].groupby(pd.Grouper(freq="D")).sum()
        eq = daily.cumsum() + float(init[acc])
        eq.name = acc
        series_list.append(eq)

    if series_list:
        bal_pre_upnl = pd.concat(series_list, axis=1).sort_index()
        # Seed row = day before first index, with starting balances for stable first return
        first_idx = bal_pre_upnl.index[0] - pd.Timedelta(days=1)
        seed = pd.DataFrame({a: float(init[a]) for a in accs}, index=[first_idx])
        bal_pre_upnl = pd.concat([seed, bal_pre_upnl]).sort_index()
        # Combined
        bal_pre_upnl["total"] = bal_pre_upnl[accs].sum(axis=1)
    else:
        bal_pre_upnl = pd.DataFrame(columns=accs + ["total"])

    # ---------- Returns & Live MTD stats computed on PRE-uPnL ----------
    rets = bal_pre_upnl.pct_change(axis=0).fillna(0.0) if not bal_pre_upnl.empty else pd.DataFrame(columns=bal_pre_upnl.columns)

    if not rets.empty:
        # Limit to current month rows only
        this_month_mask = rets.index.to_period("M") == rets.index[-1].to_period("M")
        rets_mtd = rets.loc[this_month_mask]

        # Geometric MTD return (per column)
        combined_live_monthly_return = {c: float((1.0 + rets_mtd[c]).prod() - 1.0) for c in rets_mtd.columns}

        # MTD drawdown (worst DD over MTD)
        def _col_mdd_mtd(s: pd.Series) -> float:
            eq = (1.0 + s).cumprod()
            peak = eq.cummax()
            dd = (eq - peak) / peak
            return float(dd.min())
        combined_live_monthly_drawdown = {c: _col_mdd_mtd(rets_mtd[c]) for c in rets_mtd.columns}
    else:
        combined_live_monthly_return = {}
        combined_live_monthly_drawdown = {}

    # ---------- Produce OUTPUT balance by injecting live uPnL ONLY at the last row ----------
    bal = bal_pre_upnl.copy()
    upnl_map = read_upnl(accs)  # {'acc': val, ..., 'total': val}
    if not bal.empty:
        last = bal.index[-1]
        for k, v in upnl_map.items():
            if k in bal.columns:
                bal.loc[last, k] = float(bal.loc[last, k]) + float(v)
        if "total" in upnl_map and "total" in bal.columns:
            bal.loc[last, "total"] = float(bal.loc[last, "total"]) + float(upnl_map["total"])

    # ---------- Consecutive losing days: CURRENT streak (strict negative), UTC days ----------
    # No day shift. If you ever switch to local non-UTC timestamps, we’d need to adjust here.
    def daily_net(acc: str) -> pd.DataFrame:
        df = read_account_trades(acc, f"{start_day} 00:00:00", f"{end_day} 23:59:59")
        if df.empty:
            rng = pd.date_range(start_day, end_day, freq="D")
            return pd.DataFrame({"day": rng.strftime("%Y-%m-%d"), "net_pnl": 0.0})
        g = (
            df["realizedPnl"]
            .groupby(pd.Grouper(freq="D"))
            .sum()
            .rename("net_pnl")
            .rename_axis("day")
            .reset_index()
        )
        g["day"] = pd.to_datetime(g["day"]).dt.strftime("%Y-%m-%d")
        full = pd.DataFrame({"day": pd.date_range(start_day, end_day, freq="D").strftime("%Y-%m-%d")})
        out = full.merge(g, on="day", how="left")
        out["net_pnl"] = out["net_pnl"].fillna(0.0).astype(float)
        return out[["day", "net_pnl"]]

    def current_streak_strict_neg(daily_df: pd.DataFrame) -> int:
        # Count consecutive negative days ending today
        s = 0
        for v in reversed(daily_df["net_pnl"].tolist()):
            if v < 0.0:
                s += 1
            else:
                break
        return s

    def max_streak_strict_neg(daily_df: pd.DataFrame) -> int:
        s = 0
        m = 0
        for v in daily_df["net_pnl"].tolist():
            if v < 0.0:
                s += 1
                if s > m:
                    m = s
            else:
                s = 0
        return m

    per_account_streak: Dict[str, Dict[str, Any]] = {}
    streak_frames: List[pd.DataFrame] = []
    for a in accs:
        d = daily_net(a)
        per_account_streak[a] = {
            "currentStreak": current_streak_strict_neg(d),
            "maxStreak": max_streak_strict_neg(d),  # keeping this for completeness
        }
        streak_frames.append(d.rename(columns={"net_pnl": a}))

    if streak_frames:
        comb = streak_frames[0].copy()
        for d in streak_frames[1:]:
            comb = comb.merge(d, on="day", how="inner")
        value_cols = [c for c in comb.columns if c != "day"]
        comb["net_pnl"] = comb[value_cols].sum(axis=1)
        combined_daily_map = {row["day"]: float(row["net_pnl"]) for _, row in comb[["day", "net_pnl"]].iterrows()}
        combined_current = current_streak_strict_neg(comb[["day", "net_pnl"]])
        combined_max = max_streak_strict_neg(comb[["day", "net_pnl"]])
    else:
        combined_daily_map = {}
        combined_current = 0
        combined_max = 0

    # ---------- Total PnL per symbol (MTD, full table) ----------
    frames: List[pd.Series] = []
    for a in accs:
        df = read_account_trades(a, f"{start_day} 00:00:00", f"{end_day} 23:59:59")
        if df.empty:
            continue
        frames.append(df.groupby("symbol")["realizedPnl"].sum().rename(a))
    if frames:
        symbols_table = pd.concat(frames, axis=1).fillna(0.0)
        symbols_table["TOTAL"] = symbols_table.sum(axis=1)
        symbols_table = symbols_table.sort_values("TOTAL", ascending=False)
        symbols_dict: Dict[str, Dict[str, float]] = {
            sym: {col: float(symbols_table.loc[sym, col]) for col in symbols_table.columns}
            for sym in symbols_table.index
        }
        totals_by_account = {col: float(symbols_table[col].sum()) for col in symbols_table.columns if col != "TOTAL"}
    else:
        symbols_dict = {}
        totals_by_account = {a: 0.0 for a in accs}

    # ---------- Helpers to serialize frames ----------
    def frame(df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
        if df.empty:
            return {}
        return {
            df.index[i].isoformat(): {str(c): float(df.iloc[i][c]) for c in df.columns}
            for i in range(len(df))
        }

    payload: Dict[str, Any] = {
        "window": {
            "startDay": start_day.isoformat(),
            "endDay": end_day.isoformat(),
            "mode": "MTD",
        },
        "accounts": accs,
        # PRE-uPnL returns:
        "returns": frame(rets),
        # Balance WITH uPnL injected only at the last row:
        "balance": frame(bal),
        "combinedLiveMonthlyReturn": combined_live_monthly_return,     # MTD (pre-uPnL), includes 'total'
        "combinedLiveMonthlyDrawdown": combined_live_monthly_drawdown, # MTD (pre-uPnL), includes 'total'
        "losingStreak": {
            "perAccount": per_account_streak,             # includes currentStreak and maxStreak
            "combined": {"currentStreak": combined_current, "maxStreak": combined_max},
            "daily": {"combined": combined_daily_map},
        },
        "symbolPnL": {
            "symbols": symbols_dict,            # {symbol: {acc1: v, ..., TOTAL: v}}
            "totalPerAccount": totals_by_account
        },
        "uPnl": {
            "as_of": datetime.utcnow().isoformat() + "Z",
            "combined": float(upnl_map.get("total", sum(v for k, v in upnl_map.items() if k in accs))),
            "perAccount": {a: float(upnl_map.get(a, 0.0)) for a in accs},
        },
    }

    return JSONResponse(content=payload)


@app.get("/api/accounts")
def accounts_info() -> JSONResponse:
    """
    Returns the full accounts metadata array from accounts.json.
    """
    data = load_accounts_info()
    return JSONResponse(content=data, headers={"Cache-Control": "private, max-age=30"})


@app.get("/api/upnl")
def upnl_endpoint(
    accounts: Optional[str] = Query(None, description="Comma-separated redisName list. Defaults to monitored."),
) -> JSONResponse:
    """
    Live uPnL snapshot: combined + per-account.
    Reads Redis '{account}_live' JSON and sums 'unrealizedProfit'.
    Returns NO redundant 'accounts' field.
    """
    defaults = load_accounts(monitored_only=True)
    override = [a.strip() for a in accounts.split(",")] if accounts else None
    accs = override if override is not None else defaults

    up = read_upnl(accs)  # includes 'total'
    combined = float(up.get("total", sum(up.get(a, 0.0) for a in accs)))

    body = {
        "as_of": datetime.utcnow().isoformat() + "Z",
        "combined_upnl": combined,
        "per_account_upnl": {a: float(up.get(a, 0.0)) for a in accs},
    }
    return JSONResponse(content=body, headers={"Cache-Control": "no-store, must-revalidate"})
