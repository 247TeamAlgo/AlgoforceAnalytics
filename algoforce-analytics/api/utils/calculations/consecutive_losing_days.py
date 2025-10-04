# algoforce-analytics/api/utils/calculations/consecutive_losing_days.py
from __future__ import annotations

from typing import Dict, Any, List, Optional
import pandas as pd

from ..io import load_accounts, read_account_trades

def compute_consecutive_losses_mtd(
    * ,
    override_accounts: Optional[List[str]] = None,
    day_start_hour: int = 8,
) -> Dict[str, Any]:
    """
    MTD-only streaks, strict negative, with 08:00 boundary default.
    """
    accounts = override_accounts if override_accounts is not None else load_accounts(True)

    today = pd.Timestamp.today().date()
    start_day = today.replace(day=1)

    def daily_net(df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            rng = pd.date_range(start_day, today, freq="D")
            return pd.DataFrame({"day": rng.strftime("%Y-%m-%d"), "net_pnl": 0.0})
        shifted = df.copy()
        shifted.index = shifted.index - pd.Timedelta(hours=day_start_hour)
        g = (
            shifted["realizedPnl"]
            .groupby(shifted.index.date)
            .sum()
            .rename("net_pnl")
            .rename_axis("day")
            .reset_index()
        )
        g["day"] = pd.to_datetime(g["day"]).dt.strftime("%Y-%m-%d")
        full = pd.DataFrame({"day": pd.date_range(start_day, today, freq="D").strftime("%Y-%m-%d")})
        out = full.merge(g, on="day", how="left")
        out["net_pnl"] = out["net_pnl"].fillna(0.0).astype(float)
        return out[["day", "net_pnl"]]

    def max_streak_strict_neg(daily_df: pd.DataFrame) -> int:
        s = 0
        m = 0
        for v in daily_df["net_pnl"].tolist():
            loss = v < 0.0
            s = s + 1 if loss else 0
            if s > m:
                m = s
        return m

    per_account: Dict[str, Dict[str, Any]] = {}
    frames: List[pd.DataFrame] = []

    for acc in accounts:
        df = read_account_trades(acc, f"{start_day} 00:00:00", f"{today} 23:59:59")
        d = daily_net(df)
        per_account[acc] = {"maxStreak": max_streak_strict_neg(d)}
        frames.append(d.rename(columns={"net_pnl": acc}))

    if frames:
        comb = frames[0].copy()
        for d in frames[1:]:
            comb = comb.merge(d, on="day", how="inner")
        value_cols = [c for c in comb.columns if c != "day"]
        comb["net_pnl"] = comb[value_cols].sum(axis=1)
        combined_daily = comb[["day", "net_pnl"]]
        combined_streak = max_streak_strict_neg(combined_daily)
        combined_daily_map = {row["day"]: float(row["net_pnl"]) for _, row in combined_daily.iterrows()}
    else:
        combined_streak = 0
        combined_daily_map = {}

    return {
        "window": {"startDay": start_day.isoformat(), "endDay": today.isoformat(), "dayStartHour": day_start_hour},
        "perAccount": per_account,
        "combined": {"maxStreak": combined_streak},
        "daily": {"combined": combined_daily_map},
    }
