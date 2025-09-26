// app/api/v1/1-performance_metrics/calculators/z_math_helpers.ts
import { readBaselineUsd } from "@/lib/baseline";
import { DailyReturnDollars, DailyRow, DrawdownBlock, DrawdownPeriod, EquityPoint, MetricConfig, MetricsPayload, RolledRow, Streaks } from "../metrics/types";
import { earliestLocalDateForAccount, fetchDailyRows, fetchMTD, fetchTradeCount, findEarliestLocalDateForAccounts, findLatestLocalDateForAccounts, latestLocalDateForAccount, fetchWinRates } from "./z_sql_fetch_modify";
import { addDaysISODate, diffDaysInclusive, fmtISO, localTodayISO, resolveAsOf, startOfMonthISO } from "./z_time_tz";
import { consecutiveLosingDays } from "./consecutive_losing_days";
import { readAccounts } from "@/lib/jsonStore";

function rollBalances(daily: DailyRow[], initial: number): RolledRow[] {
  let cur = initial;
  return (daily ?? []).map((r) => {
    const start_balance = cur;
    cur += r.net_pnl;
    const end_balance = cur;
    const daily_return_pct =
      start_balance !== 0 ? (r.net_pnl / start_balance) * 100 : null;
    return { ...r, start_balance, end_balance, daily_return_pct };
  });
}

