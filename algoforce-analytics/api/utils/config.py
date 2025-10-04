# algoforce-analytics/api/utils/config.py
from __future__ import annotations

import os
from functools import lru_cache
from typing import Final
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
import redis

# ---------------- Paths / env ----------------

_here = os.path.dirname(__file__)
_default_accounts_path = os.path.normpath(os.path.join(_here, "..", "data", "accounts.json"))
ACCOUNTS_JSON_PATH: Final[str] = os.getenv("ACCOUNTS_JSON_PATH", _default_accounts_path)

# Which field in accounts.json is the key (table name & Redis key prefix)
ACCOUNT_KEY_FIELD: Final[str] = os.getenv("ACCOUNT_KEY_FIELD", "redisName")

# Primary DSN targets the MySQL server (default DB is `trades`; we fully-qualify other schemas).
DB_URL: Final[str] = os.getenv("DB_URL") or os.getenv("TRADES_DSN") or \
    "mysql+mysqlconnector://247team:password@192.168.50.238:3306/trades"

# Redis
REDIS_HOST: Final[str] = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT: Final[int] = int(os.getenv("REDIS_PORT", "6379"))

# Balance schema (hard-wired to your actual layout)
BALANCE_SCHEMA: Final[str] = os.getenv("BALANCE_SCHEMA", "balance")
BALANCE_TIME_COLUMN: Final[str] = os.getenv("BALANCE_TIME_COLUMN", "datetime")
BALANCE_VALUE_COLUMN: Final[str] = os.getenv("BALANCE_VALUE_COLUMN", "overall_balance")

# Other schemas used for the ledger (defaults match your notebook)
TRANSACTION_SCHEMA: Final[str] = os.getenv("TRANSACTION_SCHEMA", "transaction_history")
EARNINGS_SCHEMA:    Final[str] = os.getenv("EARNINGS_SCHEMA", "earnings")

# ---------------- Factories (cached) ----------------

@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(DB_URL, pool_pre_ping=True, pool_recycle=3600)

@lru_cache(maxsize=1)
def get_redis() -> redis.Redis:
    # decode_responses=True so mget returns str; json.loads expects str
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
