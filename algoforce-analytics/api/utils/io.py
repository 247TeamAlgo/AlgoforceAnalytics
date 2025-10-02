from __future__ import annotations

import json
from typing import Dict, List, Any

import pandas as pd
from sqlalchemy import text

from .config import (
    BALANCE_JSON_PATH,
    ACCOUNTS_JSON_PATH,
    ACCOUNT_KEY_FIELD,
    get_engine,
    get_redis,
)


# --------- loaders ---------

def load_initial_balances() -> Dict[str, float]:
    """
    balance.json is a flat dict: { "fund2": 45794.99, "fund3": 47413.85, ... }
    """
    with open(BALANCE_JSON_PATH, "r", encoding="utf-8") as f:
        obj = json.load(f)
    if not isinstance(obj, dict):
        raise ValueError("balance.json must be a flat dict of {account: initial_balance}.")
    out: Dict[str, float] = {}
    for k, v in obj.items():
        try:
            out[str(k)] = float(v)
        except Exception:
            continue
    return out


def load_accounts(monitored_only: bool = True) -> List[str]:
    with open(ACCOUNTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("accounts file must be a list")
    picked: List[str] = []
    for a in data:
        if not isinstance(a, dict):
            continue
        if monitored_only and not a.get("monitored", False):
            continue
        key = a.get(ACCOUNT_KEY_FIELD)
        if isinstance(key, str) and key:
            picked.append(key)
    return picked


def load_accounts_info() -> List[Dict[str, Any]]:
    """Return the full accounts metadata array (not just redisName list)."""
    with open(ACCOUNTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("accounts file must be a list of objects")
    return data


# --------- SQL & Redis ---------

def read_account_trades(account: str, start_dt: str, end_dt: str) -> pd.DataFrame:
    """
    Return trades in [start_dt, end_dt], realizedPnl net of commission, indexed by 'time'.
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

    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"]).sort_values("time").set_index("time")
    df["realizedPnl"] = pd.to_numeric(df["realizedPnl"], errors="coerce").fillna(0.0)
    df["commission"]  = pd.to_numeric(df["commission"],  errors="coerce").fillna(0.0)
    df["realizedPnl"] = df["realizedPnl"] - df["commission"]
    df["account"] = account
    return df


def read_upnl(accounts: List[str]) -> Dict[str, float]:
    """
    Redis keys: '{account}_live' JSON containing 'unrealizedProfit' per row.
    """
    r = get_redis()
    out: Dict[str, float] = {}
    total = 0.0
    for acc in accounts:
        blob = r.get(f"{acc}_live")
        if not blob:
            out[acc] = 0.0
            continue
        try:
            rows = json.loads(blob)
            df = pd.DataFrame(rows)
            val = float(pd.to_numeric(df.get("unrealizedProfit", 0.0), errors="coerce").fillna(0.0).sum())
        except Exception:
            val = 0.0
        out[acc] = val
        total += val
    if accounts:
        out["total"] = total
    return out
