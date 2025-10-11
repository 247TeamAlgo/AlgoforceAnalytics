"""Accounts endpoints."""

from __future__ import annotations

import json
import os

from fastapi import APIRouter

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _from_env() -> list[str]:
    """Read accounts from env var ACCOUNTS (CSV or JSON list)."""
    raw = os.getenv("ACCOUNTS", "")
    if not raw:
        return []
    # JSON list?
    try:
        if raw.strip().startswith("["):
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(x) for x in data]
    except Exception:
        pass
    # CSV fallback
    return [s.strip() for s in raw.split(",") if s.strip()]


@router.get("", summary="List available accounts")
def list_accounts() -> dict[str, list[str]]:
    """Return accounts discovered from configuration."""
    return {"accounts": _from_env()}
