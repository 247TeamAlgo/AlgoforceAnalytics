from __future__ import annotations

from typing import Dict, Any, List, Optional
import pandas as pd

from ..io import load_accounts, read_account_trades


def compute_symbol_pnl_mtd(
    *,
    override_accounts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    MTD-only total PnL per symbol with TOTAL column.
    """
    accounts = override_accounts if override_accounts is not None else load_accounts(True)

    today = pd.Timestamp.today().date()
    start_day = today.replace(day=1)

    frames: List[pd.Series] = []
    for acc in accounts:
        df = read_account_trades(acc, f"{start_day} 00:00:00", f"{today} 23:59:59")
        if df.empty:
            continue
        frames.append(df.groupby("symbol")["realizedPnl"].sum().rename(acc))

    if not frames:
        return {
            "window": {"startDay": start_day.isoformat(), "endDay": today.isoformat()},
            "symbols": {},
            "accounts": accounts,
            "totalPerAccount": {a: 0.0 for a in accounts},
        }

    table = pd.concat(frames, axis=1).fillna(0.0)
    table["TOTAL"] = table.sum(axis=1)
    table = table.sort_values("TOTAL", ascending=False)

    symbols_dict: Dict[str, Dict[str, float]] = {
        sym: {col: float(table.loc[sym, col]) for col in table.columns}
        for sym in table.index
    }
    totals_by_account = {col: float(table[col].sum()) for col in table.columns if col != "TOTAL"}

    return {
        "window": {"startDay": start_day.isoformat(), "endDay": today.isoformat()},
        "symbols": symbols_dict,
        "accounts": accounts,
        "totalPerAccount": totals_by_account,
    }
