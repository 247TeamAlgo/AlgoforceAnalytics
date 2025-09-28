"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sigma, TrendingDown, TrendingUp } from "lucide-react";

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
  /** Live overlay values, keyed by the row id (e.g. symbol). */
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
  const [signFilter, setSignFilter] = React.useState<"all" | "pos" | "neg">(
    initialTab
  );
  const [sortMode, setSortMode] = React.useState<SortMode>("pnl-desc");
  const [wrapRef] = useElementSize<HTMLDivElement>();
  const isPercent = valueFormat === "pct";

  // Normalize + clamp + overlay
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

  const filtered: RankedDatum[] = React.useMemo(() => {
    let list = data;
    if (signFilter !== "all") list = list.filter((d) => d.sign === signFilter);
    return [...list].sort((a, b) => {
      switch (sortMode) {
        case "alpha-asc":
          return a.label.localeCompare(b.label, undefined, {
            sensitivity: "base",
          });
        case "alpha-desc":
          return b.label.localeCompare(a.label, undefined, {
            sensitivity: "base",
          });
        case "pnl-asc":
          return a.value - b.value;
        case "pnl-desc":
        default:
          return b.value - a.value;
      }
    });
  }, [data, signFilter, sortMode]);

  /* -------- summary / legend chips -------- */
  const stats = React.useMemo(() => {
    if (filtered.length === 0)
      return {
        sum: 0,
        max: null as RankedDatum | null,
        min: null as RankedDatum | null,
        posN: 0,
        negN: 0,
      };
    let sum = 0,
      max = filtered[0]!,
      min = filtered[0]!,
      posN = 0,
      negN = 0;
    for (const d of filtered) {
      sum += d.value;
      if (d.value > max.value) max = d;
      if (d.value < min.value) min = d;
      if (d.value > 0) posN += 1;
      else if (d.value < 0) negN += 1;
    }
    return { sum, max, min, posN, negN };
  }, [filtered]);

  /* -------- layout, axis, and domain -------- */
  const rowGapPx = 8;
  const barHeight = barSizePx;
  const contentHeight = Math.max(
    64,
    12 + filtered.length * (barHeight + rowGapPx)
  );
  const maxLabelLen = filtered.reduce((m, d) => Math.max(m, d.label.length), 0);
  const yAxisWidth = Math.max(
    64,
    Math.min(140, Math.round(maxLabelLen * 7.0 + 14))
  );

  const xDomain: [number, number] = React.useMemo(() => {
    if (filtered.length === 0) return [0, 1];
    if (clampMode === "nonneg" || clampMode === "zeroTo100") {
      let max = 0;
      for (const d of filtered) if (d.value > max) max = d.value;
      if (clampMode === "zeroTo100") max = Math.min(100, max);
      const pad = Math.max(isPercent ? 0.2 : 0.5, Math.abs(max) * 0.06);
      return [0, max + pad];
    }
    let min = 0,
      max = 0;
    for (const d of filtered) {
      if (d.value < min) min = d.value;
      if (d.value > max) max = d.value;
    }
    if (min === max) {
      const pad = Math.max(1, Math.abs(max) * 0.2);
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.06;
    return [min - pad, max + pad];
  }, [filtered, clampMode, isPercent]);

  const posMax = Math.max(0, xDomain[1]);
  const negMin = clampMode === "none" ? Math.min(0, xDomain[0]) : 0;

  type TrailDatum = RankedDatum & { posTrail: number; negTrail: number };
  const withTrail: TrailDatum[] = React.useMemo(
    () => filtered.map((d) => ({ ...d, posTrail: posMax, negTrail: negMin })),
    [filtered, posMax, negMin]
  );

  const cfg = React.useMemo(() => chartConfigBase, []);

  /* -------- value badge (React element, TS-safe) -------- */
  const BADGE_FONT_PX = 11;
  const BADGE_RX = 6;
  const BADGE_PAD_X = 6;
  const BADGE_PAD_Y = 3;

  const ValueBadgeLabel: React.FC<Record<string, unknown>> = (props) => {
    const num = (v: unknown) =>
      typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    const x = num(props.x),
      y = num(props.y),
      width = num(props.width),
      height = num(props.height),
      value = num(props.value);
    if (![x, y, width, height, value].every(Number.isFinite)) return null;

    const labelText = formatValue(value, valueFormat, fmtUsd);
    const textW = Math.ceil(labelText.length * BADGE_FONT_PX * 0.62);
    const W = textW + BADGE_PAD_X * 2;
    const H = BADGE_FONT_PX + BADGE_PAD_Y * 2;

    const isPos = value >= 0;
    const gapOutside = 8;
    const hasRoomInside = Math.abs(width) >= W + 6;

    const rectX = isPos
      ? hasRoomInside
        ? x + width - W - 4
        : x + width + gapOutside
      : hasRoomInside
        ? x + 4
        : x - gapOutside - W;
    const rectY = y + height / 2 - H / 2;

    const accentColor = isPos ? POS_COLOR : NEG_COLOR;
    const accentX = rectX + (isPos ? 0 : W - 2);

    return (
      <g
        style={{
          filter:
            "drop-shadow(0 1px 0 rgba(0,0,0,0.10)) drop-shadow(0 4px 8px rgba(0,0,0,0.06))",
          pointerEvents: "none",
        }}
      >
        <rect
          x={rectX}
          y={rectY}
          rx={BADGE_RX}
          ry={BADGE_RX}
          width={W}
          height={H}
          fill="var(--background)"
          fillOpacity={0.36}
          stroke="var(--border)"
          strokeWidth={1}
          strokeOpacity={0.38}
        />
        <rect
          x={accentX}
          y={rectY}
          width={2}
          height={H}
          rx={BADGE_RX}
          ry={BADGE_RX}
          fill={accentColor}
          fillOpacity={0.7}
        />
        <text
          x={rectX + BADGE_PAD_X}
          y={rectY + H / 2 + BADGE_FONT_PX * 0.36}
          className="font-semibold"
          fontSize={BADGE_FONT_PX}
          fill="var(--foreground)"
          fillOpacity={0.98}
        >
          {labelText}
        </text>
      </g>
    );
  };

  const secondarySpec = React.useMemo(
    () =>
      secondary.map((s) => ({
        keyStr: String(s.key),
        label: s.label,
        format: s.format,
      })),
    [secondary]
  );

  const leftMargin = 16;
  const rightMargin = 40;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* LEFT: title/desc + stats row */}
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight text-foreground">
              {title}
            </CardTitle>
            {description ? (
              <CardDescription className="mt-0.5">
                {description}
              </CardDescription>
            ) : null}

            {/* stats + legend chips (with icons) */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
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

              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: POS_COLOR }}
                />
                <TrendingUp
                  className="h-3.5 w-3.5"
                  style={{ color: POS_COLOR }}
                />
                <span className="text-muted-foreground">Pos</span>
                <span className="font-semibold text-foreground">
                  {stats.posN}
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
                <span className="text-muted-foreground">Neg</span>
                <span className="font-semibold text-foreground">
                  {stats.negN}
                </span>
              </span>
            </div>
          </div>

          {/* RIGHT: sort, tabs, count */}
          <div className="px-6 pb-3 sm:py-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={sortMode}
                onValueChange={(v) => setSortMode(v as SortMode)}
              >
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="alpha-asc">Alphabetical (A–Z)</SelectItem>
                  <SelectItem value="alpha-desc">Alphabetical (Z–A)</SelectItem>
                  <SelectItem value="pnl-asc">Value (Ascending)</SelectItem>
                  <SelectItem value="pnl-desc">Value (Descending)</SelectItem>
                </SelectContent>
              </Select>

              <Tabs
                value={signFilter}
                onValueChange={(v) => setSignFilter(v as "all" | "pos" | "neg")}
              >
                <TabsList className="h-8">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pos">Pos</TabsTrigger>
                  <TabsTrigger value="neg">Neg</TabsTrigger>
                </TabsList>
              </Tabs>

              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span className="text-muted-foreground">
                  {filtered.length} {itemsNoun}
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
                  margin={{ left: 16, right: 40, top: 8, bottom: 8 }}
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
                    domain={[
                      Math.min(0, ...withTrail.map((d) => d.value)),
                      Math.max(0, ...withTrail.map((d) => d.value)),
                    ]}
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

                  {/* Trails */}
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

                  {/* Realized values */}
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
                    <LabelList content={<ValueBadgeLabel />} />
                  </Bar>

                  {/* Optional live overlay (thin bar) */}
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
