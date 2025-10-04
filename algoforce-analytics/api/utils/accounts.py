# algoforce-analytics/api/utils/accounts.py
from __future__ import annotations

from typing import List, Dict, Any
from functools import lru_cache
import json

from .config import ACCOUNTS_JSON_PATH


@lru_cache(maxsize=1)
def _load_all_accounts() -> List[Dict[str, Any]]:
    """
    Load accounts.json once and cache it.
    The file must be a JSON array of objects shaped like:
      {
        "binanceName": "...",
        "redisName": "...",
        "dbName": "...",
        "strategy": "...",
        "leverage": 10,
        "monitored": true
      }
    """
    with open(ACCOUNTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def get_accounts(*, monitored_only: bool = False) -> List[Dict[str, Any]]:
    """
    Return the list of account objects. If monitored_only=True,
    only return those with `"monitored": true`.
    """
    items = _load_all_accounts()
    return [x for x in items if x.get("monitored", False)] if monitored_only else items
