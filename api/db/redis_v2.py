from __future__ import annotations

import inspect
import json
from typing import Any, Optional, cast
import pandas as pd
from redis import Redis

HOST = "localhost"
PORT = 6379

# Sync client; returns strings
r: Redis = Redis(host=HOST, port=PORT, decode_responses=True)

def get_redis_json(key: str) -> Optional[Any]:
    raw_any: Any = r.get(key)
    if inspect.isawaitable(raw_any):
        # You accidentally instantiated an asyncio client; use redis.asyncio.Redis and await.
        raise RuntimeError("r.get(...) returned an awaitable; use the asyncio client and await it.")
    raw: Optional[str] = cast(Optional[str], raw_any)  # now str | None for Pylance
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON stored at key '{key}': {e}") from e
    
def wallet_balance(acc):
    open_trades = get_redis_json(f'{acc}_live')
    open_trades = pd.DataFrame(open_trades)
    open_trades['unrealizedProfit'] = open_trades['unrealizedProfit'].astype(float)
    unrealizedPnl = open_trades['unrealizedProfit'].sum()
    return unrealizedPnl