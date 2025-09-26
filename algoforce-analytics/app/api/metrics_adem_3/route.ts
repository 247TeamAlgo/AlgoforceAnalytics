// app/analytics_adem_3_josh/route.ts
import { NextResponse } from "next/server";
import { fetchUniquePairsFromRedis, localTodayISO, addDaysISODate } from "../../(analytics)/analytics_adem_3/utils";
import { parsePair, uniqueSymbols } from "../../(analytics)/analytics_adem_3/pairs";
import { loadOhlcForSymbols } from "../../(analytics)/analytics_adem_3/ohlc";
import { computePairMetrics } from "../../(analytics)/analytics_adem_3/pairMetrics";

export async function GET(_req: Request): Promise<NextResponse> {
  try {
    const pairs = await fetchUniquePairsFromRedis(); // ["ADAUSDT_AVAXUSDT", ...]
    const symbols = uniqueSymbols(pairs);

    const tz = "Asia/Manila";
    const endISO = localTodayISO(tz);
    const startISO = "2020-01-01";        // or config
    const endExclusive = addDaysISODate(endISO, 1);

    const ohlc = await loadOhlcForSymbols(symbols, tz, startISO, endExclusive);

    const windowDays = 60;
    const alpha = 0.05;

    const results = await Promise.all(
      pairs.map(async (pid) => {
        const { x, y } = parsePair(pid);
        return computePairMetrics(pid, x, y, ohlc, windowDays, alpha);
      })
    );

    return NextResponse.json({ meta: { windowDays, alpha }, pairs: results }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}