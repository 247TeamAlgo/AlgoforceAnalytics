# api/metrics/performance_metrics/performance_metrics.py
"""Top-level helpers to build performance metrics payloads for the API.

Changes:
- Reflect UPnL (from up_map) into the MTD realized percent by injecting per-account
  UPnL into the last row of the realized equity series before computing mtd_return.
- Expose both realized MTD% variants:
    * mtd_ret_realized_pure:      realized-only (no UPnL)
    * mtd_ret_realized_with_upnl: realized + last-row UPnL injection (used in payload)
- Remove any hardcoded strategy names. Strategy aggregation is derived dynamically
  from api/data/accounts.json and exposed as `performanceByStrategy`.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import TypedDict, cast
from zoneinfo import ZoneInfo

import pandas as pd
from pandas import DataFrame

from ...core.config import now_utc_iso
from ...db.baseline import read_unrealized_json
from ...db.redis import read_upnl, upnl_payload
from ...db.sql import nearest_balance_on_or_before
from .calculations.all_time_dd import compute_all_time_max_current_dd
from .calculations.drawdown import mtd_max_dd_from_levels
from .calculations.equity import build_fixed_balances, build_margin_series
from .calculations.losing_days import losing_days_mtd
from .calculations.pnl_by_symbol import pnl_by_symbol_mtd
from .calculations.regular_returns import regular_returns_by_session
from .calculations.returns import (
    live_return_margin,
    live_return_realized,
    mtd_return,
)

# ---------- Small, typed helpers ----------


def _mtd_window_today() -> tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp]:
    """Return (start_of_month_local@00:00, today_local@00:00, yesterday_local@00:00).

    Europe/Zurich anchored. Returns tz-naive timestamps that preserve local wall times.
    """
    tz = ZoneInfo("Europe/Zurich")

    # Keep today's DATE, force TIME to 00:00:00 (tz-aware)
    now_local = pd.Timestamp.now(tz=tz).replace(hour=0, minute=0, second=0, microsecond=0)

    # First of this month, TIME 00:00:00 (tz-aware). Date remains the 1st.
    start_local = now_local.replace(day=1)

    # Yesterday at 00:00:00 (tz-aware)
    yesterday_local = now_local - pd.Timedelta(days=1)

    # Make tz-naive WITHOUT changing wall times
    return (
        start_local.tz_localize(None),
        now_local.tz_localize(None),
        yesterday_local.tz_localize(None),
    )


def _serialize_series(df: pd.DataFrame, accounts: list[str]) -> dict[str, dict[str, float]]:
    """Serialize a date-indexed frame into {ts: {acc: val, ..., total: val}}."""
    if df.empty:
        return {}
    cols = [a for a in accounts if a in df.columns]
    out: dict[str, dict[str, float]] = {}
    for ts, row in df[cols].sort_index().iterrows():
        per = {a: float(row[a]) for a in cols}
        per["total"] = float(sum(per.values()))
        out[str(ts)] = per
    return out


def _last_index(df: pd.DataFrame) -> pd.Timestamp | None:
    """Return the last timestamp, or None if the DataFrame is empty."""
    if df.empty:
        return None
    try:
        return pd.Timestamp(df.index[-1])
    except Exception:
        return None


def _float_scalar(x: object) -> float:
    """Lenient scalar → float with pandas/numpy compatibility, no bare float(obj)."""
    if isinstance(x, float | int):
        return float(x)
    try:
        ser = pd.Series([x])
        num = pd.to_numeric(ser, errors="coerce").iloc[0]
        return float(num) if pd.notna(num) else 0.0
    except Exception:
        return 0.0


def _sum_row(df: pd.DataFrame, idx: pd.Timestamp | None, cols: list[str]) -> float:
    """Sum a set of columns at a row index, robust for typing/stubs."""
    if df.empty or idx is None:
        return 0.0
    try:
        row = df.loc[idx]
    except Exception:
        return 0.0
    if not isinstance(row, pd.Series):
        return 0.0
    take = [c for c in cols if c in row.index]
    if not take:
        return 0.0
    ser = pd.to_numeric(row[take], errors="coerce")
    return float(ser.fillna(0.0).sum())


def _offset_fixed_with_initial(
    fixed_delta: pd.DataFrame,
    init_map: dict[str, float],
    accounts: list[str],
) -> pd.DataFrame:
    """Turn per-period deltas into realized equity by adding SQL initial balances."""
    if fixed_delta.empty:
        return fixed_delta
    fixed = fixed_delta.copy()
    for a in accounts:
        if a in fixed.columns:
            fixed[a] = fixed[a] + float(init_map.get(a, 0.0))
    return fixed


def _inject_upnl_last_row(
    levels: DataFrame, up_map: dict[str, float], accounts: list[str]
) -> DataFrame:
    """Return a copy of `levels` where each account's last row is incremented by its UPnL."""
    if levels.empty:
        return levels
    out = levels.copy()
    last = out.index[-1]
    for a in accounts:
        if a in out.columns:
            base = _float_scalar(out.at[last, a])
            out.at[last, a] = base + float(up_map.get(a, 0.0))
    return out


