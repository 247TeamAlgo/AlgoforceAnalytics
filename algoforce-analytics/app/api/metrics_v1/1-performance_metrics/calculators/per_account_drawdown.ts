import { readBaselineUsd } from "@/lib/baseline";
import type {
  MetricConfig,
  DrawdownBlock,
  DrawdownPeriod,
  EquityPoint,
  DailyRow,
  ISODate,
} from "../metrics/types";
import {
  fetchDailyRows,
  findEarliestLocalDateForAccounts,
  findLatestLocalDateForAccounts,
} from "./z_sql_fetch_modify";
import { addDaysISODate, localTodayISO } from "./z_time_tz";
import { getTableName } from "./accounts_json";

/** Derive equity series from daily net PnL, starting from an initial balance. */
function equityFromDaily(daily: DailyRow[], initial: number): EquityPoint[] {
  let cur = initial;
  return (daily ?? []).map((r) => {
    cur = cur + r.net_pnl;
    return { day: r.day, equity: cur };
  });
}

function drawdownStats(eq: EquityPoint[]): {
  block: DrawdownBlock;
  period: DrawdownPeriod;
} {
  if (!eq.length) {
    return {
      block: {
        max_drawdown_pct: null,
        max_drawdown_peak_day: null,
        current_drawdown_pct: null,
        current_drawdown_days: 0,
      },
      period: { peak_day: null, trough_day: null, recovery_day: null },
    };
  }

  let peak = eq[0].equity;
  let peakDay = eq[0].day;
  let maxDD = 0;
  let troughDay = eq[0].day;

  const ddSeries = eq.map((p) => {
    if (p.equity > peak) {
      peak = p.equity;
      peakDay = p.day;
    }
    const dd = peak !== 0 ? ((p.equity - peak) / peak) * 100 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      troughDay = p.day;
    }
    return { ...p, dd };
  });

  const current = ddSeries[ddSeries.length - 1];
  let currentDays = 0;
  for (let i = ddSeries.length - 1; i >= 0; i--) {
    if (ddSeries[i].dd < 0) currentDays++;
    else break;
  }

  let recoveryDay: string | null = null;
  const idxPeak = eq.findIndex((e) => e.day === peakDay);
  const peakVal = eq[idxPeak]?.equity ?? 0;
  for (let i = idxPeak + 1; i < eq.length; i++) {
    if (eq[i].equity >= peakVal) {
      recoveryDay = eq[i].day;
      break;
    }
  }

  return {
    block: {
      max_drawdown_pct: Number(maxDD.toFixed(6)),
      max_drawdown_peak_day: peakDay,
      current_drawdown_pct: Number(current.dd.toFixed(6)),
      current_drawdown_days: currentDays,
    },
    period: {
      peak_day: peakDay,
      trough_day: troughDay,
      recovery_day: recoveryDay,
    },
  };
}

export type DDBarsRow = {
  account: string;
  /** Decimal magnitude, e.g. 0.1088 for -10.88% */
  dd_mag: number;
  /** Negative percent, e.g. -10.88 */
  max_drawdown_pct: number | null;
  peak_day: ISODate | null;
  trough_day: ISODate | null;
};

export type DDBarsResponse = {
  window_start: ISODate;
  window_end: ISODate;
  per_account: DDBarsRow[];
  combined: DDBarsRow;
};

export async function computePerAccountAndCombinedMinDD(
  accounts: string[],
  cfg: MetricConfig
): Promise<DDBarsResponse> {
  const tz = cfg.tz || "Asia/Manila";

  // Resolve a single common start if earliest=true and no explicit startDate
  const commonStart =
    cfg.earliest && !cfg.startDate
      ? ((await findEarliestLocalDateForAccounts(accounts, tz)) ??
        localTodayISO(tz))
      : cfg.startDate;

  // Clamp end to the latest available across accounts
  const requestedEnd = cfg.endDate ?? localTodayISO(tz);
  const scopeLatest =
    (await findLatestLocalDateForAccounts(accounts, tz)) ?? requestedEnd;
  const endISO = requestedEnd > scopeLatest ? scopeLatest : requestedEnd;
  let startISO = commonStart ?? localTodayISO(tz);
  if (startISO > endISO) startISO = endISO;

  const endExclusive = addDaysISODate(endISO, +1);

  // Per-account rows and combined aggregation
  const per_account: DDBarsRow[] = [];
  const byDay = new Map<string, number>();
  let combinedInitial = 0;

  for (const acc of accounts) {
    const tableKey = await getTableName(acc); // map redisName -> MySQL table
    const daily = await fetchDailyRows(tableKey, tz, startISO, endExclusive);
    const initial = Number(readBaselineUsd(acc)) || 0;
    combinedInitial += initial;

    // aggregate for combined
    for (const r of daily) {
      byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.net_pnl);
    }

    // per-account DD
    const eq = equityFromDaily(daily, initial);
    const { block, period } = drawdownStats(eq);
    const dd_mag =
      block.max_drawdown_pct == null
        ? 0
        : Math.abs(block.max_drawdown_pct) / 100;

    per_account.push({
      account: acc,
      dd_mag,
      max_drawdown_pct: block.max_drawdown_pct,
      peak_day: period.peak_day,
      trough_day: period.trough_day,
    });
  }

  // Combined DD from summed net PnL
  const days = [...byDay.keys()].sort();
  let equity = combinedInitial;
  let peak = equity;
  let maxDD = 0;
  let peakDay: string | null = days[0] ?? null;
  let troughDay: string | null = peakDay;

  for (const d of days) {
    equity += byDay.get(d) ?? 0;
    if (equity > peak) {
      peak = equity;
      peakDay = d;
    }
    const dd = peak !== 0 ? ((equity - peak) / peak) * 100 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      troughDay = d;
    }
  }

  const combined: DDBarsRow = {
    account: "all",
    dd_mag: Math.abs(maxDD) / 100,
    max_drawdown_pct: Number(maxDD.toFixed(6)),
    peak_day: peakDay,
    trough_day: troughDay,
  };

  return {
    window_start: startISO,
    window_end: endISO,
    per_account,
    combined,
  };
}
