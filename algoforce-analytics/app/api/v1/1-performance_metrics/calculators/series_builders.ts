// app/api/v1/1-performance_metrics/calculators/series_builders.ts
import type { ISODate, DailySlim } from "../performance_metric_types";

export function toISODateUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10) as ISODate;
}

export function dateRangeUTC(startIso: ISODate, endIso: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const d0 = new Date(`${startIso}T00:00:00.000Z`);
  const d1 = new Date(`${endIso}T00:00:00.000Z`);
  for (let d = d0; d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toISODateUTC(d));
  }
  return out;
}

export function buildDailySeries(
  startIso: ISODate,
  endIso: ISODate,
  byDay: Map<string, { gross: number; fees: number; net: number }>,
  upnlToAppendOnEnd: number
): DailySlim[] {
  const days = dateRangeUTC(startIso, endIso);
  const out: DailySlim[] = days.map((d) => {
    const agg = byDay.get(d) ?? { gross: 0, fees: 0, net: 0 };
    return {
      day: d,
      gross_pnl: Number(agg.gross.toFixed(2)),
      fees: Number(agg.fees.toFixed(2)),
      net_pnl: Number(agg.net.toFixed(2)),
    };
  });

  if (out.length) {
    const last = out[out.length - 1]!;
    last.net_pnl = Number((last.net_pnl + (upnlToAppendOnEnd || 0)).toFixed(2));
  }
  return out;
}

export function equityFromDaily(initial: number, daily: DailySlim[]): number[] {
  const eq: number[] = [];
  let bal = initial;
  for (const r of daily) {
    bal += r.net_pnl;
    eq.push(bal);
  }
  return eq;
}

/** Max drawdown magnitude from equity array. */
export function drawdownMagnitude(equity: number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let minDD = 0; // most negative
  for (const v of equity) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < minDD) minDD = dd;
    }
  }
  return Math.abs(minDD);
}

/** Streaks of strictly negative net_pnl days. */
export function losingStreaksFromDaily(daily: DailySlim[]): {
  current: number;
  max: number;
} {
  let cur = 0;
  let max = 0;
  for (const r of daily) {
    if (r.net_pnl < 0) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return { current: cur, max };
}