def _live_returns_block(
    accs: list[str],
    fixed: pd.DataFrame,
    init_map: dict[str, float],
    up_map: dict[str, float],
    unreal_map: dict[str, float],
) -> tuple[
    dict[str, float],
    dict[str, float],
    dict[str, float],
    dict[str, float],
    float,
    float,
    float,
    float,
]:
    """Compute live realized/margin returns (USD and %) per account and totals."""
    last_ts = _last_index(fixed)
    realized_usd: dict[str, float] = {}
    realized_pct: dict[str, float] = {}
    margin_usd: dict[str, float] = {}
    margin_pct: dict[str, float] = {}

    for a in accs:
        init = float(init_map.get(a, 0.0))
        last_realized = (
            _float_scalar(fixed.loc[last_ts, a]) if (last_ts and a in fixed.columns) else 0.0
        )
        upnl = float(up_map.get(a, 0.0))
        ujson = float(unreal_map.get(a, 0.0))

        usd_r, pct_r = live_return_realized(last_realized, init, upnl)
        usd_m, pct_m = live_return_margin(last_realized, init, ujson, upnl)

        realized_usd[a], realized_pct[a] = usd_r, pct_r
        margin_usd[a], margin_pct[a] = usd_m, pct_m

    init_total = float(sum(init_map.get(a, 0.0) for a in accs))
    unreal_total = float(sum(unreal_map.get(a, 0.0) for a in accs))
    last_realized_total = _sum_row(fixed, last_ts, accs)
    up_total = float(up_map.get("total", 0.0))

    live_total = last_realized_total + up_total
    realized_usd["total"] = live_total - init_total
    realized_pct["total"] = (live_total / init_total - 1.0) if init_total else 0.0

    margin_usd["total"] = live_total - (init_total + unreal_total)
    denom_margin_total = init_total + unreal_total
    margin_pct["total"] = (live_total / denom_margin_total - 1.0) if denom_margin_total else 0.0

    return (
        realized_usd,
        realized_pct,
        margin_usd,
        margin_pct,
        init_total,
        last_realized_total,
        live_total,
        unreal_total,
    )


