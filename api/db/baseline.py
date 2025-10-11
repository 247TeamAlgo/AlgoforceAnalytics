"""Tiny file-based baseline store (JSON)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _path(p: str | Path) -> Path:
    """Normalize a path value to Path."""
    return p if isinstance(p, Path) else Path(p)


def read_baseline(path: str | Path) -> dict[str, Any]:
    """Read baseline JSON file; return {} if the file does not exist or is invalid."""
    file_path = _path(path)
    if not file_path.exists():
        return {}
    try:
        with open(file_path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def write_baseline(path: str | Path, data: dict[str, Any]) -> None:
    """Write baseline JSON file atomically (basic)."""
    file_path = _path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = file_path.with_suffix(file_path.suffix + ".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)
    tmp.replace(file_path)
