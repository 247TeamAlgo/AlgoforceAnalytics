// app/analytics_adem_3_josh/metrics/pairs.ts
export type PairId = string;          // "ADAUSDT_AVAXUSDT"
export type SymbolId = string;        // "ADAUSDT"

export interface PairDef {
  id: PairId;
  x: SymbolId; // first leg
  y: SymbolId; // second leg
}

export function parsePair(id: PairId): PairDef {
  const [x, y] = id.split("_");
  if (!x || !y) throw new Error(`Bad pair: ${id}`);
  console.log(`${id} ${x} ${y}`)
  return { id, x, y };
}

export function uniqueSymbols(pairs: PairId[]): SymbolId[] {
  const s = new Set<string>();
  for (const p of pairs) {
    const { x, y } = parsePair(p);
    s.add(x); s.add(y);
  }
  return [...s];
}
