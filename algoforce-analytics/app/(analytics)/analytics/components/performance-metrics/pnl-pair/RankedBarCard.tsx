"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

/* --------------------------------- types --------------------------------- */
type ValueFormat = "usd" | "pct" | "num";

const POS_COLOR = "#23ba7d";
const NEG_COLOR = "#f6465d";
const TRAIL_POS = "rgba(35, 186, 125, 0.14)";
const TRAIL_NEG = "rgba(246, 70, 93, 0.14)";

type SecondaryField<T> = { key: keyof T; label: string; format: ValueFormat };
type ClampMode = "none" | "nonneg" | "zeroTo100";
type RankedDatum = {
  id: string;
  label: string;
  value: number;
  sign: "pos" | "neg" | "zero";
  overlay?: number;
  extras?: Record<string, number | null | undefined>;
};
type SortMode = "alpha-asc" | "alpha-desc" | "pnl-asc" | "pnl-desc";

/* --------------------------------- utils --------------------------------- */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function fmtNum(v: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
}
export function formatValue(
  v: number,
  kind: ValueFormat,
  fmtUsd?: (x: number) => string
): string {
  if (!isFiniteNumber(v)) return "—";
  if (kind === "usd") return fmtUsd ? fmtUsd(v) : `$${fmtNum(v)}`;
  if (kind === "pct") return `${fmtNum(v)}%`;
  return fmtNum(v);
}
const chartConfigBase: ChartConfig = {
  pos: { label: "Positive", color: POS_COLOR },
  neg: { label: "Negative", color: NEG_COLOR },
};

