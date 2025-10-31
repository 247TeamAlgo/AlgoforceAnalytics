# all_time_dd.py
import pandas as pd

from .process_df import process_df


def current_dd_test(accounts, oct_start, end_day):
    all_start = "2025-05-01 08:02:00"
    # oct_start = "2025-10-01 00:00:00"
    # end_day = "2025-10-31 07:38:00"
    all_results, all_combined_daily, all_combined_monthly = process_df(accounts, oct_start, end_day)
    oct_results, oct_combined_daily, oct_combined_monthly = process_df(accounts, all_start, end_day)
    df_oct = all_combined_daily
    df_all = oct_combined_daily

    df_all = pd.DataFrame(df_all).sort_index()
    df_oct = pd.DataFrame(df_oct).sort_index()

    df_all["peak"] = df_all["end_balance_combined"].cummax()
    df_oct["peak"] = df_all.loc[df_oct.index, "peak"]
    df_oct["drawdown"] = (df_oct["end_balance_combined"] - df_oct["peak"]) / df_oct["peak"]

    current_drawdown_oct = df_oct["drawdown"].iloc[-1]
    return current_drawdown_oct
