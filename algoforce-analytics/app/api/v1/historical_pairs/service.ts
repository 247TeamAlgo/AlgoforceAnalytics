// app/api/historical_pairs/service.ts
import type { TradeRow, BucketRow, HistoricalResponse } from "./types";

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Simple per-leg $PnL: (exit - entry) * qty. Works for long (qty>0) & short (qty<0). */
function legPnl(entryPrice: number, exitPrice: number, qty: number): number {
  return (exitPrice - entryPrice) * qty;
}

/** Split "AAAUSDT_BBBUSDT" -> ["AAAUSDT","BBBUSDT"] safely */
function splitPair(pair: string): [string, string] {
  const [a, b] = (pair || "").split("_");
  return [a || "", b || ""];
}

function toBucket(rows: Array<{ label: string; pnl: number }>): BucketRow[] {
  // aggregate by label
  const map = new Map<string, { count: number; pos: number; neg: number; wins: number }>();
  for (const r of rows) {
    const cur = map.get(r.label) ?? { count: 0, pos: 0, neg: 0, wins: 0 };
    cur.count += 1;
    if (r.pnl >= 0) { cur.pos += r.pnl; cur.wins += 1; }
    else { cur.neg += r.pnl; }
    map.set(r.label, cur);
  }
  // compose rows
  const out: BucketRow[] = [];
  for (const [label, v] of map.entries()) {
    const wr = v.count ? (100 * v.wins) / v.count : null;
    out.push({
      label,
      count: v.count,
      pnl_pos: v.pos,
      pnl_neg: v.neg,   // keep negative (for diverging bars)
      winrate_pct: wr == null ? null : Number(wr.toFixed(2)),
    });
  }
  // sort by magnitude (like your screenshots)
  out.sort((a, b) => (Math.abs(b.pnl_pos + b.pnl_neg) - Math.abs(a.pnl_pos + a.pnl_neg)));
  return out;
}

export function buildHistoricalFromTradesheet(trades: TradeRow[]): HistoricalResponse {
  // Only use CLOSED trades (have both exit prices)
  const closed = (trades ?? []).filter(t =>
    t.exit_price_0 != null && t.exit_price_1 != null &&
    t.avg_price_0 != null && t.avg_price_1 != null &&
    t.qty_0 != null && t.qty_1 != null
  );

  // Per-pair PnL rows
  const pairRows = closed.map(t => {
    const p0 = legPnl(num(t.avg_price_0), num(t.exit_price_0), num(t.qty_0));
    const p1 = legPnl(num(t.avg_price_1), num(t.exit_price_1), num(t.qty_1));
    return { label: t.pair, pnl: p0 + p1 };
  });

  // Per-symbol attribution: split pair PnL into leg contributions
  const symbolRows = closed.flatMap(t => {
    const [s0, s1] = splitPair(t.pair);
    const p0 = legPnl(num(t.avg_price_0), num(t.exit_price_0), num(t.qty_0));
    const p1 = legPnl(num(t.avg_price_1), num(t.exit_price_1), num(t.qty_1));
    return [
      { label: s0, pnl: p0 },
      { label: s1, pnl: p1 },
    ];
  });

  return {
    perPair: toBucket(pairRows),
    perSymbol: toBucket(symbolRows),
  };
}
