// app/(analytics)/analytics/components/performance-metrics/losing-days/RegularReturnsCard.tsx
"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { METRICS_COLORS } from "../combined-performance-metrics/helpers";
import { ChevronDown } from "lucide-react";

type Range = "Daily" | "Weekly" | "Monthly";

const DUMMY_RETURNS: Record<Range, number> = {
  Daily: 0.1,
  Weekly: 0.5,
  Monthly: 0.75,
};

function pct0(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function CombinedTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): React.ReactNode {
  return (
    <li
      className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
      style={{
        boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${color} 22%, transparent)`,
      }}
      title={label}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{label}</div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-2xl font-bold leading-none tracking-tight"
          style={{ color }}
        >
          {pct0(value)}
        </span>
      </div>
    </li>
  );
}

export default function RegularReturnsCard(): React.ReactNode {
  const [range, setRange] = useState<Range>("Daily");
  const value: number = useMemo(() => DUMMY_RETURNS[range], [range]);
  const VALUE_COLOR: string = METRICS_COLORS.margin;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-2 pb-3 sm:py-2">
          <CardTitle className="text-base">Regular Returns (IUD)</CardTitle>

          {/* Horizontal spacing between label and dropdown */}
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="rr-range" className="text-sm text-muted-foreground">
              Range
            </label>
            <div className="relative inline-block">
              <select
                id="rr-range"
                value={range}
                onChange={(e) => setRange(e.target.value as Range)}
                className="appearance-none rounded-md border bg-background px-3 py-1 pr-12 text-sm"
                aria-label="Select return range"
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <ul className="space-y-2">
          <CombinedTile label="Combined" value={value} color={VALUE_COLOR} />
        </ul>
      </CardContent>
    </Card>
  );
}