function equitySeries(rows: RolledRow[]): EquityPoint[] {
  return rows.map((r) => ({ day: r.day, equity: r.end_balance }));
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

/* ========================== main per-account ========================== */
export async function computeAccountMetrics(
  accountKey: string,
  cfg: MetricConfig
): Promise<MetricsPayload> {
  const tz = cfg.tz || "Asia/Manila";

  // Resolve desired start/end (date-range takes precedence over legacy)
  let startISO = cfg.startDate;
  let endISO = cfg.endDate;

  if (!startISO || !endISO) {
    if (cfg.earliest && !startISO) {
      startISO =
        (await earliestLocalDateForAccount(accountKey, tz)) ??
        localTodayISO(tz);
    }
    if (!endISO) endISO = localTodayISO(tz);

    if (!startISO && cfg.lastNDays && cfg.runDate) {
      const asOf = resolveAsOf(cfg.runDate, tz);
      endISO = fmtISO(asOf);
      startISO = addDaysISODate(endISO, -(cfg.lastNDays - 1));
    } else if (!startISO && !endISO) {
      endISO = localTodayISO(tz);
      startISO = endISO;
    }
  }

  // Normalize order
  if (startISO! > endISO) [startISO, endISO] = [endISO, startISO];

  // Clamp end to latest available local day for this account (handles “2026” future)
  const latestForAcc = await latestLocalDateForAccount(accountKey, tz);
  if (latestForAcc && endISO! > latestForAcc) endISO = latestForAcc;
  // Also ensure start <= end after clamping
  if (startISO! > endISO!) startISO = endISO;

  // Fetch using [start, end+1)
  const endExclusive = addDaysISODate(endISO!, +1);
  const initial_balance = readBaselineUsd(accountKey);

  // Window
  const dailyWindow = await fetchDailyRows(
    accountKey,
    tz,
    startISO!,
    endExclusive
  );
  const rolled = rollBalances(dailyWindow, initial_balance);
  const daily_return_dollars: DailyReturnDollars[] = rolled.map((r) => ({
    day: r.day,
    daily_profit_loss_usd: Number(r.net_pnl.toFixed(8)),
  }));

  // MTD relative to endISO's month
  const endAsDate = new Date(`${endISO}T00:00:00`);
  const monthStartLocalISO = startOfMonthISO(endAsDate);
  const nextMonthStartLocalISO = startOfMonthISO(
    new Date(endAsDate.getFullYear(), endAsDate.getMonth() + 1, 1)
  );
  const { mtd_net_pnl, mtd_fees } = await fetchMTD(
    accountKey,
    tz,
    monthStartLocalISO,
    nextMonthStartLocalISO
  );
  const mtdDaily = await fetchDailyRows(
    accountKey,
    tz,
    monthStartLocalISO,
    endExclusive
  );
  const mtdRolled = rollBalances(mtdDaily, initial_balance);
  const mtd_return_pct =
    mtdRolled.length > 0
      ? (mtdRolled[mtdRolled.length - 1].end_balance /
          mtdRolled[0].start_balance -
          1) *
        100
      : null;

  // Drawdowns
  const eqAll = equitySeries(
    rollBalances(
      await fetchDailyRows(accountKey, tz, "1970-01-01", endExclusive),
      initial_balance
    )
  );
  const { block: ddAll, period: ddPeriod } = drawdownStats(eqAll);
  const { block: ddMtd } = drawdownStats(equitySeries(mtdRolled));

  // Win rates
  const wrAll = await fetchWinRates(accountKey);
  const start30ISO = addDaysISODate(endISO!, -29);
  const last30 = await fetchDailyRows(accountKey, tz, start30ISO, endExclusive);
  const posDays = last30.filter((d) => d.net_pnl > 0).length;
  const wr30 = last30.length ? (100 * posDays) / last30.length : null;

  const tradesCount = await fetchTradeCount(accountKey);
  const streaks = consecutiveLosingDays(
    mtdDaily.length ? mtdDaily : dailyWindow,
    4
  );

  let total_return_pct_over_window: number | null = null;
  if (rolled.length) {
    const a = rolled[0].start_balance;
    const b = rolled[rolled.length - 1].end_balance;
    total_return_pct_over_window = a !== 0 ? (b / a - 1) * 100 : null;
  }

  const last_n_days = diffDaysInclusive(startISO!, endISO!);
  const runDateUsed = endISO;

  return {
    config: { initial_balance, run_date: runDateUsed || "", last_n_days },
    daily_return_last_n_days: {
      window_start: startISO || "",
      window_end: endISO || "",
      daily_rows: rolled.map((r) => ({
        ...r,
        gross_pnl: Number(r.gross_pnl.toFixed(8)),
        fees: Number(r.fees.toFixed(8)),
        net_pnl: Number(r.net_pnl.toFixed(8)),
        start_balance: Number(r.start_balance.toFixed(8)),
        end_balance: Number(r.end_balance.toFixed(8)),
        daily_return_pct:
          r.daily_return_pct == null
            ? null
            : Number(r.daily_return_pct.toFixed(8)),
      })),
      total_return_pct_over_window:
        total_return_pct_over_window == null
          ? null
          : Number(total_return_pct_over_window.toFixed(8)),
    },
    month_to_date: {
      mtd_return_pct:
        mtd_return_pct == null ? null : Number(mtd_return_pct.toFixed(8)),
      mtd_return_usd: Number(mtd_net_pnl.toFixed(8)),
      mtd_total_fees_usd: Number(mtd_fees.toFixed(8)),
      mtd_drawdown_pct: ddMtd.current_drawdown_pct,
    },
    drawdowns: ddAll,
    drawdown_period: ddPeriod,
    win_rates: {
      rolling_30d_win_rate_pct: wr30 == null ? null : Number(wr30.toFixed(8)),
      win_rate_from_run_start_pct: wrAll.win_rate_from_run_start_pct,
    },
    counts: { number_of_trades_total: tradesCount },
    streaks,
    daily_return_dollars,
    mtd_return_dollars: Number(mtd_net_pnl.toFixed(8)),
    mtd_total_fees_dollars: Number(mtd_fees.toFixed(8)),
    initial_balance,
  };
}

export async function computeOverallMetrics(
  cfg: MetricConfig
): Promise<MetricsPayload> {
  const accounts = (await readAccounts())
    .filter((a) => a.monitored)
    .map((a) => a.redisName);
  return computeMergedMetricsForAccounts(accounts, cfg);
}

export async function computeMergedMetricsForAccounts(
  accounts: string[],
  cfg: MetricConfig
): Promise<MetricsPayload> {
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
  const commonEnd = requestedEnd > scopeLatest ? scopeLatest : requestedEnd;

  // Ensure order
  let finalStart = commonStart ?? localTodayISO(tz);
  if (finalStart > commonEnd) finalStart = commonEnd;

  const per = await Promise.all(
    accounts.map((a) =>
      computeAccountMetrics(a, {
        ...cfg,
        startDate: finalStart,
        endDate: commonEnd,
        earliest: false,
      })
    )
  );

  // Aggregate daily rows by day label
  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  for (const acc of per) {
    for (const r of acc.daily_return_last_n_days.daily_rows) {
      const slot = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
      slot.gross += r.gross_pnl;
      slot.fees += r.fees;
      slot.net += r.net_pnl;
      byDay.set(r.day, slot);
    }
  }
  const days = [...byDay.keys()].sort();
  const daily: DailyRow[] = days.map((d) => {
    const v = byDay.get(d)!;
    return { day: d, gross_pnl: v.gross, fees: v.fees, net_pnl: v.net };
  });

  const initial_balance = accounts.reduce((s, a) => s + readBaselineUsd(a), 0);
  const rolled = rollBalances(daily, initial_balance);
  const daily_return_dollars: DailyReturnDollars[] = rolled.map((r) => ({
    day: r.day,
    daily_profit_loss_usd: Number(r.net_pnl.toFixed(8)),
  }));

  const mtd_return_usd = per.reduce(
    (s, a) => s + a.month_to_date.mtd_return_usd,
    0
  );
  const mtd_total_fees_usd = per.reduce(
    (s, a) => s + a.month_to_date.mtd_total_fees_usd,
    0
  );
  const mtd_return_pct =
    initial_balance !== 0
      ? ((initial_balance + mtd_return_usd) / initial_balance - 1) * 100
      : null;

  const { block: ddAll, period: ddPeriod } = drawdownStats(
    equitySeries(rolled)
  );

  const totalTrades = per.reduce(
    (s, a) => s + a.counts.number_of_trades_total,
    0
  );
  const wrAllWeighted = totalTrades
    ? per.reduce(
        (s, a) =>
          s +
          (a.win_rates.win_rate_from_run_start_pct ?? 0) *
            a.counts.number_of_trades_total,
        0
      ) / totalTrades
    : null;
  const wr30Weighted = totalTrades
    ? per.reduce(
        (s, a) =>
          s +
          (a.win_rates.rolling_30d_win_rate_pct ?? 0) *
            a.counts.number_of_trades_total,
        0
      ) / totalTrades
    : null;

  let total_return_pct_over_window: number | null = null;
  if (rolled.length) {
    const a = rolled[0].start_balance;
    const b = rolled[rolled.length - 1].end_balance;
    total_return_pct_over_window = a !== 0 ? (b / a - 1) * 100 : null;
  }

  const last_n_days = diffDaysInclusive(finalStart, commonEnd);

  return {
    config: { initial_balance, run_date: commonEnd, last_n_days },
    daily_return_last_n_days: {
      window_start: finalStart,
      window_end: commonEnd,
      daily_rows: rolled.map((r) => ({
        ...r,
        gross_pnl: Number(r.gross_pnl.toFixed(8)),
        fees: Number(r.fees.toFixed(8)),
        net_pnl: Number(r.net_pnl.toFixed(8)),
        start_balance: Number(r.start_balance.toFixed(8)),
        end_balance: Number(r.end_balance.toFixed(8)),
        daily_return_pct:
          r.daily_return_pct == null
            ? null
            : Number(r.daily_return_pct.toFixed(8)),
      })),
      total_return_pct_over_window:
        total_return_pct_over_window == null
          ? null
          : Number(total_return_pct_over_window.toFixed(8)),
    },
    month_to_date: {
      mtd_return_pct:
        mtd_return_pct == null ? null : Number(mtd_return_pct.toFixed(8)),
      mtd_return_usd: Number(mtd_return_usd.toFixed(8)),
      mtd_total_fees_usd: Number(mtd_total_fees_usd.toFixed(8)),
      mtd_drawdown_pct: ddAll.current_drawdown_pct,
    },
    drawdowns: ddAll,
    drawdown_period: ddPeriod,
    win_rates: {
      rolling_30d_win_rate_pct:
        wr30Weighted == null ? null : Number(wr30Weighted.toFixed(8)),
      win_rate_from_run_start_pct:
        wrAllWeighted == null ? null : Number(wrAllWeighted.toFixed(8)),
    },
    counts: { number_of_trades_total: totalTrades },
    streaks: consecutiveLosingDays(daily, 4),
    daily_return_dollars,
    mtd_return_dollars: Number(mtd_return_usd.toFixed(8)),
    mtd_total_fees_dollars: Number(mtd_total_fees_usd.toFixed(8)),
    initial_balance
  };
}

/** Convenience for /api/metrics: returns { selected, merged, per_account } with a unified window */
export async function computeSelectedMetrics(
  selected: string[],
  cfg: MetricConfig
): Promise<{
  selected: string[];
  merged: MetricsPayload;
  per_account: Record<string, MetricsPayload>;
}> {
  const merged = await computeMergedMetricsForAccounts(selected, cfg);
  const start = merged.daily_return_last_n_days.window_start;
  const end = merged.daily_return_last_n_days.window_end;

  const perEntries = await Promise.all(
    selected.map(
      async (k) =>
        [
          k,
          await computeAccountMetrics(k, {
            ...cfg,
            startDate: start,
            endDate: end,
            earliest: false,
          }),
        ] as const
    )
  );
  const per_account: Record<string, MetricsPayload> =
    Object.fromEntries(perEntries);
  return { selected, merged, per_account };
}