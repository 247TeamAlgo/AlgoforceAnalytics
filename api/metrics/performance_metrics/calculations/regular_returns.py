# api/metrics/performance_metrics/calculations/regular_returns.py
from __future__ import annotations

from collections.abc import Iterable
from zoneinfo import ZoneInfo

import pandas as pd
from pandas import DataFrame, Series

from ....db.sql import read_earnings, read_trades, read_transactions


def _sessionize_sum(
    s: Series,
    *,
    day_start_hour: int = 8,
    tz: str = "Asia/Manila",
) -> Series:
    """Sum a timestamp-indexed Series into 'trading days' that start at `day_start_hour` local.

    Mapping (Asia/Manila):
      08:00 .. next-day 07:59  -> labeled by the start date (e.g., 2025-10-19).
      <= 07:59 of a calendar day -> rolls back to previous trading day.
    """
    if s.empty:
        return s

    # Ensure DatetimeIndex
    s = s.copy()
    idx = pd.DatetimeIndex(s.index)
    # Localize/convert preserving wall time semantics used elsewhere in CODE B
    if idx.tz is None:
        idx = idx.tz_localize(ZoneInfo(tz))
    else:
        idx = idx.tz_convert(ZoneInfo(tz))

    # Shift left by the session start, then floor to day to get the session label
    session_dates = (idx - pd.Timedelta(hours=day_start_hour)).floor("D").date
    s.index = pd.Index(session_dates, name="session_date")
    return s.groupby(level=0).sum()  # index is dtype 'object' of date; fine for serialization


def _parts_pnl(
    account: str,
    start_day: pd.Timestamp,
    end_day: pd.Timestamp,
) -> Series:
    """Build the raw event-level PnL series (trades net of fees, funding fees, earnings).
    This mirrors equity._daily_pnl's inputs, but without daily resampling; we keep
    the event timestamps to sessionize afterwards.
    """
    tr = read_trades(account, f"{start_day.date()} 00:00:00", f"{end_day.date()} 00:00:00")
    tx = read_transactions(account, f"{start_day.date()} 00:00:00", f"{end_day.date()} 00:00:00")
    er = read_earnings(account, f"{start_day.date()} 00:00:00", f"{end_day.date()} 00:00:00")

    parts: list[Series] = []
    if not tr.empty:
        parts.append(tr["realizedPnl"])  # already net of commission in read_trades
    if not tx.empty:
        it = tx["incomeType"].astype(str).str.upper()
        if it.eq("FUNDING_FEE").any():
            parts.append(tx.loc[it.eq("FUNDING_FEE"), "income"])
        # TRANSFER intentionally excluded
    if not er.empty:
        parts.append(er["rewards"])

    if not parts:
        return pd.Series(dtype="float64")

    s = pd.concat(parts).sort_index()
    s.index = pd.DatetimeIndex(s.index)
    return s


def regular_returns_by_session(
    accounts: Iterable[str],
    start_day: pd.Timestamp,
    end_day: pd.Timestamp,
    *,
    day_start_hour: int = 8,
    tz: str = "Europe/Zurich",
) -> DataFrame:
    """Return a DataFrame indexed by session_date with columns per account, where each cell
    is the sum of dollar PnL within the 08:00→07:59 local window (CODE A's 'regular_returns').
    """
    accs = [a.strip().lower() for a in accounts if a and a.strip()]
    frames: list[Series] = []
    for a in accs:
        s = _parts_pnl(a, start_day, end_day)
        sess = _sessionize_sum(s, day_start_hour=day_start_hour, tz=tz)
        frames.append(sess.rename(a))

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, axis=1).fillna(0.0).sort_index()
    df.index.name = "session_date"
    return df
