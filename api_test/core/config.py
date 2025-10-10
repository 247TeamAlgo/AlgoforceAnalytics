# path: api/core/config.py
"""Environment configuration and cached factories (SQLAlchemy, Redis)."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Final

import redis
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

_here = os.path.dirname(__file__)
_default_accounts_path = os.path.normpath(os.path.join(_here, "..", "data", "accounts.json"))
ACCOUNTS_JSON_PATH: Final[str] = os.getenv("ACCOUNTS_JSON_PATH", _default_accounts_path)

ACCOUNT_KEY_FIELD: Final[str] = os.getenv("ACCOUNT_KEY_FIELD", "redisName")

DB_URL: Final[str] = (
    os.getenv("DB_URL")
    or os.getenv("TRADES_DSN")
    or "mysql+mysqlconnector://247team:password@192.168.50.238:3306/trades"
)

REDIS_HOST: Final[str] = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT: Final[int] = int(os.getenv("REDIS_PORT", "6379"))

BALANCE_SCHEMA: Final[str] = os.getenv("BALANCE_SCHEMA", "balance")
BALANCE_TIME_COLUMN: Final[str] = os.getenv("BALANCE_TIME_COLUMN", "datetime")
BALANCE_VALUE_COLUMN: Final[str] = os.getenv("BALANCE_VALUE_COLUMN", "overall_balance")

BASELINE_BALANCE_JSON: Final[str] = os.getenv("BASELINE_BALANCE_JSON", "")
BASELINE_UNREALIZED_JSON: Final[str] = os.getenv("BASELINE_UNREALIZED_JSON", "")

WIN_BASELINE_BAL_PATH: Final[str] = (
    r"C:\Users\Algoforce\Documents\GitHub\Algoforce\AFMonitor\dashboard\balance.json"
)
WIN_UNREALIZED_PATH: Final[str] = (
    r"C:\Users\Algoforce\Documents\GitHub\Algoforce\AFMonitor\dashboard\unrealized.json"
)

REL_BASELINE_BAL_PATH: Final[str] = os.path.normpath(
    os.path.join(_here, "..", "dashboard", "balance.json")
)
REL_UNREALIZED_PATH: Final[str] = os.path.normpath(
    os.path.join(_here, "..", "dashboard", "unrealized.json")
)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return a cached SQLAlchemy Engine configured via DB_URL."""
    return create_engine(DB_URL, pool_pre_ping=True, pool_recycle=3600)


@lru_cache(maxsize=1)
def get_redis() -> redis.Redis:
    """Return a cached Redis client with decode_responses=True."""
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
