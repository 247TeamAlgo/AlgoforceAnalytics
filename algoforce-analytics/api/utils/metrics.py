from __future__ import annotations

from typing import Dict
import pandas as pd


def pct_returns(balance: pd.DataFrame) -> pd.DataFrame:
    return balance.pct_change(axis=0).fillna(0.0)


def overall_max_drawdown(returns: pd.DataFrame) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for c in returns.columns:
        eq = (1.0 + returns[c]).cumprod()
        peak = eq.cummax()
        dd = (eq - peak) / peak
        out[c] = float(dd.min()) if not dd.empty else 0.0
    return out


def monthly_return(returns: pd.DataFrame) -> pd.DataFrame:
    if returns.empty:
        return pd.DataFrame()
    return (1.0 + returns).groupby(pd.Grouper(freq="ME")).prod() - 1.0


def monthly_drawdown(returns: pd.DataFrame) -> pd.DataFrame:
    if returns.empty:
        return pd.DataFrame()
    def col_mdd(s: pd.Series) -> float:
        eq = (1.0 + s).cumprod()
        peak = eq.cummax()
        dd = (eq - peak) / peak
        return float(dd.min())
    return returns.groupby(pd.Grouper(freq="ME")).apply(lambda f: f.apply(col_mdd))


def mtd_return(balance: pd.DataFrame) -> Dict[str, float]:
    """Return-to-date for the current month: (last - first) / first."""
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
    return {c: float(ret[c]) if pd.notna(ret[c]) else 0.0 for c in m.columns}


def mtd_drawdown(returns: pd.DataFrame) -> Dict[str, float]:
    """Max drawdown in the current month to date."""
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
        out[c] = float(dd.min()) if not dd.empty else 0.0
    return out
