# algoforce-analytics/api/utils/calculations/drawdown_mtd.py
from __future__ import annotations

from typing import Dict, Any, List, Optional
import pandas as pd

from ..io import load_day_open_balances, load_accounts, read_account_trades, read_upnl
from ..metrics import pct_returns, mtd_drawdown


def compute_drawdown_mtd(
    * ,
    override_accounts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Live MTD drawdown per account and combined (via 'total'); UPnL injected on the last day."""
    today = pd.Timestamp.today().date()
    start_day = today.replace(day=1)

    all_accounts = override_accounts if override_accounts is not None else load_accounts(True)
    init = load_day_open_balances(all_accounts, start_day)
    accounts = [a for a in all_accounts if a in init]

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
    first_idx = bal.index[0] - pd.Timedelta(days=1)
    seed = pd.DataFrame({a: float(init[a]) for a in accounts}, index=[first_idx])
    bal = pd.concat([seed, bal]).sort_index()
    bal["total"] = bal[accounts].sum(axis=1)

    # UPnL: per-account only; re-sum total
    upnl = read_upnl(accounts)
    last = bal.index[-1]
    for a in accounts:
        bal.loc[last, a] = float(bal.loc[last, a]) + float(upnl.get(a, 0.0))
    bal["total"] = bal[accounts].sum(axis=1)

    r = pct_returns(bal)
    mtd_dd = mtd_drawdown(r)
    return {"mtdDrawdown": mtd_dd, "accounts": list(bal.columns)}
