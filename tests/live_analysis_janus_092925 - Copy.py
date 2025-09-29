import pandas as pd
import numpy as np
import sqlalchemy as db
from sqlalchemy import text
import redis, json

accounts = ['fund2', 'fund3']
start_date = '2025-05-01'

initial_balance = {
    'fund2': 46544.94,
    'fund3': 47669.61
}
withdrawal = {'fund2': 0.0, 'fund3': 0.0}
previous_pnl = {'fund2': 0.0, 'fund3': 0.0}

def get_account_data(account: str) -> pd.DataFrame:
    engine = db.create_engine('mysql+mysqldb://247team:password@192.168.50.238:3306/trades')
    df = pd.read_sql_query(text(f"SELECT * FROM {account};"), engine.connect())
    df['time'] = pd.to_datetime(df['time'])
    df = df.set_index('time').sort_index()
    df = df.loc[start_date:].copy()

    # preserve gross and fees; compute net
    df['realizedPnl'] = df['realizedPnl'].astype(float)
    df['commission']  = df['commission'].astype(float)
    df['net']         = df['realizedPnl'] - df['commission']
    df['account']     = account
    return df

def get_upnl_snapshot() -> dict[str, float]:
    r = redis.Redis(host='localhost', port=6379)
    out: dict[str, float] = {}
    total = 0.0
    for a in accounts:
        raw = r.get(f"{a}_live")
        if not raw:
            out[a] = 0.0
            continue
        data = json.loads(raw.decode())
        df = pd.DataFrame(data)
        u = float(pd.to_numeric(df['unrealizedProfit'], errors='coerce').fillna(0.0).sum())
        out[a] = u
        total += u
    out['total'] = total
    return out

def build_daily_equity(include_upnl: bool = True) -> tuple[pd.DataFrame, list[pd.DataFrame]]:
    """Returns (equity_df, raw_trades_list).
    equity_df columns: one per account + 'total'. Index: daily dates.
    """
    balances: list[pd.Series] = []
    raws: list[pd.DataFrame] = []

    # Build per-account daily equity from NET PnL
    for a in accounts:
        init_bal = initial_balance[a] - withdrawal[a] + previous_pnl[a]
        data = get_account_data(a)
        raws.append(data)

        # daily net pnl
        daily_net = data['net'].resample('D').sum()
        equity = daily_net.cumsum() + init_bal
        equity.name = a
        balances.append(equity)

    # Align by daily index and assemble
    equity_df = pd.concat(balances, axis=1).sort_index()
    # fill missing dates (if any account had gaps)
    full_idx = pd.date_range(equity_df.index.min(), equity_df.index.max(), freq='D')
    equity_df = equity_df.reindex(full_idx).ffill()  # carry forward equity on non-trading days
    equity_df['total'] = equity_df.sum(axis=1)

    if include_upnl and not equity_df.empty:
        upnl = get_upnl_snapshot()
        # inject UPnL on the latest day only
        last_idx = equity_df.index[-1]
        for a in accounts:
            equity_df.loc[last_idx, a] = equity_df.loc[last_idx, a] + upnl.get(a, 0.0)
        equity_df.loc[last_idx, 'total'] = equity_df.loc[last_idx, accounts].sum()

    return equity_df, raws

def monthly_drawdown(data: pd.DataFrame) -> pd.DataFrame:
    def compute_drawdown(series: pd.Series) -> float:
        cummax = series.cummax()
        mask = cummax > 0
        dd = pd.Series(0.0, index=series.index, dtype=float)
        dd[mask] = series[mask] / cummax[mask] - 1.0
        return dd.min()  # signed (<= 0)
    return data.groupby(pd.Grouper(freq="ME")).apply(lambda m: m.apply(compute_drawdown))

def monthly_return(data: pd.DataFrame) -> pd.DataFrame:
    first = data.groupby(pd.Grouper(freq="ME")).first()
    last  = data.groupby(pd.Grouper(freq="ME")).last()
    return (last - first) / first

if __name__ == "__main__":
    equity, raw = build_daily_equity(include_upnl=True)

    print("\n--- Daily equity per account + TOTAL (last 30 days) ---")
    print(equity.tail(32))

    print("\n--- Monthly Drawdown (signed) ---")
    print(monthly_drawdown(equity))

    print("\n--- Monthly Return ---")
    print(monthly_return(equity))
