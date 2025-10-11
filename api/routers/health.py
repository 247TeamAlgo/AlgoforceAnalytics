# api/routers/health.py
"""Healthcheck endpoint(s)."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", summary="Healthcheck")
def health() -> dict[str, str]:
    """Return a simple OK payload."""
    return {"status": "ok"}
