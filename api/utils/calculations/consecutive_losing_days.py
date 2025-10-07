# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\calculations\consecutive_losing_days.py  # noqa: E501
"""Compute live month-to-date consecutive losing streaks (trades-only).

This module provides utilities to aggregate daily realized PnL using a local-day
boundary (via an hour offset) and to compute the current losing streak per
account and combined.
"""

from __future__ import annotations

from typing import TypedDict

import pandas as pd

from ..io import load_accounts, read_account_trades


class Window(TypedDict):
    """Response window metadata."""

    startDay: str
    endDay: str
    dayStartHour: int


class Streak(TypedDict):
    """Per-entity losing-streak summary."""

    consecutive: int
    days: dict[str, float]


class Result(TypedDict):
    """Top-level response structure."""

    window: Window
    perAccount: dict[str, Streak]
    combined: Streak


def _daily_trades_net(
    df: pd.DataFrame,
    *,
    start_day: pd.Timestamp,
    end_day: pd.Timestamp,
    day_start_hour: int,
) -> pd.Series:
    """Trades-only daily net PnL with local-day boundary defined by `day_start_hour`.

    Returns a date-indexed Series from start_day..end_day inclusive, filled with 0.0
    where missing. Index is a DatetimeIndex at daily frequency.
    """
    # Full daily index window
    full_idx: pd.DatetimeIndex = pd.date_range(start_day.normalize(), end_day.normalize(), freq="D")

    if df.empty:
        return pd.Series(0.0, index=full_idx, dtype=float)

    # Ensure realizedPnl is float and the index is a DatetimeIndex
    s: pd.Series = df["realizedPnl"].astype(float).copy()
    idx: pd.DatetimeIndex = pd.DatetimeIndex(df.index)

    # Shift timestamps backward by the local day-start hour, then resample to days
    shifted_idx: pd.DatetimeIndex = idx - pd.Timedelta(hours=day_start_hour)
    shifted: pd.Series = pd.Series(s.values, index=shifted_idx, dtype=float)

    # Sum within each (shifted) calendar day, then reindex to the full window
    daily: pd.Series = shifted.resample("D").sum()
    daily = daily.reindex(full_idx, fill_value=0.0).astype(float)
    return daily


def _current_losing_streak_tail(
    daily: pd.Series,
    *,
    include_zero: bool = False,
    ignore_trailing_zero: bool = True,
    eps: float = 1e-9,
) -> tuple[int, pd.Series]:
    """Count consecutive losing days from the most recent date backwards.

    Rules:
    - If the most recent day(s) are ~0 and `ignore_trailing_zero=True`, skip them.
    - Then count consecutive losses:
        include_zero=False -> x < -eps
        include_zero=True  -> x <=  eps (allows zeros inside the streak)
    Returns (streak_length, tail_series_of_streak_days).
    """
    if daily.empty:
        # Empty tail with the same dtype
        return 0, daily.iloc[0:0]

    vals = [float(v) for v in daily.tolist()]

    def is_zero(x: float) -> bool:
        return abs(x) <= eps

    def is_loss(x: float) -> bool:
        return (x <= eps) if include_zero else (x < -eps)

    # 1) Skip trailing zeros (e.g., "today" untraded)
    i = len(vals) - 1
    if ignore_trailing_zero:
        while i >= 0 and is_zero(vals[i]):
            i -= 1
    if i < 0:
        return 0, daily.iloc[0:0]

    # 2) Count consecutive losses backward from the last non-zero day
    start = i
    streak = 0
    while i >= 0 and is_loss(vals[i]):
        streak += 1
        i -= 1

    if streak == 0:
        return 0, daily.iloc[0:0]

    tail: pd.Series = daily.iloc[start - streak + 1 : start + 1]
    return streak, tail


def _tail_days_dict(tail: pd.Series) -> dict[str, float]:
    """Convert a tail Series (DatetimeIndex) into {YYYY-MM-DD: value}.

    Important: avoids `Hashable` keys from `Series.items()` by first coercing
    the index to `DatetimeIndex` and then to Python `datetime` objects.
    """
    if tail.empty:
        return {}
    idx: pd.DatetimeIndex = pd.DatetimeIndex(tail.index)
    # `to_pydatetime` returns a list[datetime]; `.strftime` is well-typed.
    keys: list[str] = [dt.strftime("%Y-%m-%d") for dt in idx.to_pydatetime()]
    vals: list[float] = [float(x) for x in tail.tolist()]
    return dict(zip(keys, vals, strict=False))


def compute_consecutive_losses_mtd(
    *,
    override_accounts: list[str] | None = None,
    day_start_hour: int = 8,
    include_zero: bool = False,
    ignore_trailing_zero: bool = True,
    eps: float = 1e-9,
) -> Result:
    """Live MTD current (ongoing) losing streaks for trades-only.

    - Strict negative by default (zeros do NOT extend the streak).
    - Local 'day' boundary controlled by `day_start_hour` (default 08:00).
    - Trailing zeros (e.g., "today" = 0) are ignored when `ignore_trailing_zero=True`.
    Returns a typed dict with the window, per-account results, and the combined result.
    """
    accounts = override_accounts if override_accounts is not None else load_accounts(True)

    # Use normalized pandas Timestamps (not `date`) to satisfy caller annotations
    today: pd.Timestamp = pd.Timestamp.today().normalize()
    start_day: pd.Timestamp = today.replace(day=1)
    end_day: pd.Timestamp = today

    per_account: dict[str, Streak] = {}
    combined_daily: pd.Series = pd.Series(
        0.0, index=pd.date_range(start_day, end_day, freq="D"), dtype=float
    )

    for acc in accounts:
        # These functions are external; we normalize anything we depend on.
        df = read_account_trades(acc, f"{start_day.date()} 00:00:00", f"{end_day.date()} 23:59:59")

        # Guarantee datetime index for downstream ops
        if not isinstance(df.index, pd.DatetimeIndex):
            df = df.copy()
            df.index = pd.DatetimeIndex(df.index)

        daily = _daily_trades_net(
            df, start_day=start_day, end_day=end_day, day_start_hour=day_start_hour
        )

        streak, tail = _current_losing_streak_tail(
            daily,
            include_zero=include_zero,
            ignore_trailing_zero=ignore_trailing_zero,
            eps=eps,
        )

        days_dict: dict[str, float] = _tail_days_dict(tail) if streak else {}

        per_account[acc] = Streak(consecutive=int(streak), days=days_dict)

        combined_daily = combined_daily.add(daily, fill_value=0.0)

    c_streak, c_tail = _current_losing_streak_tail(
        combined_daily,
        include_zero=include_zero,
        ignore_trailing_zero=ignore_trailing_zero,
        eps=eps,
    )

    combined_days: dict[str, float] = _tail_days_dict(c_tail) if c_streak else {}
    combined: Streak = Streak(consecutive=int(c_streak), days=combined_days)

    result: Result = Result(
        window=Window(
            startDay=start_day.date().isoformat(),
            endDay=end_day.date().isoformat(),
            dayStartHour=day_start_hour,
        ),
        perAccount=per_account,
        combined=combined,
    )
    return result
