// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/SignedBar.tsx
"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";

type Mode = "one-negative" | "two-sided";
type Anchor = "left" | "right";

export interface SignedBarProps {
  mode: Mode;
  /** For `one-negative`: where 0% is anchored. Default "right" (old behavior). */
  anchor?: Anchor;

  /** Magnitude to render (use Math.abs of your negative drawdown). */
  value: number;
  /** Optional faint underlay magnitude (defaults to value). */
  ghostValue?: number;

  /** Max magnitude for scaling. */
  maxAbs: number;

  height?: number;
  minBarPx?: number;

  /** Color used for the negative bar (drawdown). */
  negColor?: string;
  /** Color for positive, only used in "two-sided". */
  posColor?: string;

  /** Thickness of the top (colored) value strip vs track (0..1). */
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
  valueThicknessPct = 0.7,
  className,
  trackClassName,
}: SignedBarProps) {
  const scale = Math.max(1e-12, maxAbs);
  const mag = Math.min(Math.abs(value), scale);
  const ghostMag = Math.min(Math.abs(ghostValue ?? value), scale);

  // Fractions of the track width
  const frac = mag / scale;
  const gFrac = ghostMag / scale;

  const hPx = Math.max(6, height);
  const valueH = Math.max(2, Math.round(hPx * valueThicknessPct));
  const gap = Math.max(0, Math.round((hPx - valueH) / 2));

  const trackStyle: CSSProperties = {
    height: hPx,
    borderRadius: hPx / 2,
  };

  const underlayStyle: CSSProperties =
    mode === "one-negative"
      ? anchor === "left"
        ? { left: 0, width: `${Math.max(gFrac * 100, (minBarPx / Math.max(1, 1)))}%` }
        : { right: 0, width: `${Math.max(gFrac * 100, (minBarPx / Math.max(1, 1)))}%` }
      : {}; // not used here

  const valueStyle: CSSProperties =
    mode === "one-negative"
      ? anchor === "left"
        ? { left: 0, width: `${Math.max(frac * 100, (minBarPx / Math.max(1, 1)))}%` }
        : { right: 0, width: `${Math.max(frac * 100, (minBarPx / Math.max(1, 1)))}%` }
      : {};

  return (
    <div
      className={clsx(
        "relative w-full bg-muted/20 border border-border/70",
        "overflow-hidden",
        trackClassName,
        className
      )}
      style={trackStyle}
      aria-hidden
    >
      {/* faint underlay */}
      <div
        className="absolute top-0 bottom-0"
        style={{
          ...underlayStyle,
          backgroundColor: negColor,
          opacity: 0.25,
        }}
      />
      {/* colored value strip (centered vertically) */}
      <div
        className="absolute"
        style={{
          ...valueStyle,
          height: valueH,
          top: gap,
          backgroundColor: negColor,
          borderRadius: valueH / 2,
        }}
      />
    </div>
  );
}
