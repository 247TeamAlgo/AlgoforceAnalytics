// app/analytics_adem_3_josh/metrics/ohlc.ts
import type { OhlcRow } from "@/lib/metrics_core"; // datetime, open, high, low, close, volume
import { fetchOHLCRows } from "@/lib/metrics_core";

export interface OhlcBySymbol { [symbol: string]: OhlcRow[]; }

export function isoDay(ts: string): string { return ts.slice(0, 10); }

export async function loadOhlcForSymbols(
  symbols: string[],
  tz: string,
  startISO: string,          // "YYYY-MM-DD"
  endExclusiveISO: string,   // "YYYY-MM-DD"
  tfSuffix: string = "_4h"   // change if you want other TFs
): Promise<OhlcBySymbol> {
  const out: OhlcBySymbol = {};
  for (const sym of symbols) {
    // Your current fetchOHLCRows signature in utils: (tableOrSymbol, tz, startISO, endISO)
    const table = `${sym.toLowerCase()}${tfSuffix}`;
    out[sym] = await fetchOHLCRows(table, tz, startISO, endExclusiveISO);
  }
  return out;
}

export function alignCloses(
  a: OhlcRow[],
  b: OhlcRow[]
): { days: string[]; x: number[]; y: number[] } {
  const ma = new Map<string, number>(a.map(r => [isoDay(r.datetime), Number(r.close)]));
  const mb = new Map<string, number>(b.map(r => [isoDay(r.datetime), Number(r.close)]));
  const days = [...ma.keys()].filter(d => mb.has(d)).sort();
  const x: number[] = [];
  const y: number[] = [];
  for (const d of days) {
    const vx = ma.get(d)!; const vy = mb.get(d)!;
    if (vx > 0 && vy > 0 && Number.isFinite(vx) && Number.isFinite(vy)) { x.push(vx); y.push(vy); }
  }
  return { days, x, y };
}
