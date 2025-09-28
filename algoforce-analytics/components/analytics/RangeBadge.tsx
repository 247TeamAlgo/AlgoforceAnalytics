"use client";

import { usePrefs } from "@/components/prefs/PrefsContext";
import { Badge } from "@/components/ui/badge";

function fromISODateLocal(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
const LOCAL_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});
function prettyLocal(s?: string): string {
  const dt = fromISODateLocal(s);
  return dt ? LOCAL_FMT.format(dt) : "";
}

export function RangeBadge() {
  const { analyticsRange, analyticsEarliest } = usePrefs();
  const left =
    analyticsEarliest && !analyticsRange.start
      ? "Earliest"
      : prettyLocal(analyticsRange.start) || "—";
  const right = prettyLocal(analyticsRange.end) || "—";
  return (
    <Badge variant="outline" className="hidden sm:inline-flex ml-2">
      {left} → {right}
    </Badge>
  );
}
