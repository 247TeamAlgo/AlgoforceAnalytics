# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\config.py
"""Configuration utilities for Algoforce Analytics Client.

Centralizes environment variables, default paths, and cached factories for
SQLAlchemy and Redis. Also provides helpers for locating baseline JSON files
and formatting UTC timestamps.
"""
# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\config.py

from __future__ import annotations

import os
from datetime import UTC, datetime
from functools import lru_cache
from typing import Final

import redis
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

# ---------------- Paths / env ----------------

_here = os.path.dirname(__file__)
_default_accounts_path = os.path.normpath(os.path.join(_here, "..", "data", "accounts.json"))
ACCOUNTS_JSON_PATH: Final[str] = os.getenv("ACCOUNTS_JSON_PATH", _default_accounts_path)

# Which field in accounts.json is the key (table name & Redis key prefix)
ACCOUNT_KEY_FIELD: Final[str] = os.getenv("ACCOUNT_KEY_FIELD", "redisName")

# Primary DSN targets the MySQL server (default DB is `trades`; we fully-qualify other schemas).
DB_URL: Final[str] = (
    os.getenv("DB_URL")
    or os.getenv("TRADES_DSN")
    or "mysql+mysqlconnector://247team:password@192.168.50.238:3306/trades"
)

# Redis
REDIS_HOST: Final[str] = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT: Final[int] = int(os.getenv("REDIS_PORT", "6379"))

# Balance schema (SQL, used only for historical series)
BALANCE_SCHEMA: Final[str] = os.getenv("BALANCE_SCHEMA", "balance")
BALANCE_TIME_COLUMN: Final[str] = os.getenv("BALANCE_TIME_COLUMN", "datetime")
BALANCE_VALUE_COLUMN: Final[str] = os.getenv("BALANCE_VALUE_COLUMN", "overall_balance")

# JSON baselines (for real-time returns)
# Order of precedence is handled in balances.py via candidate lists,
# but we expose the environment variable overrides here.
BASELINE_BALANCE_JSON: Final[str] = os.getenv("BASELINE_BALANCE_JSON", "")
BASELINE_UNREALIZED_JSON: Final[str] = os.getenv("BASELINE_UNREALIZED_JSON", "")

# Windows defaults (match your Node code)
WIN_BASELINE_BAL_PATH: Final[str] = (
    r"C:\Users\Algoforce\Documents\GitHub\Algoforce\AFMonitor\dashboard\balance.json"
)
WIN_UNREALIZED_PATH: Final[str] = (
    r"C:\Users\Algoforce\Documents\GitHub\Algoforce\AFMonitor\dashboard\unrealized.json"
)

# Local repo-relative fallbacks
REL_BASELINE_BAL_PATH: Final[str] = os.path.normpath(
    os.path.join(_here, "..", "dashboard", "balance.json")
)
REL_UNREALIZED_PATH: Final[str] = os.path.normpath(
    os.path.join(_here, "..", "dashboard", "unrealized.json")
)


def baseline_balance_candidates() -> list[str]:
    """Return candidate file paths for the baseline balance JSON, ordered by precedence."""
    out: list[str] = []
    if BASELINE_BALANCE_JSON:
        out.append(BASELINE_BALANCE_JSON)
    out.extend([WIN_BASELINE_BAL_PATH, REL_BASELINE_BAL_PATH])
    return out


def baseline_unrealized_candidates() -> list[str]:
    """Return candidate file paths for the baseline unrealized JSON, ordered by precedence."""
    out: list[str] = []
    if BASELINE_UNREALIZED_JSON:
        out.append(BASELINE_UNREALIZED_JSON)
    out.extend([WIN_UNREALIZED_PATH, REL_UNREALIZED_PATH])
    return out


# ---------------- Factories (cached) ----------------


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return a cached SQLAlchemy Engine built from DB_URL with safe pool settings."""
    return create_engine(DB_URL, pool_pre_ping=True, pool_recycle=3600)


@lru_cache(maxsize=1)
def get_redis() -> redis.Redis:
    """Return a cached Redis client configured with decode_responses=True."""
    # decode_responses=True so mget returns str; json.loads expects str
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


# ---------------- Time helpers ----------------


def now_utc_iso() -> str:
    """Return a timezone-aware UTC ISO 8601 string with trailing 'Z'."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
