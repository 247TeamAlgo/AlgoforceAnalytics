from __future__ import annotations

from typing import Dict, Any, List, Optional
import pandas as pd

from ..io import load_initial_balances, load_accounts, read_account_trades, read_upnl
from ..metrics import pct_returns, mtd_drawdown


def compute_drawdown_mtd(
    *,
    override_accounts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Live MTD drawdown per account and combined (via 'total')."""
    init = load_initial_balances()
    accounts = override_accounts if override_accounts is not None else load_accounts(True)
    accounts = [a for a in accounts if a in init]

    # MTD window
    today = pd.Timestamp.today().date()
    start_day = today.replace(day=1)

    series_list = []
    for acc in accounts:
        df = read_account_trades(acc, f"{start_day} 00:00:00", f"{today} 23:59:59")
        if df.empty:
            continue
        daily = df["realizedPnl"].groupby(pd.Grouper(freq="D")).sum()
        eq = daily.cumsum() + float(init[acc])
        eq.name = acc
        series_list.append(eq)

    if not series_list:
        return {"mtdDrawdown": {}, "accounts": accounts}

    bal = pd.concat(series_list, axis=1).sort_index()
    # seed row (previous day) with initial balances
    first_idx = bal.index[0] - pd.Timedelta(days=1)
    seed = pd.DataFrame({a: float(init[a]) for a in accounts}, index=[first_idx])
    bal = pd.concat([seed, bal]).sort_index()
    bal["total"] = bal[accounts].sum(axis=1)

    upnl = read_upnl(accounts)
    last = bal.index[-1]
    for k, v in upnl.items():
        if k in bal.columns:
            bal.loc[last, k] = float(bal.loc[last, k]) + float(v)
    if "total" in upnl:
        bal.loc[last, "total"] = float(bal.loc[last, "total"]) + float(upnl["total"])

    r = pct_returns(bal)
    mtd_dd = mtd_drawdown(r)
    return {"mtdDrawdown": mtd_dd, "accounts": list(bal.columns)}
