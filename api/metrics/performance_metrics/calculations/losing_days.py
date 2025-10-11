# api/metrics/performance_metrics/calculations/losing_days.py
"""Compute live month-to-date losing streaks (trades-only, exclude today).

Rules:
- Daily PnL by PH cut (08:00).
- Strict negatives only (< 0) count as losing. Zeros are neutral.
- Skip trailing zeros when counting.
- Combined streak is computed from the sum of per-day PnL across all accounts.
"""

from __future__ import annotations

import pandas as pd

from ....db.sql import read_trades


def _daily_trades_net(
    df: pd.DataFrame,
    start_day: pd.Timestamp,
    end_day: pd.Timestamp,
    day_start_hour: int,
) -> pd.Series:
    """Trades-only daily net PnL with a local-day boundary shift (day_start_hour)."""
    full_idx = pd.date_range(start_day.normalize(), end_day.normalize(), freq="D")

    if df.empty:
        return pd.Series(0.0, index=full_idx, dtype="float64")

    # Ensure types
    s = pd.to_numeric(df["realizedPnl"], errors="coerce").fillna(0.0).astype("float64")
    idx = pd.DatetimeIndex(df.index)

    # Shift timestamps backward by the local day-start hour, then sum into days
    shifted_idx = idx - pd.Timedelta(hours=day_start_hour)
    shifted = pd.Series(s.values, index=shifted_idx, dtype="float64")

    daily = shifted.resample("D").sum()
    return daily.reindex(full_idx, fill_value=0.0).astype("float64")


def _streak_from_series(daily: pd.Series, *, eps: float = 1e-9) -> tuple[int, pd.Series]:
    """Count consecutive strictly-negative days from the end, skipping trailing zeros."""
    if daily.empty:
        return 0, daily.iloc[0:0]

    vals = [float(v) for v in daily.tolist()]

    # Skip trailing ~0.0
    i = len(vals) - 1
    while i >= 0 and abs(vals[i]) <= eps:
        i -= 1
    if i < 0:
        return 0, daily.iloc[0:0]

    # Count consecutive losses
    start = i
    streak = 0
    while i >= 0 and (vals[i] < -eps):
        streak += 1
        i -= 1

    if streak == 0:
        return 0, daily.iloc[0:0]

    tail = daily.iloc[start - streak + 1 : start + 1]
    return streak, tail


def _series_to_day_map(s: pd.Series) -> dict[str, float]:
    """Convert a DatetimeIndex series to {YYYY-mm-dd: float} with explicit typing."""
    if s.empty:
        return {}
    idx = pd.DatetimeIndex(s.index)
    keys = [dt.strftime("%Y-%m-%d") for dt in idx.to_pydatetime()]
    vals = [float(v) for v in s.to_numpy(dtype="float64", copy=False)]
    return dict(zip(keys, vals, strict=False))


def losing_days_mtd(accounts: list[str], day_start_hour: int) -> dict[str, object]:
    """Compute per-account and combined losing streaks for MTD (excluding today)."""
    today = pd.Timestamp.today().normalize()
    start = today.replace(day=1)
    yesterday = today - pd.Timedelta(days=1)

    # Combined series (sum of daily PnL across accounts)
    combined_daily = pd.Series(
        0.0, index=pd.date_range(start, yesterday, freq="D"), dtype="float64"
    )

    per: dict[str, dict[str, object]] = {}

    for a in accounts:
        df = read_trades(a, f"{start.date()} 00:00:00", f"{yesterday.date()} 23:59:59")
        daily = _daily_trades_net(df, start, yesterday, day_start_hour)
        streak, tail = _streak_from_series(daily, eps=1e-9)

        per[a] = {
            "consecutive": int(streak),
            "days": _series_to_day_map(tail) if streak else {},
        }

        combined_daily = combined_daily.add(daily, fill_value=0.0)

    c_streak, c_tail = _streak_from_series(combined_daily, eps=1e-9)
    combined = {
        "consecutive": int(c_streak),
        "days": _series_to_day_map(c_tail) if c_streak else {},
    }

    return {"perAccount": per, "combined": combined}
