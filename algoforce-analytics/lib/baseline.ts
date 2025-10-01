// lib/baseline.ts
import fs from "node:fs";

export function readBaselineUsd(account: string): number {
  const defaultPath =
    "C:\\Users\\Algoforce\\Documents\\GitHub\\Algoforce\\AFMonitor\\dashboard\\analytics_balance.json";
  const path = process.env.BASELINE_BALANCE_JSON || defaultPath;
  try {
    const txt = fs.readFileSync(path, "utf-8");
    const json = JSON.parse(txt) as Record<string, number>;
    const key = account.toLowerCase();
    const v = json[key] ?? json[account];
    if (typeof v !== "number") {
      throw new Error(`baseline missing or not a number for "${account}"`);
    }
    return v;
  } catch (err) {
    // surface upstream — caller will aggregate per-request error policy
    throw new Error(
      `[baseline] failed to read "${account}" from ${path}: ${String(err)}`
    );
  }
}
