# all_time_dd.py
import pandas as pd

from ....db.sql_v2 import get_data
from .process_df import process_df


def current_max_dd(accounts, oct_start, end_day) -> tuple[float, float]:
    """Returns (current_window_dd, all_time_mdd). Both floats. Raises on insufficient data."""
    for acc in accounts:
        balance = get_data(acc, "balance", "balance")
        balance["datetime"] = pd.to_datetime(balance["datetime"])
        balance.sort_values(by="datetime")
        all_start = balance.iloc[0]["datetime"]

    # Full history
    _, all_daily, _ = process_df(accounts, all_start, end_day)
    if all_daily.empty:
        raise ValueError("No combined daily data for full history.")

    all_daily["date"] = pd.to_datetime(all_daily["date"], errors="coerce")
    df_all = all_daily.sort_values("date").set_index("date")
    if "end_balance_combined" not in all_daily.columns:
        raise ValueError("Missing end_balance_combined in full-history frame.")

    # All-time MDD
    if (
        "daily_drawdown_combined" in all_daily.columns
        and not all_daily["daily_drawdown_combined"].dropna().empty
    ):
        max_dd_all = float(all_daily["daily_drawdown_combined"].min())
    else:
        bal_all = all_daily["end_balance_combined"].astype(float)
        peaks_all = bal_all.cummax().replace(0.0, pd.NA)
        max_dd_all = float(((bal_all - peaks_all) / peaks_all).min())

    # Window current DD
    _, df_mtd, _ = process_df(accounts, oct_start, end_day)
    _, df_all, _ = process_df(accounts, all_start, end_day)
    df_all = df_all.sort_index()
    df_mtd = df_mtd.sort_index()

    df_all["peak"] = df_all["end_balance_combined"].cummax()
    df_mtd["peak"] = df_all.loc[df_mtd.index, "peak"]
    df_mtd["drawdown"] = (df_mtd["end_balance_combined"] - df_mtd["peak"]) / df_mtd["peak"]
    current_dd = df_mtd["drawdown"].iloc[-1]

    return current_dd, max_dd_all