def _current_dd_block(
    accs: list[str],
    fixed: pd.DataFrame,
    margin: pd.DataFrame,
    up_map: dict[str, float],
) -> tuple[dict[str, float], dict[str, float]]:
    """Compute current drawdown per account and totals for realized and margin."""
    last_ts = _last_index(fixed)

    fixed_total = fixed.assign(total=fixed[accs].sum(axis=1)) if not fixed.empty else fixed
    margin_total = margin.assign(total=margin[accs].sum(axis=1)) if not margin.empty else margin

    peak_fixed_total = (
        _float_scalar(fixed_total["total"].cummax().iloc[-1]) if not fixed_total.empty else 0.0
    )
    peak_margin_total = (
        _float_scalar(margin_total["total"].cummax().iloc[-1]) if not margin_total.empty else 0.0
    )

    last_realized_total = _sum_row(fixed, last_ts, accs)
    up_total = float(up_map.get("total", 0.0))
    curr_realized_total = last_realized_total + up_total
    last_margin_total = _sum_row(margin, last_ts, accs)

    curr_dd_realized_total = (
        ((curr_realized_total - peak_fixed_total) / peak_fixed_total) if peak_fixed_total else 0.0
    )
    curr_dd_margin_total = (
        ((last_margin_total - peak_margin_total) / peak_margin_total) if peak_margin_total else 0.0
    )

    current_dd_realized: dict[str, float] = {"total": curr_dd_realized_total}
    current_dd_margin: dict[str, float] = {"total": curr_dd_margin_total}

    for a in accs:
        if not fixed.empty and a in fixed.columns:
            peak_a = _float_scalar(fixed[a].cummax().iloc[-1])
            live_a = (
                (_float_scalar(fixed.loc[last_ts, a]) + float(up_map.get(a, 0.0)))
                if last_ts
                else 0.0
            )
            current_dd_realized[a] = (live_a - peak_a) / peak_a if peak_a else 0.0
        else:
            current_dd_realized[a] = 0.0

        if not margin.empty and a in margin.columns:
            peak_ma = _float_scalar(margin[a].cummax().iloc[-1])
            live_ma = _float_scalar(margin.loc[last_ts, a]) if last_ts else 0.0
            current_dd_margin[a] = (live_ma - peak_ma) / peak_ma if peak_ma else 0.0
        else:
            current_dd_margin[a] = 0.0

    return current_dd_realized, current_dd_margin


# ---------- Accounts.json helpers (dynamic strategy grouping) ----------


class AccountMeta(TypedDict):
    """Metadata for an account entry loaded from api/data/accounts.json.

    Keys:
        binanceName: Exchange display name for the account.
        redisName: Name used as the Redis key (normalized/lowercased).
        dbName: Database identifier for SQL lookups.
        strategy: Strategy or group name the account belongs to.
        leverage: Leverage used for the account (integer).
        monitored: Whether this account is monitored by the system.
    """

    binanceName: str
    redisName: str
    dbName: str
    strategy: str
    leverage: int
    monitored: bool


def _find_accounts_json() -> Path | None:
    """Try plausible locations for api/data/accounts.json relative to this file."""
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "data" / "accounts.json",  # api/metrics/... -> api/data/accounts.json
        here.parents[3] / "api" / "data" / "accounts.json",  # project-root/api/data/accounts.json
        Path("api/data/accounts.json"),  # cwd relative
        Path("data/accounts.json"),
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _load_accounts_index() -> dict[str, AccountMeta]:
    """Load accounts.json and index by lowercased redisName."""
    path = _find_accounts_json()
    if not path:
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        items = cast(list[AccountMeta], data)
    except Exception:
        return {}
    index: dict[str, AccountMeta] = {}
    for row in items:
        rn = str(row.get("redisName", "")).strip().lower()
        if rn:
            index[rn] = row
    return index


def _group_accounts_by_strategy(
    accs: list[str],
    accounts_index: dict[str, AccountMeta],
    include_none: bool = False,
) -> dict[str, list[str]]:
    """Build {strategy: [accounts...]} for the requested accounts."""
    groups: dict[str, list[str]] = {}
    for a in accs:
        meta = accounts_index.get(a.lower())
        strategy = (meta.get("strategy") if meta else None) or "None"
        if not include_none and strategy.lower() == "none":
            continue
        groups.setdefault(strategy, []).append(a)
    return groups


# ---------- Main entry ----------


