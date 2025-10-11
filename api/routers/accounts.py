# api/routers/accounts.py
"""Accounts endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..db.accounts import get_accounts as _get_accounts

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", summary="List available accounts")
def list_accounts(
    monitored: bool = Query(
        default=False,
        description="If true, only return accounts with monitored=true",
    ),
) -> dict[str, list[dict[str, object]]]:
    """Return accounts from api/data/accounts.json (or ACCOUNTS_JSON_PATH override)."""
    return {"accounts": _get_accounts(monitored_only=monitored)}
