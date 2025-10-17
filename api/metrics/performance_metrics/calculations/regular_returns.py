from pandas import DataFrame
from ....db.sql import read_trades, read_transactions, read_earnings, nearest_balance_on_or_before

def regular_returns(accounts: list[str], start_dt: str, end_dt: str) -> DataFrame:
    for acct in accounts:
        trades = read_trades()