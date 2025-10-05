// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/SignedBar.tsx
"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";

type Mode = "one-negative" | "two-sided";
type Anchor = "left" | "right";

export interface SignedBarProps {
  mode: Mode;
  anchor?: Anchor;
  value: number;
  ghostValue?: number;
  maxAbs: number;
  height?: number;
  minBarPx?: number;
  negColor?: string;
  posColor?: string;
  /** 1 = full-height fill (no vertical padding). */
  valueThicknessPct?: number;
  className?: string;
  trackClassName?: string;
}

export default function SignedBar({
  mode,
  anchor = "right",
  value,
  ghostValue,
  maxAbs,
  height = 18,
  minBarPx = 2,
  negColor = "#8A5CF6",
  posColor = "#39A0ED",
  valueThicknessPct = 1, // full height by default
  className,
  trackClassName,
}: SignedBarProps) {
  const scale = Math.max(1e-12, maxAbs);
  const mag = Math.min(Math.abs(value), scale);
  const ghostMag = Math.min(Math.abs(ghostValue ?? value), scale);

  const frac = mag / scale;
  const gFrac = ghostMag / scale;

  const hPx = Math.max(6, height);
  const valueH = Math.max(2, Math.round(hPx * valueThicknessPct));
  const gap = Math.max(0, Math.round((hPx - valueH) / 2));

  const trackStyle: CSSProperties = {
    height: hPx,
    borderRadius: 2,
  };

  const widthPct = (f: number): string => `${Math.max(f * 100, minBarPx)}%`;

  const underlayStyle: CSSProperties =
    mode === "one-negative"
      ? anchor === "left"
        ? { left: 0, width: widthPct(gFrac) }
        : { right: 0, width: widthPct(gFrac) }
      : {};

  const valueStyle: CSSProperties =
    mode === "one-negative"
      ? anchor === "left"
        ? { left: 0, width: widthPct(frac) }
        : { right: 0, width: widthPct(frac) }
      : {};

  return (
    <div
      className={clsx(
        "relative w-full overflow-hidden rounded-[2px] bg-transparent border-0",
        trackClassName,
        className
      )}
      style={trackStyle}
      aria-hidden
    >
      <div
        className="absolute top-0 bottom-0"
        style={{ ...underlayStyle, backgroundColor: negColor, opacity: 0.25 }}
      />
      <div
        className="absolute rounded-[2px]"
        style={{
          ...valueStyle,
          height: valueH,
          top: gap,
          backgroundColor: negColor,
          borderRadius: 2,
        }}
      />
    </div>
  );
}
