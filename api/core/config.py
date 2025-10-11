"""Shared configuration and small utilities (Redis, time helpers, env)."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # import for typing only
    from redis import Redis  # pragma: no cover


def now_utc_iso() -> str:
    """Return current UTC timestamp in ISO 8601 with 'Z' suffix."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def get_redis() -> Redis:
    """Return a Redis client (decode_responses=True)."""
    # Import here to avoid a hard dependency for type checking.
    import redis  # lazy import

    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(url, decode_responses=True)  # type: ignore[no-any-return]
