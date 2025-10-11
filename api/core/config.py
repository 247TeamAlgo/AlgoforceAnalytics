# api/core/config.py
"""Shared configuration and small utilities (Redis, SQL, time helpers, env)."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from functools import lru_cache
from typing import TYPE_CHECKING, Final

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

if TYPE_CHECKING:  # import only for type checking
    from redis import Redis  # pragma: no cover


def now_utc_iso() -> str:
    """Return current UTC timestamp in ISO 8601 with 'Z' suffix."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


# ---------- Redis ----------
def get_redis() -> Redis:
    """Return a Redis client (decode_responses=True)."""
    # Lazy import for optional runtime dependency.
    import redis  # type: ignore

    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(url, decode_responses=True)  # type: ignore[no-any-return]


# ---------- SQL ----------
DB_URL: Final[str] = os.getenv(
    "DB_URL",
    "mysql+mysqlconnector://247team:password@192.168.50.238:3306/trades",
)
BALANCE_SCHEMA: Final[str] = os.getenv("BALANCE_SCHEMA", "balance")
BALANCE_TIME_COLUMN: Final[str] = os.getenv("BALANCE_TIME_COLUMN", "datetime")
BALANCE_VALUE_COLUMN: Final[str] = os.getenv("BALANCE_VALUE_COLUMN", "overall_balance")


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return a cached SQLAlchemy Engine."""
    return create_engine(DB_URL, pool_pre_ping=True, pool_recycle=3600)


# ---------- unrealized.json (env override + fallbacks) ----------
UNREALIZED_JSON_PATH: Final[str] = os.getenv("UNREALIZED_JSON_PATH", "")
_WIN_DASHBOARD: Final[str] = r"C:\Users\Algoforce\Documents\GitHub\Algoforce\AFMonitor\dashboard"
WIN_UNREALIZED_FALLBACK: Final[str] = os.path.join(_WIN_DASHBOARD, "unrealized.json")
_REL_BASE = os.path.dirname(__file__)
REL_UNREALIZED_FALLBACK: Final[str] = os.path.normpath(
    os.path.join(_REL_BASE, "..", "dashboard", "unrealized.json")
)


def unrealized_candidates() -> list[str]:
    """Return candidate paths for unrealized.json (ordered)."""
    out: list[str] = []
    if UNREALIZED_JSON_PATH:
        out.append(UNREALIZED_JSON_PATH)
    out.extend([WIN_UNREALIZED_FALLBACK, REL_UNREALIZED_FALLBACK])
    return out


# ---------- accounts.json (env override + fallback to repo) ----------
ACCOUNTS_JSON_PATH: Final[str] = os.getenv(
    "ACCOUNTS_JSON_PATH",
    os.path.normpath(os.path.join(_REL_BASE, "..", "data", "accounts.json")),
)
