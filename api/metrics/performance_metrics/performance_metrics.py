# api/metrics/performance_metrics/performance_metrics.py
"""Top-level helpers to build performance metrics payloads for the API.

Changes:
- Reflect UPnL (from up_map) into the MTD realized percent by injecting per-account
  UPnL into the last row of the realized equity series before computing mtd_return.
- Expose both realized MTD% variants:
    * mtd_ret_realized_pure:     realized-only (no UPnL)
    * mtd_ret_realized_with_upnl: realized + last-row UPnL injection (used in payload)
"""

from __future__ import annotations

from collections.abc import Sequence
from zoneinfo import ZoneInfo

import pandas as pd
from pandas import DataFrame

from ...core.config import now_utc_iso
from ...db.baseline import read_unrealized_json
from ...db.redis import read_upnl, upnl_payload
from ...db.sql import nearest_balance_on_or_before
from .calculations.drawdown import mtd_max_dd_from_levels
from .calculations.equity import build_fixed_balances, build_margin_series
from .calculations.losing_days import losing_days_mtd
from .calculations.pnl_by_symbol import pnl_by_symbol_mtd
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
    """Return a copy of `levels` where each account's last row is incremented by its UPnL.

    This mirrors the behavior often used in dashboards where UPnL is applied
    only on the latest point to express a 'live' end-of-period equity.
    """
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
    """Compute live realized/margin returns (USD and %) per account and totals.

    Definitions (matching CLI):
    - Realized: ((last_realized + upnl) - init) / init
    - Margin:   ((last_realized + upnl) - (init + unreal_json)) / (init + unreal_json)

    Totals are computed by summation of parts, not by averaging percents.
    """
    last_ts = _last_index(fixed)
    realized_usd: dict[str, float] = {}
    realized_pct: dict[str, float] = {}
    margin_usd: dict[str, float] = {}
    margin_pct: dict[str, float] = {}

    # Per-account
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

    # Totals
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

    # NOTE: return the *defined* locals, not underscored names
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
    """Compute current drawdown per account and totals for realized and margin.

    Realized uses (last_realized + upnl) vs peak of realized.
    Margin uses margin series levels (which already include unrealized_json baseline
    and last-row UPNL).
    """
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


# ---------- Main entry ----------


def build_metrics_payload(accounts: Sequence[str]) -> dict[str, object]:
    """Return the full metrics payload for requested accounts.

    Alignment with CLI:
    - Window runs MTD up to *today@00:00* (Europe/Zurich).
    - Current DD uses realized+UPNL vs realized peak; margin uses margin levels.
    - Max DD is computed from *levels* (not returns) over the MTD window.
    - mtd_ret_realized now reflects *last-row UPnL injection* per account.
    """
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

    # ----- Realized MTD returns -----
    # 1) Pure realized (no UPnL)
    fixed_total_pure = fixed.assign(total=fixed[accs].sum(axis=1)) if not fixed.empty else fixed
    mtd_ret_realized_pure = mtd_return(fixed_total_pure) if not fixed_total_pure.empty else {}

    # 2) With UPnL injected on last row per account
    fixed_with_up = _inject_upnl_last_row(fixed, up_map, accs)
    fixed_total_with_up = (
        fixed_with_up.assign(total=fixed_with_up[accs].sum(axis=1))
        if not fixed_with_up.empty
        else fixed_with_up
    )
    mtd_ret_realized_with_upnl = (
        mtd_return(fixed_total_with_up) if not fixed_total_with_up.empty else {}
    )

    # Margin MTD returns (unchanged; already includes unrealized baseline + last-row UPnL)
    margin_total = margin.assign(total=margin[accs].sum(axis=1)) if not margin.empty else margin
    mtd_ret_margin = mtd_return(margin_total) if not margin_total.empty else {}

    # Live returns (per CLI, realized and margin)
    (
        realized_usd,
        realized_pct,
        margin_usd,
        margin_pct,
        init_total,
        _last_realized_total,  # intentionally unused; keep for debugging
        _live_total,  # intentionally unused; keep for debugging
        _unreal_total,  # intentionally unused; keep for debugging
    ) = _live_returns_block(accs, fixed, init_map, up_map, unreal_map)

    # Drawdowns (current + MTD max from *levels*)
    current_dd_realized, current_dd_margin = _current_dd_block(accs, fixed, margin, up_map)
    mdd_fixed = mtd_max_dd_from_levels(fixed_total_pure) if not fixed_total_pure.empty else {}
    mdd_margin = mtd_max_dd_from_levels(margin_total) if not margin_total.empty else {}

    # Losing days (exclude today; combined loss by sum-of-PnL rule)
    losing = losing_days_mtd(accs, day_start_hour=8)

    # PnL per symbol (realized only)
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

    # ---------------- Strategy rollups (Janus/Charm) ----------------
    janus_accs = [a for a in accs if a.lower() in {"fund2"}]
    charm_accs = [a for a in accs if a.lower() in {"fund3"}]

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

        ret_realized_map = (
            mtd_return(fixed_total_with_up_sub) if not fixed_total_with_up_sub.empty else {}
        )
        ret_margin_map = mtd_return(margin_total_sub) if not margin_total_sub.empty else {}

        ret_realized = float(ret_realized_map.get("total", 0.0))
        ret_margin = float(ret_margin_map.get("total", 0.0))

        mdd_realized_map = (
            mtd_max_dd_from_levels(fixed_total_pure_sub) if not fixed_total_pure_sub.empty else {}
        )
        mdd_margin_map = (
            mtd_max_dd_from_levels(margin_total_sub) if not margin_total_sub.empty else {}
        )

        dd_realized = float(mdd_realized_map.get("total", 0.0))
        dd_margin = float(mdd_margin_map.get("total", 0.0))

        return dd_realized, dd_margin, ret_realized, ret_margin

    janus_dd_r, janus_dd_m, janus_ret_r, janus_ret_m = _strategy_metrics(janus_accs)
    charm_dd_r, charm_dd_m, charm_ret_r, charm_ret_m = _strategy_metrics(charm_accs)

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
        "combined_coint_strategy": {
            "drawdown": {
                "realized": {
                    "janus_coint": janus_dd_r,
                    "charm_coint": charm_dd_r,
                },
                "margin": {
                    "janus_coint": janus_dd_m,
                    "charm_coint": charm_dd_m,
                },
            },
            "return": {
                "realized": {
                    "janus_coint": janus_ret_r,
                    "charm_coint": charm_ret_r,
                },
                "margin": {
                    "janus_coint": janus_ret_m,
                    "charm_coint": charm_ret_m,
                },
            },
        },
    }
    return payload
