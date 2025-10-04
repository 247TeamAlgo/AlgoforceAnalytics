# algoforce-analytics/api/utils/calculations/drawdown_mtd.py
from __future__ import annotations

from typing import Dict, Any, List, Optional
import pandas as pd

from ..io import (
    load_day_open_balances, load_accounts,
    read_account_trades, read_account_transactions, read_account_earnings, read_upnl
)
from ..metrics import pct_returns, mtd_drawdown

def _truncate4(x: float) -> float:
    try: x = float(x)
    except Exception: return 0.0
    return float(int(x * 10_000) / 10_000.0)

def _truncate4_map(d: Dict[str, float]) -> Dict[str, float]:
    return {k: _truncate4(v) for k, v in d.items()}

def compute_drawdown_mtd(*, override_accounts: Optional[List[str]] = None) -> Dict[str, Any]:
    """Live MTD drawdown per account and combined (via 'total'); UPnL injected on the last day (margin view)."""
    today = pd.Timestamp.today().date()
    start_day = today.replace(day=1)

    all_accounts = override_accounts if override_accounts is not None else load_accounts(True)
    # Use tz-naive month-open to match baseline
    init = load_day_open_balances(all_accounts, start_day, day_start_hour=0)
    accounts = [a for a in all_accounts if a in init]

    eq_list = []
    for acc in accounts:
        df_tr = read_account_trades(acc, f"{start_day} 00:00:00", f"{today} 23:59:59")
        df_tx = read_account_transactions(acc, f"{start_day} 00:00:00", f"{today} 23:59:59")
        df_er = read_account_earnings(acc,    f"{start_day} 00:00:00", f"{today} 23:59:59")

        parts = []
        if not df_tr.empty:
            p = df_tr[["realizedPnl"]].rename(columns={"realizedPnl":"dollar_val"}); p["transaction_type"]="realizedPnl"; parts.append(p)
        if not df_tx.empty:
            ff = df_tx[df_tx["incomeType"]=="FUNDING_FEE"][["income"]].rename(columns={"income":"dollar_val"}); ff["transaction_type"]="funding_fee"; parts.append(ff)
            tr = df_tx[df_tx["incomeType"]=="TRANSFER"][["income"]].rename(columns={"income":"dollar_val"}); tr["transaction_type"]="transfer"; parts.append(tr)
        if not df_er.empty:
            er = df_er[["rewards"]].rename(columns={"rewards":"dollar_val"}); er["transaction_type"]="earnings"; parts.append(er)

        if parts:
            ledger = pd.concat(parts).sort_index()
            ledger = ledger[ledger["transaction_type"] != "transfer"]
            daily = ledger["dollar_val"].groupby(pd.Grouper(freq="D")).sum()
        else:
            daily = pd.Series(dtype=float)

        eq = daily.cumsum() + float(init[acc]) if not daily.empty else pd.Series([float(init[acc])])
        eq.name = acc
        eq_list.append(eq)

    if not eq_list:
        return {"mtdDrawdown": {}, "accounts": accounts}

    bal = pd.concat(eq_list, axis=1).sort_index()
    first_idx = bal.index[0] - pd.Timedelta(days=1)
    seed = pd.DataFrame({a: float(init[a]) for a in accounts}, index=[first_idx])
    bal = pd.concat([seed, bal]).sort_index()
    bal["total"] = bal[accounts].sum(axis=1)

    upnl = read_upnl(accounts)
    last = bal.index[-1]
    for a in accounts:
        bal.loc[last, a] = float(bal.loc[last, a]) + float(upnl.get(a, 0.0))
    bal["total"] = bal[accounts].sum(axis=1)

    r = pct_returns(bal)
    mtd_dd = mtd_drawdown(r)
    return {"mtdDrawdown": _truncate4_map(mtd_dd), "accounts": list(bal.columns)}
