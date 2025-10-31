# api/metrics/performance_metrics/calculations/losing_days.py
"""Compute live month-to-date losing streaks (trades-only, using 08:00 local cut).

Rules:
- Daily PnL by local cut (day_start_hour, e.g., 08:00).
- A "day" is counted only after the *next* 08:00 cut passes (i.e., the 24h window is complete).
  Example: At 2025-10-12 01:33, the day labeled 2025-10-11 is NOT closed yet
  (it closes at 2025-10-12 08:00), so it must be excluded.
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


def _last_complete_label(now: pd.Timestamp, day_start_hour: int) -> pd.Timestamp | None:
    """Return the last fully-closed 'shifted-day' label under the given cut.

    With an 08:00 cut:
      - If now >= today@08:00, the last complete label is (today - 1).
      - If now <  today@08:00, the last complete label is (today - 2).

    Returns None if there is no complete label within the current month start window.
    """
    today = now.normalize()
    today_cut = today + pd.Timedelta(hours=day_start_hour)

    if now >= today_cut:
        return today - pd.Timedelta(days=1)
    else:
        return today - pd.Timedelta(days=2)


def losing_days_mtd(
    accounts: list[str], day_start_hour: int, start_day: pd.Timestamp, today: pd.Timestamp
) -> dict[str, object]:
    """Compute per-account and combined losing streaks for MTD, using complete 08:00-cut days only."""
    # now = pd.Timestamp.now()  # naive local; aligns with DB local usage
    # today = now.normalize()
    # month_start = today.replace(day=1)

    # Determine the latest *complete* shifted-day label were allowed to include.
    last_complete = _last_complete_label(today, day_start_hour)
    # print(f"last_complete={last_complete} month_start={start_day}")
    if last_complete is None or last_complete < start_day:
        # Nothing complete yet this month (e.g., early morning on the 1st/2nd before the cut).
        return {"perAccount": {}, "combined": {"consecutive": 0, "days": {}}}

    # Build the index we will allow (month_start .. last_complete).
    idx_end = last_complete
    full_idx = pd.date_range(start_day, idx_end, freq="D")

    # Combined series (sum of daily PnL across accounts)
    combined_daily = pd.Series(0.0, index=full_idx, dtype="float64")

    per: dict[str, dict[str, object]] = {}

    for a in accounts:
        # Read trades up to 'now' so resampling has the data it needs,
        # but _daily_trades_net will reindex to full_idx (capping at last_complete).
        df = read_trades(
            a,
            f"{start_day.date()} 00:00:00",
            today.strftime("%Y-%m-%d %H:%M:%S"),
        )
        daily = _daily_trades_net(df, start_day, idx_end, day_start_hour)
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
