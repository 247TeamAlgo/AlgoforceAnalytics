// app/api/analytics_adem_1_josh/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Reuse your analytics helpers (server-safe)
import {
  extractAndSort,
  analyzeProfitSeries,
  filterByRange,
} from "./utils"; // ← adjust if your utils live elsewhere
import type { RangeBound } from "./types";
import { MetricConfig } from "@/lib/types";
import { computeRunProbabilities } from "./prob_loss_k";
import { probDDExceed } from "./prob_dd_exceed";
import { computeWinLossRates, getHitRatioRows } from "./hit_ratio";
import { getLosingStreakRows } from "./losing_streak";

export async function GET(req: Request): Promise<NextResponse> { // For testing
  try {
    const filePath = path.join(process.cwd(), "data/OFFICE.json");
    console.log("TEST 1")
    const raw = await fs.readFile(filePath, "utf-8");
    console.log("TEST 2")
    const jsonData: Record<string, unknown> = JSON.parse(raw);
    console.log("TEST 3")

    const sorted = extractAndSort(jsonData);
    console.log("TEST 4")
    if (sorted.length === 0) {
      return NextResponse.json(
        { error: "No valid datetimes found in JSON keys" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    console.log("TEST 5")
    const k = [1]; // Change this to multiple eventually

    const start: RangeBound | undefined = (startParam ?? undefined) as
      | RangeBound
      | undefined;
    const end: RangeBound | undefined = (endParam ?? undefined) as
      | RangeBound
      | undefined;
    console.log("TEST 6")

    const filtered = filterByRange(sorted, { start, end });
    if (filtered.length === 0) {
      return NextResponse.json(
        { error: "No entries in selected range" },
        { status: 404 }
      );
    }
    console.log("TEST 7")

    // const loss_streak_analysis = await getLosingStreakRows("algoforce1");
    // console.log("TEST 8")
    // const cfg: MetricConfig = {};
    // const p_dd_exceed_x = computeRunProbabilities(filtered, k);
    // console.log("TEST 9")
    // // const p_losing_more_k_days_weeks = await probDDExceed("af1", cfg);
    // // console.log("TEST 10")
    // const hit_ratio = await getHitRatioRows("algoforce1");
    // console.log("TEST 11")

    return NextResponse.json(
      {
        k,
        // losing_streak: loss_streak_analysis, // Losing streak (element/day/week), now last-of-day/week based
        // p_dd_exceed_x: p_dd_exceed_x, // Probability of ≥k-run over day/week horizons
        // p_losing_more_k_days_weeks: p_losing_more_k_days_weeks,
        // hit_ratio: hit_ratio, // Hit ratio per trade/day/week; day/week use last observation
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to process JSON file" },
      { status: 500 }
    );
  }
}