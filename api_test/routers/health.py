# path: api/routers/health.py
"""Health router."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Return a basic service health status."""
    return {"status": "ok"}
