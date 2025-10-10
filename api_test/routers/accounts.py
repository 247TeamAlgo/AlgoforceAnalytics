# path: api/routers/accounts.py
"""Accounts router."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from api_test.io.accounts import get_accounts

router = APIRouter(tags=["accounts"])


@router.get("/accounts")
def api_accounts(
    monitored: bool = Query(False, description="Filter to monitored accounts"),
) -> JSONResponse:
    """Return account objects; optionally filter to monitored ones."""
    items = get_accounts(monitored_only=monitored)
    return JSONResponse(content=items, headers={"Cache-Control": "private, max-age=30"})
