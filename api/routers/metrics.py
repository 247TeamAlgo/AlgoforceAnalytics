"""Metrics endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from ..metrics.performance_metrics.performance_metrics import build_metrics_payload

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", summary="Build metrics payload for given accounts")
def get_metrics(
    accounts: Annotated[list[str], Query(description="Account ids", min_length=1)],
) -> dict[str, object]:
    """Return a combined metrics payload for the requested accounts."""
    return build_metrics_payload(accounts)
