import fs from "node:fs";

export function readBaselineUsd(account: string): number {
  const defaultPath =
    "C:\\Users\\Algoforce\\Documents\\GitHub\\Algoforce\\AFMonitor\\dashboard\\balance.json";
  const path = process.env.BASELINE_BALANCE_JSON || defaultPath;
  try {
    const txt = fs.readFileSync(path, "utf-8");
    const json = JSON.parse(txt) as Record<string, number>;
    const key = account.toLowerCase();
    const v = json[key] ?? json[account] ?? 0;
    if (typeof v !== "number") return 0;
    return v;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[baseline] failed to read ${path}:`, err);
    return 0;
  }
}
