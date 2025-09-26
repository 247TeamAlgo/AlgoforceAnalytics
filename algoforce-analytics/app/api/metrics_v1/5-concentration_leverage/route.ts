import { NextResponse } from "next/server";
import { computeSymbolExposures, computePairExposures, computeConcentrationRisk } from "./exposure";
import { computePairCorrelationMatrix } from "./correlationMatrix";
import { fetchAllPairRowsFromRedis } from "./utils";
import type { PairRow } from "./types";

export async function GET() {
  try {
    // 1) Fetch all pair rows from Redis (proper *_tradesheet keys, parsed into PairRow)
    const rows: PairRow[] = await fetchAllPairRowsFromRedis();

    // 2) Compute exposures
    const symbolExposures = computeSymbolExposures(rows);
    const pairExposures   = computePairExposures(rows);

    // 3) Portfolio total (stub — swap with your local JSON balance rollup)
    const totalBalance = 100_000;
    const concentration = computeConcentrationRisk(pairExposures, totalBalance);

    // 4) Correlation matrix (placeholder series). Replace with real spread/return series.
    const pairIds = Array.from(new Set(rows.map(r => r.pair)));
    const fakeSeries: Record<string, number[]> = Object.fromEntries(
      pairIds.map(id => [id, [] as number[]])
    );
    const corrMatrix = computePairCorrelationMatrix(pairIds, fakeSeries);

    return NextResponse.json({
      symbolExposures,
      pairExposures,
      concentration,
      corrMatrix,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}