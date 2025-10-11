"""Top-level helpers to build metrics payloads for the API."""

from __future__ import annotations

from collections.abc import Sequence

from ...db.redis import upnl_payload


def build_metrics_payload(accounts: Sequence[str]) -> dict[str, object]:
    """Return combined metrics payload. Currently includes uPnL only."""
    return {
        "uPnl": upnl_payload(accounts),
        # Extend here with more sections as you implement them.
    }
