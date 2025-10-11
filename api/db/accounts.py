# api/db/accounts.py
"""Accounts file reader."""

from __future__ import annotations

import json
from typing import Any

from ..core.config import ACCOUNTS_JSON_PATH


def read_accounts_file() -> list[dict[str, Any]]:
    """Load api/data/accounts.json (or ACCOUNTS_JSON_PATH override)."""
    try:
        with open(ACCOUNTS_JSON_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    # Ensure each item is a dict[str, Any]
    out: list[dict[str, Any]] = []
    for item in data:
        if isinstance(item, dict):
            out.append({str(k): v for k, v in item.items()})
    return out


def get_accounts(*, monitored_only: bool = False) -> list[dict[str, Any]]:
    """Return accounts list; optionally filter to monitored=true."""
    items = read_accounts_file()
    if monitored_only:
        return [x for x in items if bool(x.get("monitored", False)) is True]
    return items
