# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\calculations\return_mtd.py
"""Utility functions for month-to-date (MTD) realized and margin returns from JSON balances.

Compute MTD returns for specified accounts using baseline balances, unrealized values, and current
equity. Returns both a 'realized' return and a 'margin' return per account, plus totals.
Includes an 'as_of' timestamp.
"""

from __future__ import annotations

from typing import TypedDict

from ..config import now_utc_iso
from ..json_balances import equity_now, get_json_balances, get_json_unrealized

__all__ = ["compute_return_mtd_from_json"]


class ReturnMTD(TypedDict):
    as_of: str
    realized: dict[str, float]
    margin: dict[str, float]


def _round6(x: float) -> float:
    try:
        return float(round(float(x), 6))
    except Exception:
        return 0.0


def _safe_frac(numer: float, denom: float) -> float:
    if denom == 0.0:
        return 0.0
    try:
        return numer / denom - 1.0
    except Exception:
        return 0.0


def compute_return_mtd_from_json(*, override_accounts: list[str] | None = None) -> ReturnMTD:
    """Compute MTD 'realized' and 'margin' returns using JSON baselines + Redis equity-now.

    realized[acc] = equity_now / json_balance - 1
    margin[acc]   = equity_now / (json_balance + json_unrealized) - 1
    Totals are recomputed on sums (not averages).
    """
    accounts = [a.lower() for a in (override_accounts or [])]
    if not accounts:
        return {"as_of": now_utc_iso(), "realized": {}, "margin": {}}

    bal_map = get_json_balances()
    unrl_map = get_json_unrealized()
    now_map = equity_now(accounts)

    realized: dict[str, float] = {}
    margin: dict[str, float] = {}
    for a in accounts:
        e0 = float(bal_map.get(a, 0.0))
        u0 = float(unrl_map.get(a, 0.0))
        enow = float(now_map.get(a, 0.0))
        realized[a] = _round6(_safe_frac(enow, e0))
        margin[a] = _round6(_safe_frac(enow, e0 + u0))

    total_e0 = sum(float(bal_map.get(a, 0.0)) for a in accounts)
    total_u0 = sum(float(unrl_map.get(a, 0.0)) for a in accounts)
    total_enow = sum(float(now_map.get(a, 0.0)) for a in accounts)

    realized["total"] = _round6(_safe_frac(total_enow, total_e0))
    margin["total"] = _round6(_safe_frac(total_enow, total_e0 + total_u0))

    return {"as_of": now_utc_iso(), "realized": realized, "margin": margin}
