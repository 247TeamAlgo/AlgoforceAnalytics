import pandas as pd
import numpy as np
import sqlalchemy as db
from sqlalchemy import text
import matplotlib.pyplot as plt
import dataframe_image as dfi
import redis
import json

accounts = ['fund2', 'fund3']
start_date = '2025-05-01'

initial_balance = {
    'mirrorx1': 69767.99,
    'mirrorx2': 70694.99,
    'mirrorx3': 63593.75,
    'mirrorx4': 63167.20004,
    'team': 63687.14,
    'office': 58936.69,
    'algoforce1': 66501.93113,
    'algoforce5': 58766.82134,
    'fund2': 46544.94,
    'fund3': 47669.61
    }

withdrawal = {
    'mirrorx1': 0.0,
    'mirrorx2': 0.0,
    'mirrorx3': 0.0,
    'mirrorx4': 0.0,
    'team': 0.0,
    'office': 0.0,
    'algoforce1': 0.0,
    'algoforce5': 0.0,
    'fund2': 0.0,
    'fund3': 0.0
}

previous_pnl = {
    'mirrorx1': 0.0,
    'mirrorx2': 0.0,
    'mirrorx3': 0.0,
    'mirrorx4': 0.0,
    'team': 0.0,
    'office': 0.0,
    'algoforce1': 0.0,
    'algoforce5': 0.0,
    'fund2': 0.0,
    'fund3': 0.0
}


def get_account_data(account):
    conn = db.create_engine('mysql+mysqldb://247team:password@192.168.50.238:3306/trades')
    query = f"SELECT * FROM {account};"
    df = pd.read_sql_query(text(query), conn.connect())
    df['time'] = pd.to_datetime(df['time'])
    df.set_index('time', inplace=True)
    df.sort_index(inplace=True)
    df['realizedPnl'] = df['realizedPnl'].astype(float)
    df['commission'] = df['commission'].astype(float)
    df['realizedPnl'] = df['realizedPnl'] - df['commission']
    df = df.loc[start_date:]
    df['account'] = account
    return df

def get_balance():
    balances = []
    raw_data = []
    for account in accounts:
        init_bal = initial_balance[account] - withdrawal[account] + previous_pnl[account]
        data = get_account_data(account)
        raw_data.append(data)
        d = data.groupby(pd.Grouper(freq='D'))['realizedPnl'].sum().to_frame(name='pnl')
        d[f'{account}'] = d['pnl'].cumsum() + init_bal
        balances.append(d[f'{account}'])
    balance = pd.concat(balances, axis = 1)
    balance['total'] = balance.sum(axis=1)
    return balance, raw_data
    
def monthly_drawdown(data: pd.DataFrame) -> pd.DataFrame:
    def compute_drawdown(series: pd.Series) -> float:
        cummax = series.cummax()
        dd = (series - cummax) / cummax
        return dd.min()  # worst drawdown in the month
    return data.groupby(pd.Grouper(freq="ME")).apply(lambda x: x.apply(compute_drawdown))

def monthly_return(data):
    first = data.groupby(pd.Grouper(freq="ME")).first()
    last = data.groupby(pd.Grouper(freq="ME")).last()
    ret = (last - first) / first
    return ret

def get_upnl():
    uPnl = {}
    r = redis.Redis(host = 'localhost', port = 6379)
    total_upnl = 0.0
    for account in accounts:
        key = f"{account}_live"
        data = r.get(key).decode()
        data = json.loads(data)
        df = pd.DataFrame(data)
        uPnl[account] = df['unrealizedProfit'].astype(float).sum()
        total_upnl += df['unrealizedProfit'].astype(float).sum()
    uPnl['total'] = total_upnl
    return uPnl

if __name__ == "__main__":
    df, _ = get_balance()
    uPnl = get_upnl()
    df.loc[df.index[-1]] += pd.Series(uPnl)
    mdd = monthly_drawdown(df)
    print('Monthly Drawdown\n', mdd)
    mret = monthly_return(df)
    print('Monthly Return\n', mret)