"""Composition layer for performance metrics responses."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from api_test.calculations.performance_metrics.json_returns import (
    compute_drawdown_mtd_from_json,
    compute_return_mtd_from_json,
    get_json_balances,
    get_json_unrealized,
)
from api_test.calculations.performance_metrics.losing_streaks import compute_consecutive_losses_mtd
from api_test.calculations.performance_metrics.symbol_pnl import compute_symbol_realized_mtd
from api_test.core.dates import mtd_window, today_utc
from api_test.core.numbers import round6
from api_test.io.balances import (
    build_day_end_balances_fixed,
    build_margin_last_day,
    serialize_balances_6dp,
)
from api_test.io.upnl import read_upnl

PH_DAY_START_HOUR = 8  # local day cut for losing-days (trades-only)


def build_performance_payload(accs: list[str]) -> dict[str, Any]:
    """Assemble and return the full MTD performance payload for the given accounts.

    SQL historical balances are **always** computed and included. Returns/drawdowns
    remain JSON+Redis-based (no SQL balance dependency for those metrics).
    """
    start_day, end_day = mtd_window()

    # SQL: day-end fixed balances (no uPnL) + initial map (for transparency)
    fixed_balances, initial_map_sql = build_day_end_balances_fixed(
        accs, start_day=start_day, end_day=end_day
    )

    # Margin last-day (inject uPnL on the last row only) — display block
    margin_last = build_margin_last_day(fixed_balances, accs)

    # Serialize SQL historical balances (not used for returns/DD)
    realized_block = serialize_balances_6dp(fixed_balances, accs)
    margin_block = serialize_balances_6dp(margin_last, accs)

    # Trades → per-symbol realized PnL (MTD)
    symbols_dict, totals_by_account = compute_symbol_realized_mtd(accs, start_day, end_day)

    # uPnL snapshot (Redis)
    up = read_upnl(accs)
    up_payload: dict[str, Any] = {
        "as_of": today_utc(),
        "combined": round6(float(up.get("total", 0.0))),
        "perAccount": {a: round6(float(up.get(a, 0.0))) for a in accs},
    }

    # JSON baselines + returns & drawdown (JSON+Redis only)
    json_balances_map = get_json_balances()
    json_unrealized_map = get_json_unrealized()
    json_balances = {a: round6(float(json_balances_map.get(a, 0.0))) for a in accs}
    json_unrealized_balances = {a: round6(float(json_unrealized_map.get(a, 0.0))) for a in accs}
    json_initial_balances = {
        a: round6(float(json_balances_map.get(a, 0.0)) + float(json_unrealized_map.get(a, 0.0)))
        for a in accs
    }
    json_returns = compute_return_mtd_from_json(override_accounts=accs)
    json_drawdown = compute_drawdown_mtd_from_json(override_accounts=accs)

    # Losing-days (SQL/Trades)
    losing_payload = compute_consecutive_losses_mtd(
        override_accounts=accs,
        day_start_hour=PH_DAY_START_HOUR,
        include_zero=False,
        ignore_trailing_zero=True,
        eps=1e-9,
    )

    return {
        "meta": {
            "asOfStartAnchor": start_day.isoformat(),
            "initialBalancesDate": (start_day - timedelta(days=1)).isoformat(),
        },
        "window": {
            "startDay": start_day.isoformat(),
            "endDay": end_day.isoformat(),
            "mode": "MTD",
        },
        "accounts": accs,
        "json_balances": json_balances,
        "json_unrealized_balances": json_unrealized_balances,
        "json_initial_balances": json_initial_balances,
        "initial_balances": {a: round6(float(initial_map_sql.get(a, 0.0))) for a in accs},
        "sql_historical_balances": {
            "realized": realized_block,
            "margin": margin_block,
        },
        "mtdReturn": {
            "realized": json_returns["realized"],
            "margin": json_returns["margin"],
        },
        "mtdDrawdown": {
            "realized": json_drawdown["realized"],
            "margin": json_drawdown["margin"],
        },
        "losingDays": {
            **losing_payload["perAccount"],
            "combined": losing_payload["combined"],
        },
        "symbolRealizedPnl": {
            "symbols": symbols_dict,
            "totalPerAccount": totals_by_account,
        },
        "uPnl": up_payload,
    }
