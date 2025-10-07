# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\accounts.py
"""Accounts metadata utilities.

Load and filter account objects from ``accounts.json`` with strict, explicit typing.
This module defines a ``TypedDict`` for account rows and avoids ``Any`` entirely.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import NotRequired, TypedDict, cast

from .config import ACCOUNTS_JSON_PATH

__all__ = ["Account", "get_accounts"]


class Account(TypedDict, total=False):
    """Structured account record parsed from accounts.json."""
    binanceName: NotRequired[str]
    redisName: NotRequired[str]
    dbName: NotRequired[str]
    strategy: NotRequired[str]
    leverage: NotRequired[int]
    monitored: NotRequired[bool]


def _coerce_dict_str_obj(o: object) -> dict[str, object] | None:
    """Return a dict with str keys and object values if ``o`` is a dict; else None."""
    if not isinstance(o, dict):
        return None

    # At runtime `o` is a dict, but key/value types are unknown; normalize explicitly.
    src = cast(dict[object, object], o)
    dst: dict[str, object] = {}
    for key_obj, val in src.items():
        if not isinstance(key_obj, str):
            return None
        dst[key_obj] = val
    return dst


def _as_account(o: object) -> Account | None:
    """Best-effort conversion of an unknown JSON element into an Account."""
    m = _coerce_dict_str_obj(o)
    if m is None:
        return None

    acc: Account = {}

    v = m.get("binanceName")
    if isinstance(v, str):
        acc["binanceName"] = v

    v = m.get("redisName")
    if isinstance(v, str):
        acc["redisName"] = v

    v = m.get("dbName")
    if isinstance(v, str):
        acc["dbName"] = v

    v = m.get("strategy")
    if isinstance(v, str):
        acc["strategy"] = v

    v = m.get("leverage")
    if isinstance(v, int):
        acc["leverage"] = v

    v = m.get("monitored")
    if isinstance(v, bool):
        acc["monitored"] = v

    return acc


@lru_cache(maxsize=1)
def _load_all_accounts() -> list[Account]:
    """Load accounts.json once and cache it.

    The file must be a JSON array of objects; keys are optional:
    {
      "binanceName": "...",
      "redisName": "...",
      "dbName": "...",
      "strategy": "...",
      "leverage": 10,
      "monitored": true
    }
    """
    with open(ACCOUNTS_JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        return []

    items: list[object] = cast(list[object], data)
    records: list[Account] = []
    for item in items:
        acc = _as_account(item)
        if acc is not None:
            records.append(acc)

    return records


def get_accounts(*, monitored_only: bool = False) -> list[Account]:
    """Return the list of account objects.

    If ``monitored_only=True``, only return those with ``"monitored": true``.
    """
    items = _load_all_accounts()
    if monitored_only:
        return [x for x in items if x.get("monitored", False) is True]
    return items
