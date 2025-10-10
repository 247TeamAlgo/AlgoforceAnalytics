# path: api/io/accounts.py
"""Accounts and baseline JSON I/O."""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import lru_cache
from typing import NotRequired, TypedDict, cast

from api_test.core.config import (
    ACCOUNTS_JSON_PATH,
    BASELINE_BALANCE_JSON,
    BASELINE_UNREALIZED_JSON,
    REL_BASELINE_BAL_PATH,
    REL_UNREALIZED_PATH,
    WIN_BASELINE_BAL_PATH,
    WIN_UNREALIZED_PATH,
)


class Account(TypedDict, total=False):
    """Structured account record parsed from accounts.json."""

    binanceName: NotRequired[str]
    redisName: NotRequired[str]
    dbName: NotRequired[str]
    strategy: NotRequired[str]
    leverage: NotRequired[int]
    monitored: NotRequired[bool]


@lru_cache(maxsize=1)
def _load_all_accounts() -> list[Account]:
    """Load and cache the raw account objects from accounts.json."""
    with open(ACCOUNTS_JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        return []

    items: list[object] = cast(list[object], data)
    records: list[Account] = []
    for item in items:
        if isinstance(item, dict):
            row = cast(Mapping[str, object], item)
            acc: Account = {}
            if isinstance(row.get("binanceName"), str):
                acc["binanceName"] = cast(str, row["binanceName"])
            if isinstance(row.get("redisName"), str):
                acc["redisName"] = cast(str, row["redisName"])
            if isinstance(row.get("dbName"), str):
                acc["dbName"] = cast(str, row["dbName"])
            if isinstance(row.get("strategy"), str):
                acc["strategy"] = cast(str, row["strategy"])
            if isinstance(row.get("leverage"), int):
                acc["leverage"] = cast(int, row["leverage"])
            if isinstance(row.get("monitored"), bool):
                acc["monitored"] = cast(bool, row["monitored"])
            records.append(acc)
    return records


def get_accounts(*, monitored_only: bool = False) -> list[Account]:
    """Return the account objects; optionally filter to monitored ones."""
    items = _load_all_accounts()
    if monitored_only:
        return [x for x in items if x.get("monitored", False) is True]
    return items


def load_accounts(monitored_only: bool = True) -> list[str]:
    """Return the list of redisName keys for accounts, optionally filtered to monitored."""
    all_items = get_accounts(monitored_only=monitored_only)
    keys: list[str] = []
    for item in all_items:
        v = item.get("redisName")
        if isinstance(v, str):
            keys.append(v)
    return keys


def _first_existing_path(paths: list[str]) -> str | None:
    """Return the first existing file path from a list, or None."""
    import os

    for p in paths:
        if p and os.path.exists(p):
            return p
    return None


def _load_json_map(path_candidates: list[str]) -> dict[str, float]:
    """Load a mapping[str, float] from the first existing JSON path in candidates."""
    path = _first_existing_path(path_candidates)
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            raw_obj: object = json.load(f)
    except Exception:
        return {}
    if not isinstance(raw_obj, dict):
        return {}
    out: dict[str, float] = {}
    for k, v in cast(dict[object, object], raw_obj).items():
        try:
            out[str(k).lower()] = float(v)  # type: ignore[arg-type]
        except Exception:
            continue
    return out


def get_json_balances() -> dict[str, float]:
    """Return baseline equity per account from balance.json candidates."""
    candidates: list[str] = []
    if BASELINE_BALANCE_JSON:
        candidates.append(BASELINE_BALANCE_JSON)
    candidates.extend([WIN_BASELINE_BAL_PATH, REL_BASELINE_BAL_PATH])
    return _load_json_map(candidates)


def get_json_unrealized() -> dict[str, float]:
    """Return baseline unrealized per account from unrealized.json candidates."""
    candidates: list[str] = []
    if BASELINE_UNREALIZED_JSON:
        candidates.append(BASELINE_UNREALIZED_JSON)
    candidates.extend([WIN_UNREALIZED_PATH, REL_UNREALIZED_PATH])
    return _load_json_map(candidates)
