# process_df.py
from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

from ....db.redis_v2 import wallet_balance

# helpers
from ....db.sql_v2 import get_data


def process_df(
    accs: str | Iterable[str],
    start_date: str | pd.Timestamp,
    end_date: str | pd.Timestamp,
) -> tuple[dict[str, dict[str, pd.DataFrame]], pd.DataFrame, pd.DataFrame]:
    # --- normalize inputs ---
    acc_list = [accs] if isinstance(accs, str) else list(accs)
    results: dict[str, dict[str, pd.DataFrame]] = {}

    start_ts = pd.to_datetime(start_date)
    end_ts = pd.to_datetime(end_date)

    for acc in acc_list:
        # --- load & normalize ---
        balance = get_data(acc, "balance", "balance").copy()
        trades = get_data(acc, "trades", "trades").copy()
        trnsc_history = get_data(acc, "transaction", "transaction_history").copy()
        earnings = get_data(acc, "earnings", "earnings").copy()

        balance["datetime"] = pd.to_datetime(balance["datetime"], errors="coerce")
        trades["time"] = pd.to_datetime(trades["time"], errors="coerce")
        trnsc_history["time"] = pd.to_datetime(trnsc_history["time"], errors="coerce")
        earnings["time"] = pd.to_datetime(earnings["time"], errors="coerce")

        balance = balance.sort_values("datetime")
        trades = trades.sort_values("time")
        trnsc_history = trnsc_history.sort_values("time")
        earnings = earnings.sort_values("time")

        # --- nearest balance snapshot on/before start_ts ---
        balance_before = balance.loc[balance["datetime"] <= start_ts]
        if not balance_before.empty:
            nearest_balance_val: float = float(balance_before.iloc[-1]["overall_balance"])
            new_start_ts: pd.Timestamp = pd.Timestamp(balance_before.iloc[-1]["datetime"])
        else:
            nearest_balance_val = float(balance.iloc[0]["overall_balance"])
            new_start_ts = pd.Timestamp(balance.iloc[0]["datetime"])

        # --- window the ledgers ---
        trades_f = trades.loc[(trades["time"] >= new_start_ts) & (trades["time"] <= end_ts)].copy()
        trnsc_f = trnsc_history.loc[
            (trnsc_history["time"] >= new_start_ts) & (trnsc_history["time"] <= end_ts)
        ].copy()
        earnings_f = earnings.loc[
            (earnings["time"] >= new_start_ts) & (earnings["time"] <= end_ts)
        ].copy()

        # realized pnl net of fees
        trades_f["dollar_val"] = trades_f["realizedPnl"].astype(float) - trades_f[
            "commission"
        ].astype(float)
        trades_f["transaction_type"] = "realizedPnl"
        trades_df = trades_f[["time", "dollar_val", "transaction_type"]]

        # funding fees from transactions
        trnsc_funding = trnsc_f.loc[
            trnsc_f["incomeType"].astype(str).str.upper() == "FUNDING_FEE"
        ].copy()
        trnsc_funding["dollar_val"] = trnsc_funding["income"].astype(float)
        trnsc_funding["transaction_type"] = "funding_fee"
        funding_df = trnsc_funding[["time", "dollar_val", "transaction_type"]]

        # earnings
        earnings_f["dollar_val"] = earnings_f["rewards"].astype(float)
        earnings_f["transaction_type"] = "earnings"
        earnings_df = earnings_f[["time", "dollar_val", "transaction_type"]]

        # unified ledger
        ledger = pd.concat([trades_df, earnings_df, funding_df], ignore_index=True)
        ledger = ledger.sort_values("time").reset_index(drop=True)
        ledger["running_balance"] = nearest_balance_val + ledger["dollar_val"].cumsum()

        # initial balance at start (prefer exact 23:59:59 before start; else last before start)
        before_start = ledger.loc[ledger["time"] < start_ts]
        if not before_start.empty:
            mask = (
                (before_start["time"].dt.hour == 23)
                & (before_start["time"].dt.minute == 59)
                & (before_start["time"].dt.second == 59)
            )
            if mask.any():
                initial_balance_at_start = float(before_start.loc[mask, "running_balance"].iloc[-1])
            else:
                initial_balance_at_start = float(before_start["running_balance"].iloc[-1])
        else:
            initial_balance_at_start = nearest_balance_val

        # recompute running balance from start
        ledger_final = ledger.loc[ledger["time"] >= start_ts].copy()
        ledger_final["running_balance"] = (
            initial_balance_at_start + ledger_final["dollar_val"].cumsum()
        )
        ledger_final = ledger_final.loc[ledger_final["transaction_type"] != "transfer"].reset_index(
            drop=True
        )

        # daily last balance
        daily_balances = ledger_final.groupby(ledger_final["time"].dt.floor("D"))[
            "running_balance"
        ].last()
        daily_balances.index.name = "date"

        # inject UPnL into most recent day
        upnl: float = float(wallet_balance(acc))
        if not daily_balances.empty:
            daily_balances.iloc[-1] = float(daily_balances.iloc[-1]) + upnl

        daily_returns = daily_balances.pct_change().fillna(0.0)
        peaks = daily_balances.cummax()
        peaks = peaks.replace(0.0, pd.NA)  # avoid div-by-zero
        daily_drawdowns = (daily_balances - peaks) / peaks

        daily_report = pd.DataFrame(
            {
                "end_balance": daily_balances.values,
                "daily_return": daily_returns.values,
                "daily_drawdown": daily_drawdowns.values,
            },
            index=daily_balances.index,
        ).reset_index(names="date")

        # --- Monthly stats via resample (sidestep strftime typing) ---
        dr_idx = daily_report.set_index("date")
        monthly = dr_idx.resample("M")
        monthly_stats = monthly.apply(
            lambda dfm: pd.Series(
                {
                    "monthly_return": float(
                        dfm["end_balance"].iloc[-1] / dfm["end_balance"].iloc[0] - 1.0
                    ),
                    "monthly_drawdown": float(dfm["daily_drawdown"].min()),
                }
            )
        ).reset_index()
        monthly_stats["month"] = monthly_stats["date"].dt.to_period("M").astype(str)
        monthly_report = monthly_stats.drop(columns=["date"])

        results[acc] = {"daily": daily_report, "monthly": monthly_report}

    # --- Combined portfolio (deterministic construction; no None narrowing issues) ---
    combined_daily: pd.DataFrame
    combined_monthly: pd.DataFrame

    if len(acc_list) > 1:
        series_list: list[pd.Series] = [
            results[a]["daily"].set_index("date")["end_balance"].rename(f"end_balance_{a}")
            for a in acc_list
        ]
        if series_list:
            combined = (
                pd.concat(series_list, axis=1).sort_index().ffill()
            )  # <- use ffill(), not fillna(method="ffill")
            combined["end_balance_combined"] = combined.sum(axis=1, numeric_only=True)
            combined["daily_return_combined"] = (
                combined["end_balance_combined"].pct_change().fillna(0.0)
            )
            c_peaks = combined["end_balance_combined"].cummax().replace(0.0, pd.NA)
            combined["daily_drawdown_combined"] = (
                combined["end_balance_combined"] - c_peaks
            ) / c_peaks

            combined_daily = combined.reset_index().rename(columns={"index": "date"})

            monthly_c = combined.resample("M")
            monthly_combined = monthly_c.apply(
                lambda dfm: pd.Series(
                    {
                        "monthly_return_combined": float(
                            dfm["end_balance_combined"].iloc[-1]
                            / dfm["end_balance_combined"].iloc[0]
                            - 1.0
                        ),
                        "monthly_drawdown_combined": float(dfm["daily_drawdown_combined"].min()),
                    }
                )
            ).reset_index()
            monthly_combined["month"] = monthly_combined["date"].dt.to_period("M").astype(str)
            combined_monthly = monthly_combined.drop(columns=["date"])

    return results, combined_daily, combined_monthly
