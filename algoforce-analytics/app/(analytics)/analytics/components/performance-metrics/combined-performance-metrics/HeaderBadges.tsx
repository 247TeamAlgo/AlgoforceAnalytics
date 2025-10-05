"use client";

import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { usd6 } from "./helpers";
import { REALIZED_COLOR, MARGIN_COLOR } from "./helpers";

export function HeaderBadges({
  totalBal,
  startBal,
  deltaBal,
}: {
  totalBal: number;
  startBal: number;
  deltaBal: number;
}) {
  const deltaPositive = deltaBal >= 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
        <span
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{ backgroundColor: "var(--muted-foreground)" }}
        />
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold text-foreground">{usd6(totalBal)}</span>
      </span>

      <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
        <span
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{ backgroundColor: REALIZED_COLOR }}
        />
        <span className="text-muted-foreground">Start</span>
        <span className="font-semibold text-foreground">{usd6(startBal)}</span>
      </span>

      <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
        <span
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{
            backgroundColor: deltaPositive ? REALIZED_COLOR : MARGIN_COLOR,
          }}
        />
        {deltaPositive ? (
          <TrendingUp
            className="h-3.5 w-3.5"
            style={{ color: REALIZED_COLOR }}
          />
        ) : (
          <TrendingDown
            className="h-3.5 w-3.5"
            style={{ color: MARGIN_COLOR }}
          />
        )}
        <span className="text-muted-foreground">Delta</span>
        <span className="font-semibold text-foreground">{usd6(deltaBal)}</span>
      </span>
    </div>
  );
}
