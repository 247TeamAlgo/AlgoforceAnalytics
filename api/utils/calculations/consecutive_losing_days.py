from __future__ import annotations

from typing import Dict, Any, List, Optional, Tuple
import pandas as pd

from ..io import load_accounts, read_account_trades


def _daily_trades_net(
    df: pd.DataFrame,
    *,
    start_day: pd.Timestamp,
    end_day: pd.Timestamp,
    day_start_hour: int,
) -> pd.Series:
    """
    Trades-only daily net PnL with local-day boundary defined by `day_start_hour`.
    Returns a date-indexed Series from start_day..end_day inclusive, filled with 0.0 where missing.
    """
    full_idx = pd.date_range(start_day, end_day, freq="D")

    if df.empty:
        return pd.Series(0.0, index=full_idx, dtype=float)

    s = df["realizedPnl"].copy()
    shifted_idx = df.index - pd.Timedelta(hours=day_start_hour)
    daily = s.groupby(shifted_idx.floor("D")).sum()
    daily = daily.reindex(full_idx, fill_value=0.0).astype(float)
    return daily


def _current_losing_streak_tail(
    daily: pd.Series,
    *,
    include_zero: bool = False,
    ignore_trailing_zero: bool = True,
    eps: float = 1e-9,
) -> Tuple[int, pd.Series]:
    """
    Count consecutive losing days from the most recent date backwards.

    Rules:
    - If the most recent day(s) are ~0, and ignore_trailing_zero=True, skip them entirely
      (they neither win nor lose).
    - Then count consecutive losses:
        include_zero=False -> x < -eps
        include_zero=True  -> x <=  eps (allows zeros inside the streak)
    """
    if daily.empty:
        return 0, daily.iloc[0:0]

    vals = [float(v) for v in daily.tolist()]

    def is_zero(x: float) -> bool:
        return abs(x) <= eps

    def is_loss(x: float) -> bool:
        return (x <= eps) if include_zero else (x < -eps)

    # 1) Skip trailing zeros (e.g., today's untraded day)
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

    # Tail slice includes exactly those streak days
    tail = daily.iloc[start - streak + 1 : start + 1]
    return streak, tail


def compute_consecutive_losses_mtd(
    *,
    override_accounts: Optional[List[str]] = None,
    day_start_hour: int = 8,
    include_zero: bool = False,
    ignore_trailing_zero: bool = True,
    eps: float = 1e-9,
) -> Dict[str, Any]:
    """
    Live MTD current (ongoing) losing streaks for trades-only.

    - Strict negative by default (zeros do NOT extend the streak).
    - Local 'day' boundary controlled by `day_start_hour` (default 08:00).
    - Trailing zeros (e.g., "today" = 0) are ignored when ignore_trailing_zero=True.
    - Returns per-account and combined, with the streak length and the exact tail days.
    """
    accounts = override_accounts if override_accounts is not None else load_accounts(True)
    today = pd.Timestamp.today().date()
    start_day = today.replace(day=1)
    end_day = today

    per_account: Dict[str, Any] = {}
    combined_daily = pd.Series(0.0, index=pd.date_range(start_day, end_day, freq="D"), dtype=float)

    for acc in accounts:
        df = read_account_trades(acc, f"{start_day} 00:00:00", f"{end_day} 23:59:59")
        daily = _daily_trades_net(df, start_day=start_day, end_day=end_day, day_start_hour=day_start_hour)

        streak, tail = _current_losing_streak_tail(
            daily,
            include_zero=include_zero,
            ignore_trailing_zero=ignore_trailing_zero,
            eps=eps,
        )

        per_account[acc] = {
            "consecutive": int(streak),
            "days": {ts.strftime("%Y-%m-%d"): float(v) for ts, v in tail.items()} if streak else {},
        }

        combined_daily = combined_daily.add(daily, fill_value=0.0)

    c_streak, c_tail = _current_losing_streak_tail(
        combined_daily,
        include_zero=include_zero,
        ignore_trailing_zero=ignore_trailing_zero,
        eps=eps,
    )
    combined = {
        "consecutive": int(c_streak),
        "days": {ts.strftime("%Y-%m-%d"): float(v) for ts, v in c_tail.items()} if c_streak else {},
    }

    return {
        "window": {
            "startDay": start_day.isoformat(),
            "endDay": end_day.isoformat(),
            "dayStartHour": day_start_hour,
        },
        "perAccount": per_account,
        "combined": combined,
    }
