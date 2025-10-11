"""Balance helpers."""

from __future__ import annotations

from decimal import Decimal


def sum_balances(balances: dict[str, object]) -> Decimal:
    """Sum numeric-like values of a mapping as Decimal."""
    total = Decimal("0")
    for v in balances.values():
        try:
            total += Decimal(str(v))
        except Exception:
            continue
    return total