def build_metrics_payload(accounts: Sequence[str]) -> dict[str, object]:
    """Return the full metrics payload for requested accounts."""
    accs = [a.strip().lower() for a in accounts if a.strip()]
    start_day, today, _yesterday = _mtd_window_today()
    print(f"start_day = {start_day}")
    print(f"today = {today}")

    # Initial balances (SQL only)
    init_map: dict[str, float] = {}
    zero_initial: list[str] = []
    for a in accs:
        bal, _ts = nearest_balance_on_or_before(a, start_day)
        init_map[a] = float(bal)
        if bal == 0.0:
            zero_initial.append(a)

    # Realized equity (SQL deltas + SQL initial), daily through today
    fixed_delta, _ = build_fixed_balances(accs, start_day, today)
    fixed = _offset_fixed_with_initial(fixed_delta, init_map, accs)

    # Baselines and UPnL
    up_map = read_upnl(accs)  # {acc: upnl, ..., "total": ...}
    unreal_map = read_unrealized_json()  # {acc: unrealized_json_baseline, ...}

    # Margin equity (shift by unrealized.json across the index + inject UPNL on the last row)
    margin = build_margin_series(fixed, unreal_map, up_map, accs)

    # Realized MTD returns
    fixed_total_pure = fixed.assign(total=fixed[accs].sum(axis=1)) if not fixed.empty else fixed
    mtd_ret_realized_pure = mtd_return(fixed_total_pure) if not fixed_total_pure.empty else {}

    fixed_with_up = _inject_upnl_last_row(fixed, up_map, accs)
    fixed_total_with_up = (
        fixed_with_up.assign(total=fixed_with_up[accs].sum(axis=1))
        if not fixed_with_up.empty
        else fixed_with_up
    )
    mtd_ret_realized_with_upnl = (
        mtd_return(fixed_total_with_up) if not fixed_total_with_up.empty else {}
    )

    # Margin MTD returns
    margin_total = margin.assign(total=margin[accs].sum(axis=1)) if not margin.empty else margin
    mtd_ret_margin = mtd_return(margin_total) if not margin_total.empty else {}

    # Live returns
    (
        realized_usd,
        realized_pct,
        margin_usd,
        margin_pct,
        init_total,
        _last_realized_total,
        _live_total,
        _unreal_total,
    ) = _live_returns_block(accs, fixed, init_map, up_map, unreal_map)

    # Drawdowns
    current_dd_realized, current_dd_margin = _current_dd_block(accs, fixed, margin, up_map)
    mdd_fixed = mtd_max_dd_from_levels(fixed_total_pure) if not fixed_total_pure.empty else {}
    mdd_margin = mtd_max_dd_from_levels(margin_total) if not margin_total.empty else {}

    # Losing days and PnL by symbol
    losing = losing_days_mtd(accs, day_start_hour=8)
    symbols, totals_by_acc = pnl_by_symbol_mtd(accs, str(start_day.date()), str(today.date()))

    # Serialize equity blocks
    realized_series = (
        _serialize_series(fixed_total_pure, accs) if not fixed_total_pure.empty else {}
    )
    margin_series = _serialize_series(margin_total, accs) if not margin_total.empty else {}
    live_key = str(list(margin_total.index)[-1]) if not margin_total.empty else None
    margin_live = {live_key: margin_series[live_key]} if live_key else {}

    # Initial balances blocks
    initial_balances = {
        **{a: float(init_map.get(a, 0.0)) for a in accs},
        "total": float(init_total),
    }
    initial_with_unreal = {
        **{a: float(init_map.get(a, 0.0)) + float(unreal_map.get(a, 0.0)) for a in accs},
        "total": float(
            sum(init_map.get(a, 0.0) for a in accs) + sum(unreal_map.get(a, 0.0) for a in accs)
        ),
    }

    # Performance by strategy (dynamic from accounts.json)
    accounts_index = _load_accounts_index()
    strategy_groups = _group_accounts_by_strategy(accs, accounts_index, include_none=False)

    def _subset_up(up_full: dict[str, float], subset: list[str]) -> dict[str, float]:
        sub = {a: float(up_full.get(a, 0.0)) for a in subset}
        sub["total"] = float(sum(sub.values()))
        return sub

    def _strategy_metrics(subset: list[str]) -> tuple[float, float, float, float]:
        """Return (dd_realized, dd_margin, ret_realized, ret_margin) for a subset."""
        if not subset:
            return 0.0, 0.0, 0.0, 0.0

        fixed_sub = fixed.loc[:, fixed.columns.intersection(subset)]
        margin_sub = margin.loc[:, margin.columns.intersection(subset)]

        fixed_total_pure_sub = (
            fixed_sub.assign(total=fixed_sub[subset].sum(axis=1))
            if not fixed_sub.empty
            else fixed_sub
        )
        up_sub = _subset_up(up_map, subset)
        fixed_with_up_sub = _inject_upnl_last_row(fixed_sub, up_sub, subset)
        fixed_total_with_up_sub = (
            fixed_with_up_sub.assign(total=fixed_with_up_sub[subset].sum(axis=1))
            if not fixed_with_up_sub.empty
            else fixed_with_up_sub
        )
        margin_total_sub = (
            margin_sub.assign(total=margin_sub[subset].sum(axis=1))
            if not margin_sub.empty
            else margin_sub
        )

        levels_for_ret_realized = (
            fixed_total_with_up_sub if not fixed_total_with_up_sub.empty else fixed_total_pure_sub
        )
        ret_realized_map = (
            mtd_return(levels_for_ret_realized) if not levels_for_ret_realized.empty else {}
        )
        ret_margin_map = mtd_return(margin_total_sub) if not margin_total_sub.empty else {}

        ret_realized = float(ret_realized_map.get("total", 0.0))
        ret_margin = float(ret_margin_map.get("total", 0.0))

        levels_for_mdd_realized = (
            fixed_total_with_up_sub if not fixed_total_with_up_sub.empty else fixed_total_pure_sub
        )
        mdd_realized_map = (
            mtd_max_dd_from_levels(levels_for_mdd_realized)
            if not levels_for_mdd_realized.empty
            else {}
        )
        mdd_margin_map = (
            mtd_max_dd_from_levels(margin_total_sub) if not margin_total_sub.empty else {}
        )

        dd_realized = float(mdd_realized_map.get("total", 0.0))
        dd_margin = float(mdd_margin_map.get("total", 0.0))

        return dd_realized, dd_margin, ret_realized, ret_margin

    performance_by_strategy: dict[str, dict[str, object]] = {}
    for strat, subset in strategy_groups.items():
        dd_r, dd_m, ret_r, ret_m = _strategy_metrics(subset)
        performance_by_strategy[strat] = {
            "accounts": subset,
            "drawdown": {"realized": dd_r, "margin": dd_m},
            "return": {"realized": ret_r, "margin": ret_m},
        }

    # Regular returns + all-time DD
    regular_df = regular_returns_by_session(
        accs, start_day, today, day_start_hour=8, tz="Europe/Zurich"
    )
    regular_returns = _serialize_series(regular_df, accs) if not regular_df.empty else {}
    all_time_dd = compute_all_time_max_current_dd(accs)

    payload: dict[str, object] = {
        "meta": {
            "asOf": now_utc_iso(),
            "window": {
                "mode": "MTD",
                "startDay": str(start_day.date()),
                "endDay": str(today.date()),
            },
            "flags": {
                "missingInitialBalanceAccounts": [],
                "zeroInitialBalanceAccounts": [*zero_initial],
            },
        },
        "accounts": accs,
        "initialBalances": initial_balances,
        "unrealizedJson": {a: float(unreal_map.get(a, 0.0)) for a in accs},
        "initialBalancesWithUnrealized": initial_with_unreal,
        "equity": {
            "realized": {"series": realized_series},
            "margin": {"series": margin_series, "live": margin_live},
        },
        "returns": {
            "realized": {
                "percent": {**mtd_ret_realized_with_upnl},
                "percentPure": {**mtd_ret_realized_pure},
                "dollars": realized_usd,
            },
            "margin": {"percent": {**mtd_ret_margin, **margin_pct}, "dollars": margin_usd},
        },
        "drawdown": {
            "realized": {"current": current_dd_realized, "max": mdd_fixed},
            "margin": {"current": current_dd_margin, "max": mdd_margin},
        },
        "losingDays": losing,
        "symbolPnlMTD": {"symbols": symbols, "totalPerAccount": totals_by_acc},
        "uPnl": upnl_payload(accs),
        # Renamed: dynamic, JSON-driven strategy aggregation
        "performanceByStrategy": performance_by_strategy,
        "regular_returns": regular_returns,
        "all_time_max_current_dd": all_time_dd,
    }
    return payload
