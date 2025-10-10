# path: api/core/numbers.py
"""Numeric utilities."""

from __future__ import annotations


def round6(x: float) -> float:
    """Round a float to 6 decimal places."""
    return float(round(float(x), 6))
