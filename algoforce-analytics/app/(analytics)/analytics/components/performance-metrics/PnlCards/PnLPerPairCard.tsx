"use client";

import * as React from "react";
import RankedBarCard from "./RankedBarCard";
import { MetricsPayload } from "@/lib/types";



type PairWithPct = PairAggregate & { mtd_return_pct: number };

export default function MtdReturnByPairCard({
  metrics,
}: {
  metrics: MetricsPayload;
}) {
  const rows: PairWithPct[] = (metrics.pair_breakdown ?? []).map((r) => ({
    ...r,
    mtd_return_pct: (r.mtd_return_proxy ?? 0) * 100,
  }));

  return (
    <RankedBarCard<PairWithPct>
      title="MTD Return — Pairs"
      description="Return proxy this month per pair."
      rows={rows}
      idKey="pair"
      label={(r) => r.pair}
      valueKey="mtd_return_pct"
      valueFormat="pct"
      secondary={[
        { key: "mtd_pnl", label: "MTD PnL", format: "usd" },
        { key: "mtd_pos_size", label: "MTD PosSize", format: "usd" },
        { key: "win_rate_pct", label: "Win%", format: "pct" },
      ]}
      defaultTopN={15}
      fmtUsd={fmtUsd}
      initialTab="all"
    />
  );
}
