# path: api/io/balances.py
"""Balance series utilities used across metrics (no drawdown logic)."""

from __future__ import annotations

from datetime import date
from typing import SupportsFloat, cast

import pandas as pd
from sqlalchemy import text  # ensure this import exists

from api_test.core.numbers import round6
from api_test.io.sql import (
    BALANCE_SCHEMA,
    BALANCE_TIME_COLUMN,
    BALANCE_VALUE_COLUMN,
    get_engine,
    read_account_earnings,
    read_account_trades,
    read_account_txn,
)
from api_test.io.upnl import read_upnl

# ---- Add this explicit export list ----
__all__ = [
    "serialize_balances_6dp",
    "build_day_end_balances_fixed",
    "build_margin_last_day",
]
# --------------------------------------
