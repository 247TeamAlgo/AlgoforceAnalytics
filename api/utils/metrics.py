# algoforce-analytics/api/utils/metrics.py
from __future__ import annotations

from typing import Dict
import pandas as pd

def pct_returns(balance: pd.DataFrame) -> pd.DataFrame:
    return balance.pct_change(axis=0).fillna(0.0)

def mtd_return(balance: pd.DataFrame) -> Dict[str, float]:
    if balance.empty:
        return {}
    this_month = balance.index.max().to_period("M")
    m = balance.loc[balance.index.to_period("M") == this_month]
    if m.empty:
        return {}
    first = m.iloc[0]
    last = m.iloc[-1]
    denom = first.replace(0.0, float("nan"))
    ret = (last - first) / denom
    return {c: float(round(float(ret[c]) if pd.notna(ret[c]) else 0.0, 6)) for c in m.columns}

def mtd_drawdown(returns: pd.DataFrame) -> Dict[str, float]:
    if returns.empty:
        return {}
    this_month = returns.index.max().to_period("M")
    r = returns.loc[returns.index.to_period("M") == this_month]
    if r.empty:
        return {}
    out: Dict[str, float] = {}
    for c in r.columns:
        eq = (1.0 + r[c]).cumprod()
        peak = eq.cummax()
        dd = (eq - peak) / peak
        out[c] = float(round(float(dd.min()) if not dd.empty else 0.0, 6))
    return out
