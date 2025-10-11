# api/db/baseline.py
"""File-based baseline store (unrealized.json)."""

from __future__ import annotations

import json
import os
from functools import lru_cache

from ..core.config import unrealized_candidates


def _first_existing_path(paths: list[str]) -> str | None:
    for p in paths:
        if p and os.path.exists(p):
            return p
    return None


@lru_cache(maxsize=1)
def read_unrealized_json() -> dict[str, float]:
    """Read unrealized.json into {account: value}, lowercase keys. Env override + fallbacks."""
    path = _first_existing_path(unrealized_candidates())
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            obj = json.load(f)
        if not isinstance(obj, dict):
            return {}
        out: dict[str, float] = {}
        for k, v in obj.items():
            try:
                out[str(k).lower()] = float(v)
            except Exception:
                out[str(k).lower()] = 0.0
        return out
    except Exception:
        return {}
