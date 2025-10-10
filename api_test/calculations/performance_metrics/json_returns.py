# path: api/calculations/performance_metrics/json_returns.py
"""JSON baseline + live equity returns and drawdowns for performance."""

from __future__ import annotations

from typing import TypedDict

from api_test.core.dates import today_utc
from api_test.core.numbers import round6
from api_test.io.accounts import get_json_balances, get_json_unrealized
from api_test.io.upnl import equity_now

__all__ = [
    "compute_return_mtd_from_json",
    "compute_drawdown_mtd_from_json",
    "get_json_balances",
    "get_json_unrealized",
]


class ReturnMTD(TypedDict):
    """Return structure for MTD realized and margin returns."""

    as_of: str
    realized: dict[str, float]
    margin: dict[str, float]


def _safe_frac(numer: float, denom: float) -> float:
    """Compute numer/denom - 1, guarding against division by zero and errors."""
    if denom == 0.0:
        return 0.0
    try:
        return numer / denom - 1.0
    except Exception:
        return 0.0


def compute_return_mtd_from_json(*, override_accounts: list[str] | None = None) -> ReturnMTD:
    """Compute MTD realized and margin returns using JSON baselines and live equity."""
    accounts = [a.lower() for a in (override_accounts or [])]
    if not accounts:
        return {"as_of": today_utc(), "realized": {}, "margin": {}}

    bal_map = get_json_balances()
    unrl_map = get_json_unrealized()
    now_map = equity_now(accounts)

    realized: dict[str, float] = {}
    margin: dict[str, float] = {}
    for a in accounts:
        e0 = float(bal_map.get(a, 0.0))
        u0 = float(unrl_map.get(a, 0.0))
        enow = float(now_map.get(a, 0.0))
        realized[a] = round6(_safe_frac(enow, e0))
        margin[a] = round6(_safe_frac(enow, e0 + u0))

    total_e0 = sum(float(bal_map.get(a, 0.0)) for a in accounts)
    total_u0 = sum(float(unrl_map.get(a, 0.0)) for a in accounts)
    total_enow = sum(float(now_map.get(a, 0.0)) for a in accounts)

    realized["total"] = round6(_safe_frac(total_enow, total_e0))
    margin["total"] = round6(_safe_frac(total_enow, total_e0 + total_u0))

    return {"as_of": today_utc(), "realized": realized, "margin": margin}


def compute_drawdown_mtd_from_json(
    *, override_accounts: list[str] | None = None
) -> dict[str, dict[str, float]]:
    """Compute MTD drawdown from JSON-based returns snapshot (no SQL balances).

    With only baselines and *current* equity (no time series), DD is defined as
    ``min(current_return, 0.0)`` for each scope.
    """
    rets = compute_return_mtd_from_json(override_accounts=override_accounts)
    dd_realized = {k: min(v, 0.0) for k, v in rets["realized"].items()}
    dd_margin = {k: min(v, 0.0) for k, v in rets["margin"].items()}
    return {"realized": dd_realized, "margin": dd_margin}
