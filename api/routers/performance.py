# api/routers/performance_metrics.py
"""Performance metrics endpoint (single consolidated payload)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from ..metrics.performance_metrics.performance_metrics import build_metrics_payload

router = APIRouter(prefix="/performance_metrics", tags=["performance_metrics"])


@router.get("", summary="Build performance metrics payload for given accounts")
def get_performance_metric(
    accounts: Annotated[list[str], Query(description="Account ids", min_length=1)],
) -> dict[str, object]:
    """Return a combined performance metrics payload for the requested accounts."""
    return build_metrics_payload(accounts)