type Size = { width: number; height: number };
function useElementSize<T extends HTMLElement>(): readonly [
  React.RefObject<T>,
  Size,
] {
  const ref = React.useRef<T>(null!);
  const [size, setSize] = React.useState<Size>({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ------------------------------- tooltip UI -------------------------------- */
type TooltipEntry = {
  dataKey: string;
  value: unknown;
  payload: RankedDatum & { posTrail?: number; negTrail?: number };
};
function isTooltipEntryArray(arr: unknown): arr is TooltipEntry[] {
  return (
    Array.isArray(arr) &&
    arr.every((e) => {
      if (!e || typeof e !== "object") return false;
      const o = e as Record<string, unknown>;
      return typeof o.dataKey === "string" && "payload" in o;
    })
  );
}
function TooltipContent({
  active,
  label,
  payload,
  valueFormat,
  fmtUsd,
  secondarySpec,
}: {
  active?: boolean;
  label?: string;
  payload?: unknown[];
  valueFormat: ValueFormat;
  fmtUsd?: (x: number) => string;
  secondarySpec: { keyStr: string; label: string; format: ValueFormat }[];
}) {
  if (!active || !isTooltipEntryArray(payload) || payload.length === 0)
    return null;
  const valueEntry = payload.find((p) => p.dataKey === "value") ?? payload[0];
  const d = valueEntry.payload;
  const mainVal =
    typeof valueEntry.value === "number"
      ? valueEntry.value
      : Number(valueEntry.value);
  const extras = secondarySpec.map((s) => {
    const raw = d.extras ? d.extras[s.keyStr] : undefined;
    const num =
      typeof raw === "number" ? raw : raw == null ? null : Number(raw);
    return {
      label: s.label,
      text: num == null ? "—" : formatValue(num, s.format, fmtUsd),
    };
  });
  return (
    <div className="rounded-md border bg-background/95 p-3 shadow-sm">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">
        {formatValue(mainVal, valueFormat, fmtUsd)}
      </div>
      {extras.length > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {extras.map((e) => (
            <div
              key={e.label}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="text-muted-foreground">{e.label}</span>
              <span className="font-medium text-foreground">{e.text}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- props ----------------------------------- */
export type RankedBarCardProps<T extends Record<string, unknown>> = {
  title: string;
  description?: string;
  rows: T[];
  idKey: keyof T;
  label: (row: T) => string;
  valueKey: keyof T;
  valueFormat: ValueFormat;
  secondary?: SecondaryField<T>[];
  defaultTopN?: number;
  barSizePx?: number;
  fmtUsd?: (x: number) => string;
  initialTab?: "all" | "pos" | "neg";
  clampMode?: ClampMode;
  maxChartHeightPx?: number;
  itemsNoun?: string;
  overlayMap?: Record<string, number>;
};

/* -------------------------------- component ------------------------------- */
export default function RankedBarCard<T extends Record<string, unknown>>({
  title,
  description,
  rows,
  idKey,
  label,
  valueKey,
  valueFormat,
  secondary = [],
  barSizePx = 18,
  fmtUsd,
  initialTab = "all",
  clampMode = valueFormat === "pct" ? "zeroTo100" : "none",
  maxChartHeightPx = 520,
  itemsNoun = "items",
  overlayMap,
}: RankedBarCardProps<T>) {
  const [wrapRef, wrapSize] = useElementSize<HTMLDivElement>();
  const isPercent = valueFormat === "pct";

  // Normalize
  const data: RankedDatum[] = React.useMemo(() => {
    const out: RankedDatum[] = [];
    for (const r of rows) {
      const idVal = r[idKey];
      const vRaw = r[valueKey];
      if (typeof idVal !== "string") continue;
      const v0 = Number(vRaw);
      if (!Number.isFinite(v0)) continue;

      let v = v0;
      if (clampMode === "nonneg") v = Math.max(0, v0);
      else if (clampMode === "zeroTo100") v = Math.max(0, Math.min(100, v0));

      const ov = overlayMap ? Number(overlayMap[idVal] ?? 0) : 0;

      const datum: RankedDatum = {
        id: idVal,
        label: label(r),
        value: v,
        sign: v > 0 ? "pos" : v < 0 ? "neg" : "zero",
        overlay: Number.isFinite(ov) ? ov : 0,
        extras: {},
      };

      for (const s of secondary) {
        const raw = r[s.key];
        datum.extras![String(s.key)] =
          typeof raw === "number" ? raw : raw == null ? null : Number(raw);
      }
      out.push(datum);
    }
    return out;
  }, [rows, idKey, valueKey, label, secondary, clampMode, overlayMap]);

  /* -------- summary -------- */
  const stats = React.useMemo(() => {
    if (data.length === 0)
      return { sum: 0, max: null, min: null, posN: 0, negN: 0 };
    let sum = 0,
      max = data[0]!,
      min = data[0]!,
      posN = 0,
      negN = 0;
    for (const d of data) {
      sum += d.value;
      if (d.value > max.value) max = d;
      if (d.value < min.value) min = d;
      if (d.value > 0) posN += 1;
      else if (d.value < 0) negN += 1;
    }
    return { sum, max, min, posN, negN };
  }, [data]);

  /* -------- layout, axis, and domain -------- */
  const barHeight = barSizePx;
  const contentHeight = Math.max(64, 12 + data.length * (barHeight + 8));
  const maxLabelLen = data.reduce((m, d) => Math.max(m, d.label.length), 0);
  const yAxisWidth = Math.max(
    64,
    Math.min(140, Math.round(maxLabelLen * 7.0 + 14))
  );

  // Round to hundreds
  const [domainMin, domainMax] = React.useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 100];
    let min = 0;
    let max = 0;
    for (const d of data) {
      if (d.value < min) min = d.value;
      if (d.value > max) max = d.value;
    }
    const ceilHundreds = (n: number): number => Math.ceil(n / 100) * 100;
    const floorHundreds = (n: number): number => Math.floor(n / 100) * 100;

    let lo = floorHundreds(min);
    let hi = ceilHundreds(max);
    if (lo > 0) lo = 0;
    if (hi < 0) hi = 0;
    if (lo === hi) {
      lo -= 100;
      hi += 100;
    }
    return [lo, hi];
  }, [data]);

  type TrailDatum = RankedDatum & { posTrail: number; negTrail: number };
  const withTrail: TrailDatum[] = React.useMemo(
    () =>
      data.map((d) => ({
        ...d,
        posTrail: Math.max(0, domainMax),
        negTrail: Math.min(0, domainMin),
      })),
    [data, domainMax, domainMin]
  );

  const cfg = React.useMemo(() => chartConfigBase, []);

  /* -------- right gutter label -------- */
  const RIGHT_GUTTER_PX = 140;
  const VALUE_FONT_PX = 12;
  const GUTTER_INNER_PAD_PX = 8;

  type LabelCoreProps = { y?: number; height?: number; value?: number };

  const RightGutterValueLabel: React.FC<LabelCoreProps> = (props) => {
    const y = typeof props.y === "number" ? props.y : NaN;
    const h = typeof props.height === "number" ? props.height : NaN;
    const value = typeof props.value === "number" ? props.value : NaN;
    if (![y, h, value].every(Number.isFinite)) return null;

    const text = formatValue(value, valueFormat, fmtUsd);
    const tx = Math.max(
      0,
      (wrapSize?.width ?? 0) - RIGHT_GUTTER_PX + GUTTER_INNER_PAD_PX
    );
    const ty = y + h / 2 + VALUE_FONT_PX * 0.36;

    return (
      <text
        x={tx}
        y={ty}
        textAnchor="start"
        fontSize={VALUE_FONT_PX}
        className="font-semibold"
        fill="var(--primary)"
      >
        {text}
      </text>
    );
  };

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle>{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-0.5">
                {description}
              </CardDescription>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Stats row */}
              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: "var(--muted-foreground)" }}
                />
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold text-foreground">
                  {formatValue(stats.sum, valueFormat, fmtUsd)}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: POS_COLOR }}
                />
                <TrendingUp
                  className="h-3.5 w-3.5"
                  style={{ color: POS_COLOR }}
                />
                <span className="text-muted-foreground">
                  {`Highest${stats.max ? ` ${stats.max.label}` : ""}`}
                </span>
                <span className="font-semibold text-foreground">
                  {stats.max
                    ? formatValue(stats.max.value, valueFormat, fmtUsd)
                    : "—"}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: NEG_COLOR }}
                />
                <TrendingDown
                  className="h-3.5 w-3.5"
                  style={{ color: NEG_COLOR }}
                />
                <span className="text-muted-foreground">
                  {`Lowest${stats.min ? ` ${stats.min.label}` : ""}`}
                </span>
                <span className="font-semibold text-foreground">
                  {stats.min
                    ? formatValue(stats.min.value, valueFormat, fmtUsd)
                    : "—"}
                </span>
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        {withTrail.length === 0 ? (
          <div className="text-sm text-muted-foreground px-4 py-8">
            No data.
          </div>
        ) : (
          <div
            ref={wrapRef}
            className="w-full overflow-y-auto"
            style={{ maxHeight: `${maxChartHeightPx}px` }}
          >
            <ChartContainer
              config={cfg}
              className="aspect-auto w-full"
              style={{ height: `${contentHeight}px` }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={withTrail}
                  layout="vertical"
                  margin={{
                    left: 16,
                    right: RIGHT_GUTTER_PX,
                    top: 8,
                    bottom: 8,
                  }}
                  barCategoryGap="12%"
                  barGap={-barHeight}
                >
                  <CartesianGrid horizontal vertical={false} />
                  <YAxis
                    dataKey="label"
                    type="category"
                    width={yAxisWidth}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    interval={0}
                  />
                  <XAxis
                    type="number"
                    domain={[domainMin, domainMax]}
                    tickFormatter={(v: number) =>
                      formatValue(v, valueFormat, fmtUsd)
                    }
                    minTickGap={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ReferenceLine
                    x={0}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="3 3"
                  />

                  <RechartsTooltip
                    cursor={{ fill: "transparent" }}
                    content={
                      <TooltipContent
                        valueFormat={valueFormat}
                        fmtUsd={fmtUsd}
                        secondarySpec={secondary.map((s) => ({
                          keyStr: String(s.key),
                          label: s.label,
                          format: s.format,
                        }))}
                      />
                    }
                  />

                  {/* Foreshadow trails */}
                  <Bar
                    dataKey="negTrail"
                    barSize={barHeight}
                    radius={[4, 4, 4, 4]}
                    isAnimationActive={false}
                    fill={TRAIL_NEG}
                    strokeOpacity={0}
                    style={{ pointerEvents: "none" }}
                  />
                  <Bar
                    dataKey="posTrail"
                    barSize={barHeight}
                    radius={[4, 4, 4, 4]}
                    isAnimationActive={false}
                    fill={TRAIL_POS}
                    strokeOpacity={0}
                    style={{ pointerEvents: "none" }}
                  />

                  {/* Actual values */}
                  <Bar
                    dataKey="value"
                    barSize={barHeight}
                    radius={[4, 4, 4, 4]}
                    isAnimationActive={false}
                  >
                    {withTrail.map((d) => (
                      <Cell
                        key={d.id}
                        fill={
                          d.sign === "pos"
                            ? POS_COLOR
                            : d.sign === "neg"
                              ? NEG_COLOR
                              : "var(--muted)"
                        }
                        className="transition-opacity duration-200 hover:opacity-90"
                      />
                    ))}
                    <LabelList content={<RightGutterValueLabel />} />
                  </Bar>

                  {/* Optional overlay */}
                  {overlayMap ? (
                    <Bar
                      dataKey="overlay"
                      barSize={Math.max(4, Math.round(barHeight * 0.22))}
                      radius={[4, 4, 4, 4]}
                      isAnimationActive={false}
                    >
                      {withTrail.map((d) => {
                        const ov = d.overlay ?? 0;
                        const color =
                          ov === 0
                            ? "transparent"
                            : ov > 0
                              ? POS_COLOR
                              : NEG_COLOR;
                        return <Cell key={`${d.id}-ov`} fill={color} />;
                      })}
                    </Bar>
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
