# path: api/routers/metrics/performance.py
"""Performance metrics router."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from api_test.metrics.performance_service import build_performance_payload

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/performance")
def metrics_performance(
    accounts: str | None = Query(None, description="Comma-separated redisName list. Required."),
) -> JSONResponse:
    """Return the complete MTD performance payload for the given accounts."""
    if not accounts:
        raise HTTPException(status_code=400, detail="Missing 'accounts' parameter")

    accs = [a.strip().lower() for a in accounts.split(",") if a.strip()]
    if not accs:
        raise HTTPException(status_code=400, detail="No valid accounts provided")

    payload = build_performance_payload(accs)
    return JSONResponse(content=payload, headers={"Cache-Control": "private, max-age=5"})
