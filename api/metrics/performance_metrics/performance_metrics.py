# api/metrics/performance_metrics/performance_metrics.py
"""Top-level helpers to build performance metrics payloads for the API."""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd

from ...core.config import now_utc_iso
from ...db.baseline import read_unrealized_json
from ...db.redis import read_upnl, upnl_payload
from ...db.sql import nearest_balance_on_or_before
from .calculations.drawdown import mtd_drawdown_from_returns
from .calculations.equity import build_fixed_balances, build_margin_series
from .calculations.losing_days import losing_days_mtd
from .calculations.pnl_by_symbol import pnl_by_symbol_mtd
from .calculations.returns import (
    live_return_margin,
    live_return_realized,
    mtd_return,
    pct_returns,
)

# ---------- Small, typed helpers ----------


def _mtd_window_today() -> tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp]:
    """Return (start_of_month, today_norm, yesterday_norm)."""
    today = pd.Timestamp.today().normalize()
    start = today.replace(day=1)
    yesterday = today - pd.Timedelta(days=1)
    return start, today, yesterday


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
    """Last timestamp or None."""
    if df.empty:
        return None
    try:
        return pd.Timestamp(df.index[-1])
    except Exception:
        return None


def _float_scalar(x: object) -> float:
    """Lenient scalar → float with pandas/numpy compatibility, no bare float(obj)."""
    # Fast path for native numerics
    if isinstance(x, float | int):  # Ruff UP038-compliant
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
    fixed_delta: pd.DataFrame, init_map: dict[str, float], accounts: list[str]
) -> pd.DataFrame:
    """Turn per-day deltas into realized equity by adding SQL initial balances."""
    if fixed_delta.empty:
        return fixed_delta
    fixed = fixed_delta.copy()
    for a in accounts:
        if a in fixed.columns:
            fixed[a] = fixed[a] + float(init_map.get(a, 0.0))
    return fixed


def _live_returns_block(
    accs: list[str],
    fixed: pd.DataFrame,
    margin: pd.DataFrame,
    init_map: dict[str, float],
    up_map: dict[str, float],
) -> tuple[
    dict[str, float], dict[str, float], dict[str, float], dict[str, float], float, float, float
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
        ujson = 0.0  # NOTE: json unrealized is accounted via margin series, not here
        usd_r, pct_r = live_return_realized(last_realized, init, upnl)
        usd_m, pct_m = live_return_margin(last_realized, init, ujson, upnl)
        realized_usd[a], realized_pct[a] = usd_r, pct_r
        margin_usd[a], margin_pct[a] = usd_m, pct_m

    init_total = float(sum(init_map.values()))
    last_realized_total = _sum_row(fixed, last_ts, accs)
    last_margin_total = _sum_row(margin, last_ts, accs)
    up_total = float(up_map.get("total", 0.0))

    realized_usd["total"] = (last_realized_total + up_total) - init_total
    realized_pct["total"] = (
        ((last_realized_total + up_total) / init_total - 1.0) if init_total else 0.0
    )
    margin_usd["total"] = last_margin_total - init_total
    margin_pct["total"] = (last_margin_total / init_total - 1.0) if init_total else 0.0

    return (
        realized_usd,
        realized_pct,
        margin_usd,
        margin_pct,
        init_total,
        last_realized_total,
        last_margin_total,
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
    last_margin_total = _sum_row(margin, last_ts, accs)
    up_total = float(up_map.get("total", 0.0))

    curr_realized_total = last_realized_total + up_total
    curr_dd_realized_total = (
        ((curr_realized_total - peak_fixed_total) / peak_fixed_total) if peak_fixed_total else 0.0
    )
    curr_dd_margin_total = (
        ((last_margin_total - peak_margin_total) / peak_margin_total) if peak_margin_total else 0.0
    )

    current_dd_realized: dict[str, float] = {}
    current_dd_margin: dict[str, float] = {}

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

    current_dd_realized["total"] = curr_dd_realized_total
    current_dd_margin["total"] = curr_dd_margin_total
    return current_dd_realized, current_dd_margin


# ---------- Main entry ----------


def build_metrics_payload(accounts: Sequence[str]) -> dict[str, object]:
    """Return the full metrics payload for requested accounts."""
    accs = [a.strip().lower() for a in accounts if a.strip()]
    start_day, today, _yesterday = _mtd_window_today()

    # Initial balances (SQL only)
    init_map: dict[str, float] = {}
    zero_initial: list[str] = []
    for a in accs:
        bal, _ts = nearest_balance_on_or_before(a, start_day)
        init_map[a] = float(bal)
        if bal == 0.0:
            zero_initial.append(a)

    # Realized equity (SQL deltas + SQL initial)
    fixed_delta, _ = build_fixed_balances(accs, start_day, today)
    fixed = _offset_fixed_with_initial(fixed_delta, init_map, accs)

    # Baselines and UPnL
    up_map = read_upnl(accs)
    unreal_map = read_unrealized_json()

    # Margin equity (includes unrealized.json baseline shift + inject UPnL on the last day)
    margin = build_margin_series(fixed, unreal_map, up_map, accs)

    # Returns blocks (MTD series-based)
    fixed_total = fixed.assign(total=fixed[accs].sum(axis=1)) if not fixed.empty else fixed
    margin_total = margin.assign(total=margin[accs].sum(axis=1)) if not margin.empty else margin
    r_fixed = pct_returns(fixed_total) if not fixed_total.empty else fixed_total
    r_margin = pct_returns(margin_total) if not margin_total.empty else margin_total
    mtd_ret_realized = mtd_return(fixed_total) if not fixed_total.empty else {}
    mtd_ret_margin = mtd_return(margin_total) if not margin_total.empty else {}

    # Live returns (per CLI)
    (
        realized_usd,
        realized_pct,
        margin_usd,
        margin_pct,
        init_total,
        _last_realized_total,
        _last_margin_total,
    ) = _live_returns_block(accs, fixed, margin, init_map, up_map)

    # Drawdowns (current + MTD max)
    current_dd_realized, current_dd_margin = _current_dd_block(accs, fixed, margin, up_map)
    mdd_fixed = mtd_drawdown_from_returns(r_fixed) if not r_fixed.empty else {}
    mdd_margin = mtd_drawdown_from_returns(r_margin) if not r_margin.empty else {}

    # Losing days (exclude today; combined loss by sum-of-PnL rule)
    losing = losing_days_mtd(accs, day_start_hour=8)

    # PnL per symbol (realized only)
    symbols, totals_by_acc = pnl_by_symbol_mtd(accs, str(start_day.date()), str(today.date()))

    # Serialize equity blocks
    realized_series = _serialize_series(fixed_total, accs) if not fixed_total.empty else {}
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
            "realized": {"percent": {**mtd_ret_realized, **realized_pct}, "dollars": realized_usd},
            "margin": {"percent": {**mtd_ret_margin, **margin_pct}, "dollars": margin_usd},
        },
        "drawdown": {
            "realized": {"current": current_dd_realized, "max": mdd_fixed},
            "margin": {"current": current_dd_margin, "max": mdd_margin},
        },
        "losingDays": losing,
        "symbolPnlMTD": {"symbols": symbols, "totalPerAccount": totals_by_acc},
        "uPnl": upnl_payload(accs),
    }
    return payload
