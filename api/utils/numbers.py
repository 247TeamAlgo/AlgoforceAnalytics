"""Number helpers."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation


def to_decimal(value: object, default: str | None = "0") -> Decimal:
    """Safely convert value to Decimal."""
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(default or "0")
