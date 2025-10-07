# C:\Users\Algoforce\Documents\GitHub\AlgoforceAnalyticsClient\api\utils\calculations\pnl_per_symbol.py  # noqa: E501
"""Compute month-to-date realized PnL per symbol across accounts."""

from __future__ import annotations

from numbers import Real
from typing import TypedDict

import pandas as pd

from ..io import load_accounts, read_account_trades


class Window(TypedDict):
    """Date window [startDay, endDay] in ISO format."""
    startDay: str
    endDay: str


class PnLResult(TypedDict):
    """Return payload for month-to-date symbol PnL."""
    window: Window
    symbols: dict[str, dict[str, float]]
    accounts: list[str]
    totalPerAccount: dict[str, float]


def _as_float(x: object) -> float:
    """Convert pandas/numpy scalars to builtin float.

    Avoids Pyright's Scalar→ConvertibleToFloat complaint by narrowing first.
    """
    if isinstance(x, Real):
        return float(x)

    # numpy-like scalar (e.g., np.float64) exposes .item()
    item = getattr(x, "item", None)
    if callable(item):
        y = item()
        if isinstance(y, Real):
            return float(y)

    # Conservative fallback: coerce via a one-element Series
    series = pd.Series([x])
    coerced = pd.to_numeric(series, errors="coerce").iloc[0]  # pyright: ignore[reportUnknownMemberType]

    # Try again with the coerced scalar
    item2 = getattr(coerced, "item", None)
    if callable(item2):
        y2 = item2()
        if isinstance(y2, Real):
            return float(y2)
    if isinstance(coerced, Real):
        return float(coerced)

    # Last resort: NaN keeps downstream math stable
    return float("nan")


def _prep_trades_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize dtypes for 'symbol' and 'realizedPnl' columns."""
    use = df.loc[:, ["symbol", "realizedPnl"]].copy()
    use["symbol"] = use["symbol"].astype("string")

    col = pd.to_numeric(  # pyright: ignore[reportUnknownMemberType]
        use["realizedPnl"],
        errors="coerce",
    )
    col = col.fillna(0.0)  # pyright: ignore[reportUnknownMemberType]
    use["realizedPnl"] = col.astype("float64")
    return use


def _empty_result(
    start_day_iso: str,
    end_day_iso: str,
    accounts: list[str],
) -> PnLResult:
    """Shape an empty payload."""
    return {
        "window": {"startDay": start_day_iso, "endDay": end_day_iso},
        "symbols": {},
        "accounts": accounts,
        "totalPerAccount": {a: 0.0 for a in accounts},
    }


def compute_symbol_pnl_mtd(*, override_accounts: list[str] | None = None) -> PnLResult:
    """MTD-only total realized PnL per symbol with a TOTAL column."""
    accounts: list[str] = (
        override_accounts if override_accounts is not None else load_accounts(True)
    )

    today = pd.Timestamp.today().normalize()
    start_day = today.replace(day=1)

    start_iso = start_day.date().isoformat()
    end_iso = today.date().isoformat()

    frames: list[pd.Series] = []
    for acc in accounts:
        df = read_account_trades(
            acc,
            f"{start_iso} 00:00:00",
            f"{end_iso} 23:59:59",
        )
        if df.empty:
            continue

        df = _prep_trades_frame(df)

        # Group and sum per symbol for this account (pandas stubs are fuzzy).
        grouped_sum = df.groupby("symbol", sort=False)["realizedPnl"].sum()  # pyright: ignore[reportUnknownMemberType]
        frames.append(grouped_sum.rename(acc))

    if not frames:
        return _empty_result(start_iso, end_iso, accounts)

    # Combine accounts side-by-side and fill missing with zeros.
    table = pd.concat(frames, axis=1).fillna(0.0)  # pyright: ignore[reportUnknownMemberType]
    table = table.astype("float64", copy=False)

    # Per-symbol TOTAL and sort.
    table["TOTAL"] = table.sum(axis=1)
    table.sort_values("TOTAL", ascending=False, inplace=True)

    # Build symbols map with safe scalar→float conversion.
    symbols_dict: dict[str, dict[str, float]] = {}
    cols = table.columns.tolist()
    for idx in table.index.tolist():
        row_map: dict[str, float] = {}
        for col_name in cols:
            row_map[str(col_name)] = _as_float(table.at[idx, col_name])
        symbols_dict[str(idx)] = row_map

    # Per-account totals using safe conversion.
    acc_cols = [c for c in cols if str(c) != "TOTAL"]
    totals_by_account: dict[str, float] = {}
    for col_name in acc_cols:
        values = table[col_name].tolist()
        totals_by_account[str(col_name)] = sum(_as_float(v) for v in values)

    return {
        "window": {"startDay": start_iso, "endDay": end_iso},
        "symbols": symbols_dict,
        "accounts": accounts,
        "totalPerAccount": totals_by_account,
    }
