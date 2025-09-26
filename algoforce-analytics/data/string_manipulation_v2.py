from __future__ import annotations
import json, re
from pathlib import Path
from typing import Dict, Any, Union

LINE = re.compile(r"^([^:]+):\s*(.*)$")
KEY_MAP = {"% Return": "Percent Return"}  # normalize keys

def coerce(v: str) -> Union[int, float, str]:
    t = v.replace("$", "").replace("%", "").replace(",", "").strip()
    if t == "":
        return ""
    try:
        return int(t)
    except ValueError:
        try:
            return float(t)
        except ValueError:
            return v.strip()

def parse_report_txt(path: str | Path) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    text = Path(path).read_text(encoding="utf-8").strip()
    for block in filter(None, text.split("\n\n")):
        acct = date = None
        kv: Dict[str, Any] = {}
        for ln in filter(None, (s.strip() for s in block.splitlines())):
            m = LINE.match(ln)
            if not m:
                continue
            key, val = m.group(1).strip(), m.group(2).strip()
            key = KEY_MAP.get(key, key)
            if key == "Account":
                acct = val
            elif key == "Date":
                date = val
            else:
                kv[key] = coerce(val)
        if not acct or not date:
            raise ValueError(f"Missing Account/Date in block:\n{block}")
        out[f"{acct} {date}"] = kv
    return out

# Example
accounts = ["AF1", "AF5", "FUND2", "FUND3", "MIRRORX1", "MIRRORX2", "MIRRORX3", "MIRRORX4", "OFFICE", "TEAM"]
for account in accounts:
    result = parse_report_txt(f"{account}.txt")
    Path(f"{account}.json").write_text(
        json.dumps(result, indent=2), encoding="utf-8"
    )