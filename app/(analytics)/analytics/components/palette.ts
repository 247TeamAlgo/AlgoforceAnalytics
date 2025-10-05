// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/helpers.ts
export type MetricsColors = {
  railBg: string;
  guide: string;
  realized: string;
  margin: string;
  upnl: string;
  pos: string;
  neg: string;
};

export const METRICS_COLORS: MetricsColors = {
  railBg: "rgba(148,163,184,0.14)", // neutral rails (dark/light friendly)
  guide: "var(--muted-foreground)",
  realized: "hsl(210 90% 55%)", // blue
  margin: "hsl(28  96% 56%)", // orange
  upnl: "hsl(45  94% 55%)", // gold
  pos: "hsl(152 62% 50%)", // green
  neg: "hsl(0   84% 62%)", // red
};
