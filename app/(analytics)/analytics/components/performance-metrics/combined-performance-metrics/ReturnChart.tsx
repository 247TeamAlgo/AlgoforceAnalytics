"use client";

import React, { useMemo } from "react";
import SignedBar from "./SignedBar";
import { REALIZED_COLOR, MARGIN_COLOR, METRICS_COLORS } from "./helpers";

function pct4(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

type Row = { label: "Realized" | "Margin"; value: number; color: string };

export function ReturnChart({
  realizedReturn,
  marginReturn,
  containerWidth,
  upnlReturn = 0,
  barHeight,
  rowGap,
  barColumnPadX = 10,
}: {
  realizedReturn: number;
  marginReturn: number;
  containerWidth: number;
  upnlReturn?: number;
  barHeight?: number;
  rowGap?: number;
  barColumnPadX?: number;
}) {
  const marginColor =
    String(MARGIN_COLOR) === String(REALIZED_COLOR)
      ? "hsl(263 90% 60%)"
      : String(MARGIN_COLOR);
  const UPNL_COLOR = METRICS_COLORS.upnl;

  const rows: Row[] = useMemo(
    () => [
      {
        label: "Realized",
        value: realizedReturn,
        color: String(REALIZED_COLOR),
      },
      { label: "Margin", value: marginReturn, color: marginColor },
    ],
    [realizedReturn, marginReturn, marginColor]
  );

  const maxAbs = Math.max(
    0,
    ...rows.map((r) => Math.abs(r.value)),
    Math.abs(upnlReturn)
  );
  const minSpan = 0.1;
  const bound = Math.max(minSpan, Math.ceil((maxAbs * 100) / 10) * 0.1);

  const guides: number[] = Array.from(
    { length: 7 },
    (_, i) => ((i - 3) / 3) * bound
  );

  const BAR_H =
    barHeight ?? Math.round(Math.min(32, Math.max(20, containerWidth * 0.026)));
  const ROW_GAP = rowGap ?? Math.round(BAR_H * 0.55);
  const LABEL_ROW_H = 22;
  const GUIDE_DASH_PX = 1;
  const STACK_H = BAR_H * 2 + ROW_GAP;

  const RAIL_BG = METRICS_COLORS.railBg;

  const asLeftPct = (v: number): string =>
    `${((v + bound) / (2 * bound)) * 100}%`;
  const valueColorClass = (v: number): string =>
    v > 0
      ? "text-emerald-500"
      : v < 0
        ? "text-red-500"
        : "text-muted-foreground";

  const renderRow = (idx: 0 | 1, r: Row) => {
    const top = idx === 0 ? 0 : BAR_H + ROW_GAP;
    const isPos = r.value > 0;
    const isNeg = r.value < 0;
    const mag = Math.abs(r.value);

    const isMargin = r.label === "Margin";
    const upPos = isMargin && upnlReturn > 0;
    const upNeg = isMargin && upnlReturn < 0;
    const upMag = Math.abs(upnlReturn);

    return (
      <>
        <div
          className="absolute left-0 z-10 rounded-[2px]"
          style={{ top, height: BAR_H, width: "50%", background: RAIL_BG }}
        />
        <div
          className="absolute right-0 z-10 rounded-[2px]"
          style={{ top, height: BAR_H, width: "50%", background: RAIL_BG }}
        />

        {isNeg && (
          <div
            className="absolute left-0 z-20 overflow-hidden rounded-[2px]"
            style={{ top, height: BAR_H, width: "50%" }}
          >
            <SignedBar
              mode="one-negative"
              anchor="right"
              value={mag}
              ghostValue={0}
              maxAbs={bound}
              height={BAR_H}
              valueThicknessPct={1}
              negColor={r.color}
              valueOpacity={0.78}
              trackClassName="rounded-[2px]"
            />
            {isMargin && upNeg && (
              <SignedBar
                mode="one-negative"
                anchor="right"
                value={upMag}
                ghostValue={0}
                maxAbs={bound}
                height={BAR_H}
                valueThicknessPct={1}
                negColor={UPNL_COLOR}
                valueOpacity={0.78}
                trackClassName="rounded-[2px] pointer-events-none"
              />
            )}
          </div>
        )}

        {isPos && (
          <div
            className="absolute right-0 z-20 overflow-hidden rounded-[2px]"
            style={{ top, height: BAR_H, width: "50%" }}
          >
            <SignedBar
              mode="one-negative"
              anchor="left"
              value={mag}
              ghostValue={0}
              maxAbs={bound}
              height={BAR_H}
              valueThicknessPct={1}
              negColor={r.color}
              valueOpacity={0.78}
              trackClassName="rounded-[2px]"
            />
            {isMargin && upPos && (
              <SignedBar
                mode="one-negative"
                anchor="left"
                value={upMag}
                ghostValue={0}
                maxAbs={bound}
                height={BAR_H}
                valueThicknessPct={1}
                negColor={UPNL_COLOR}
                valueOpacity={0.78}
                trackClassName="rounded-[2px] pointer-events-none"
              />
            )}
          </div>
        )}
      </>
    );
  };

  const BOTTOM_EXT_PX = 12;

  return (
    <div className="rounded-xl border bg-card/40 p-4 sm:p-5">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Return (MTD)
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "auto 1fr auto", columnGap: 10 }}
      >
        <div
          className="flex flex-col justify-between"
          style={{ height: STACK_H }}
        >
          <div className="text-sm text-foreground flex items-center">
            Realized
          </div>
          <div className="text-sm text-foreground flex items-center">
            Margin
          </div>
        </div>

        <div
          className="relative w-full min-w-0"
          style={{ height: STACK_H, padding: `0 ${barColumnPadX}px` }}
        >
          <div
            className="pointer-events-none absolute z-[15]"
            style={{
              left: barColumnPadX,
              right: barColumnPadX,
              top: 0,
              bottom: -BOTTOM_EXT_PX,
            }}
            aria-hidden
          >
            {guides.map((g, i) => (
              <div
                key={`shared-g-${i}`}
                className="absolute inset-y-0 border-r border-dashed opacity-90"
                style={{
                  left: asLeftPct(g),
                  borderColor: "var(--muted-foreground)",
                  borderRightWidth: GUIDE_DASH_PX,
                }}
              />
            ))}
          </div>

          {renderRow(0, rows[0]!)}
          {renderRow(1, rows[1]!)}
        </div>

        <div
          className="flex flex-col justify-between"
          style={{ height: STACK_H }}
        >
          <div
            className={[
              "text-sm font-medium tabular-nums flex items-center",
              valueColorClass(rows[0]!.value),
            ].join(" ")}
          >
            {pct4(rows[0]!.value)}
          </div>
          <div
            className={[
              "text-sm font-medium tabular-nums flex items-center",
              valueColorClass(rows[1]!.value),
            ].join(" ")}
          >
            {pct4(rows[1]!.value)}
          </div>
        </div>

        <div />
        <div
          className="relative mt-1"
          style={{ height: LABEL_ROW_H, padding: `0 ${barColumnPadX}px` }}
        >
          {guides.map((g, i) => (
            <div
              key={`lbl-${i}`}
              className="absolute text-[11px] leading-none text-muted-foreground"
              style={{
                left: asLeftPct(g),
                transform: "translateX(-50%)",
                bottom: 0,
              }}
            >
              {Math.round(g * 100)}%
            </div>
          ))}
        </div>
        <div />
      </div>
    </div>
  );
}
