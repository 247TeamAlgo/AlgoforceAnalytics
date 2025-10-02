from __future__ import annotations

import os
from typing import Final
from sqlalchemy import create_engine
import redis


# ---------- Paths / env ----------

# Flat dict of initial balances per account
BALANCE_JSON_PATH: Final[str] = os.getenv(
    "BALANCE_JSON_PATH",
    r"C:\Users\Algoforce\Documents\GitHub\Algoforce\AFMonitor\dashboard\balance.json",
)

# Accounts metadata JSON (list of objects)
_here = os.path.dirname(__file__)
_default_accounts_path = os.path.normpath(os.path.join(_here, "..", "data", "accounts.json"))
ACCOUNTS_JSON_PATH: Final[str] = os.getenv("ACCOUNTS_JSON_PATH", _default_accounts_path)

# Which field in accounts.json is the key (table name & Redis key prefix)
ACCOUNT_KEY_FIELD: Final[str] = os.getenv("ACCOUNT_KEY_FIELD", "redisName")

# DB & Redis
DB_URL: Final[str] = os.getenv("DB_URL") or os.getenv("TRADES_DSN") or \
    "mysql+mysqlconnector://247team:password@192.168.50.238:3306/trades"

REDIS_HOST: Final[str] = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT: Final[int] = int(os.getenv("REDIS_PORT", "6379"))


# ---------- Factories ----------

def get_engine():
    return create_engine(DB_URL, pool_pre_ping=True, pool_recycle=3600)

def get_redis() -> redis.Redis:
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
