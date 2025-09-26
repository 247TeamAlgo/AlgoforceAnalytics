// src/lib/metrics_v2.ts
import { readAccounts } from "@/lib/jsonStore";
import { readBaselineUsd } from "@/lib/baseline";
import type {
    MetricConfig, DailyRow, RolledRow, EquityPoint, DrawdownBlock, DrawdownPeriod,
    MetricsPayload, DailyReturnDollars, Streaks
} from "./types";
import { loadClosedTrades, localDayISO } from "./redis_metrics";

/* ───────── fixed window config ───────── */
const DEFAULT_TZ = "Asia/Manila";
const DEFAULT_LAST_N_DAYS = 7; // flip to 10 if you want

/* ───────── tiny time helpers ───────── */
function addDaysISODate(iso: string, n: number): string {
    return new Date(new Date(`${iso}T00:00:00`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
function todayISO(tz: string): string { return localDayISO(new Date(), tz); }
function diffDaysInclusive(aISO: string, bISO: string): number {
    const a = new Date(`${aISO}T00:00:00Z`).getTime();
    const b = new Date(`${bISO}T00:00:00Z`).getTime();
    return Math.abs(Math.round((b - a) / 86_400_000)) + 1;
}

/* ───────── math helpers ───────── */
function rollBalances(daily: DailyRow[], initial: number): RolledRow[] {
    let cur = initial;
    return (daily ?? []).sort((a, b) => a.day.localeCompare(b.day)).map(r => {
        const start_balance = cur;
        cur += r.net_pnl;
        const end_balance = cur;
        const daily_return_pct = start_balance !== 0 ? (r.net_pnl / start_balance) * 100 : null;
        return { ...r, start_balance, end_balance, daily_return_pct };
    });
}

function equitySeries(rows: RolledRow[]): EquityPoint[] {
    return rows.map(r => ({ day: r.day, equity: r.end_balance }));
}

function drawdownStats(eq: EquityPoint[]): { block: DrawdownBlock; period: DrawdownPeriod } {
    if (!eq.length) {
        return {
            block: { max_drawdown_pct: null, max_drawdown_peak_day: null, current_drawdown_pct: null, current_drawdown_days: 0 },
            period: { peak_day: null, trough_day: null, recovery_day: null },
        };
    }
    let peak = eq[0].equity;
    let peakDay = eq[0].day;
    let maxDD = 0;
    let troughDay = eq[0].day;

    const ddSeries = eq.map(p => {
        if (p.equity > peak) { peak = p.equity; peakDay = p.day; }
        const dd = peak !== 0 ? ((p.equity - peak) / peak) * 100 : 0;
        if (dd < maxDD) { maxDD = dd; troughDay = p.day; }
        return { ...p, dd };
    });

    const current = ddSeries[ddSeries.length - 1];
    let currentDays = 0;
    for (let i = ddSeries.length - 1; i >= 0; i--) {
        if (ddSeries[i].dd < 0) currentDays++; else break;
    }

    let recoveryDay: string | null = null;
    const idxPeak = eq.findIndex(e => e.day === peakDay);
    const peakVal = eq[idxPeak]?.equity ?? 0;
    for (let i = idxPeak + 1; i < eq.length; i++) {
        if (eq[i].equity >= peakVal) { recoveryDay = eq[i].day; break; }
    }

    return {
        block: {
            max_drawdown_pct: Number(maxDD.toFixed(6)),
            max_drawdown_peak_day: peakDay,
            current_drawdown_pct: Number(current.dd.toFixed(6)),
            current_drawdown_days: currentDays,
        },
        period: { peak_day: peakDay, trough_day: troughDay, recovery_day: recoveryDay },
    };
}

function consecutiveLosingDays(daily: DailyRow[], threshold = 4): Streaks {
    let maxStreak = 0;
    let cur = 0;
    for (const r of daily ?? []) {
        if (r.net_pnl < 0) { cur++; if (cur > maxStreak) maxStreak = cur; }
        else cur = 0;
    }
    let currentStreak = 0;
    for (let i = (daily?.length ?? 0) - 1; i >= 0; i--) {
        if (daily![i].net_pnl < 0) currentStreak++;
        else break;
    }
    return {
        consecutive_losing_days: {
            max_streak: maxStreak,
            meets_threshold: maxStreak >= threshold,
            current_streak: currentStreak,
        },
    };
}

/* ───────── Redis daily rows from tradesheet (report math) ───────── */
function tradePnl(t: {
    qty_0?: number | string; exit_price_0?: number | string; entry_price_0?: number | string;
    qty_1?: number | string; exit_price_1?: number | string; entry_price_1?: number | string;
}): number {
    const q0 = Number(t.qty_0 ?? 0), e0 = Number(t.exit_price_0 ?? 0), a0 = Number(t.entry_price_0 ?? 0);
    const q1 = Number(t.qty_1 ?? 0), e1 = Number(t.exit_price_1 ?? 0), a1 = Number(t.entry_price_1 ?? 0);
    return (q0 * (e0 - a0)) + (q1 * (e1 - a1));
}

async function fetchDailyRowsFromRedis(
    accountKey: string,
    tz: string,
    startISO: string,
    endExclusiveISO: string
): Promise<DailyRow[]> {
    const closed = await loadClosedTrades(accountKey);
    const m = new Map<string, DailyRow>();
    for (const t of closed) {
        const day = localDayISO(new Date(Date.parse(t.exit_dt)), tz);
        if (day < startISO || day >= endExclusiveISO) continue;
        const pnl = tradePnl(t);
        const prev = m.get(day) ?? { day, gross_pnl: 0, fees: 0, net_pnl: 0 };
        prev.gross_pnl += pnl;
        prev.net_pnl += pnl; // fees unavailable in Redis → 0
        m.set(day, prev);
    }
    return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/* ───────── Win rates & trade count ───────── */
async function fetchWinRatesAndCount(
    accountKey: string,
    tz: string,
    endISO: string
): Promise<{ wr30: number | null; wrAll: number | null; totalTrades: number; }> {
    const trades = await loadClosedTrades(accountKey);
    const closed = trades
        .map(t => {
            const exit = localDayISO(new Date(Date.parse(t.exit_dt)), tz);
            return { exit, pnl: tradePnl(t) };
        })
        .sort((a, b) => a.exit.localeCompare(b.exit));
    const totalTrades = closed.length;
    const winsAll = closed.reduce((s, x) => s + (x.pnl > 0 ? 1 : 0), 0);
    const wrAll = totalTrades ? (100 * winsAll) / totalTrades : null;

    const start30 = addDaysISODate(endISO, -29);
    const last30 = closed.filter(x => x.exit >= start30 && x.exit <= endISO);
    const wins30 = last30.reduce((s, x) => s + (x.pnl > 0 ? 1 : 0), 0);
    const wr30 = last30.length ? (100 * wins30) / last30.length : null;

    return {
        wr30: wr30 == null ? null : Number(wr30.toFixed(8)),
        wrAll: wrAll == null ? null : Number(wrAll.toFixed(8)),
        totalTrades
    };
}

/* ───────── public API ───────── */

export async function computeAccountMetricsV2(
    accountKey: string,
    cfg?: Partial<MetricConfig>
): Promise<MetricsPayload> {
    const tz = cfg?.tz || DEFAULT_TZ;
    const endISO = todayISO(tz);
    const lastNDays = cfg?.lastNDays ?? DEFAULT_LAST_N_DAYS;
    const startISO = addDaysISODate(endISO, -(lastNDays - 1));
    const endExclusive = addDaysISODate(endISO, +1);
    const initial_balance = readBaselineUsd(accountKey);

    const dailyWindow = await fetchDailyRowsFromRedis(accountKey, tz, startISO, endExclusive);
    const rolled = rollBalances(dailyWindow, initial_balance);
    const daily_return_dollars: DailyReturnDollars[] = rolled.map(r => ({
        day: r.day,
        daily_profit_loss_usd: Number(r.net_pnl.toFixed(8)),
    }));

    // MTD
    const monthStartLocalISO = endISO.slice(0, 7) + "-01";
    const mtdDaily = await fetchDailyRowsFromRedis(accountKey, tz, monthStartLocalISO, endExclusive);
    const mtdRolled = rollBalances(mtdDaily, initial_balance);
    const mtd_return_usd = mtdDaily.reduce((s, r) => s + r.net_pnl, 0);
    const mtd_total_fees_usd = 0;
    const mtd_return_pct =
        mtdRolled.length > 0
            ? ((mtdRolled[mtdRolled.length - 1].end_balance / mtdRolled[0].start_balance) - 1) * 100
            : null;

    // Drawdowns
    const eqAll = equitySeries(rolled);
    const { block: ddAll, period: ddPeriod } = drawdownStats(eqAll);
    const { block: ddMtd } = drawdownStats(equitySeries(mtdRolled));

    // Win rates + count
    const { wr30, wrAll, totalTrades } = await fetchWinRatesAndCount(accountKey, tz, endISO);

    let total_return_pct_over_window: number | null = null;
    if (rolled.length) {
        const a = rolled[0].start_balance;
        const b = rolled[rolled.length - 1].end_balance;
        total_return_pct_over_window = a !== 0 ? ((b / a) - 1) * 100 : null;
    }

    const last_n_days = diffDaysInclusive(startISO, endISO);

    return {
        config: { initial_balance, run_date: endISO, last_n_days },
        daily_return_last_n_days: {
            window_start: startISO,
            window_end: endISO,
            daily_rows: rolled.map(r => ({
                ...r,
                gross_pnl: Number(r.gross_pnl.toFixed(8)),
                fees: Number(r.fees.toFixed(8)),
                net_pnl: Number(r.net_pnl.toFixed(8)),
                start_balance: Number(r.start_balance.toFixed(8)),
                end_balance: Number(r.end_balance.toFixed(8)),
                daily_return_pct: r.daily_return_pct == null ? null : Number(r.daily_return_pct.toFixed(8)),
            })),
            total_return_pct_over_window:
                total_return_pct_over_window == null ? null : Number(total_return_pct_over_window.toFixed(8)),
        },
        month_to_date: {
            mtd_return_pct: mtd_return_pct == null ? null : Number(mtd_return_pct.toFixed(8)),
            mtd_return_usd: Number(mtd_return_usd.toFixed(8)),
            mtd_total_fees_usd: Number(mtd_total_fees_usd.toFixed(8)),
            mtd_drawdown_pct: ddMtd.current_drawdown_pct,
        },
        drawdowns: ddAll,
        drawdown_period: ddPeriod,
        win_rates: {
            rolling_30d_win_rate_pct: wr30,
            win_rate_from_run_start_pct: wrAll,
        },
        counts: { number_of_trades_total: totalTrades },
        streaks: consecutiveLosingDays(mtdDaily.length ? mtdDaily : dailyWindow, 4),
        daily_return_dollars: daily_return_dollars,
        mtd_return_dollars: Number(mtd_return_usd.toFixed(8)),
        mtd_total_fees_dollars: Number(mtd_total_fees_usd.toFixed(8)),
        initial_balance,
    };
}

export async function computeMergedMetricsForAccountsV2(
    accounts: string[],
    cfg?: Partial<MetricConfig>
): Promise<MetricsPayload> {
    const tz = cfg?.tz || DEFAULT_TZ;
    const per = await Promise.all(accounts.map(a => computeAccountMetricsV2(a, { tz, lastNDays: cfg?.lastNDays })));

    // combine daily rows by day
    const byDay = new Map<string, { gross: number; fees: number; net: number }>();
    for (const acc of per) {
        for (const r of acc.daily_return_last_n_days.daily_rows) {
            const slot = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
            slot.gross += r.gross_pnl; slot.fees += r.fees; slot.net += r.net_pnl;
            byDay.set(r.day, slot);
        }
    }
    const days = [...byDay.keys()].sort();
    const daily: DailyRow[] = days.map(d => {
        const v = byDay.get(d)!;
        return { day: d, gross_pnl: v.gross, fees: v.fees, net_pnl: v.net };
    });

    const initial_balance = per.reduce((s, a) => s + a.initial_balance, 0);
    const rolled = rollBalances(daily, initial_balance);
    const daily_return_dollars: DailyReturnDollars[] = rolled.map(r => ({
        day: r.day,
        daily_profit_loss_usd: Number(r.net_pnl.toFixed(8)),
    }));

    const mtd_return_usd = per.reduce((s, a) => s + a.month_to_date.mtd_return_usd, 0);
    const mtd_total_fees_usd = per.reduce((s, a) => s + a.month_to_date.mtd_total_fees_usd, 0);
    const mtd_return_pct = initial_balance !== 0
        ? (((initial_balance + mtd_return_usd) / initial_balance) - 1) * 100
        : null;

    const { block: ddAll, period: ddPeriod } = drawdownStats(equitySeries(rolled));

    const totalTrades = per.reduce((s, a) => s + a.counts.number_of_trades_total, 0);
    const wrAllWeighted = totalTrades
        ? per.reduce((s, a) => s + (a.win_rates.win_rate_from_run_start_pct ?? 0) * a.counts.number_of_trades_total, 0) / totalTrades
        : null;
    const wr30Weighted = totalTrades
        ? per.reduce((s, a) => s + (a.win_rates.rolling_30d_win_rate_pct ?? 0) * a.counts.number_of_trades_total, 0) / totalTrades
        : null;

    const start = per[0]?.daily_return_last_n_days.window_start ?? todayISO(tz);
    const end = per[0]?.daily_return_last_n_days.window_end ?? todayISO(tz);
    let total_return_pct_over_window: number | null = null;
    if (rolled.length) {
        const a = rolled[0].start_balance;
        const b = rolled[rolled.length - 1].end_balance;
        total_return_pct_over_window = a !== 0 ? ((b / a) - 1) * 100 : null;
    }
    const last_n_days = diffDaysInclusive(start, end);

    return {
        config: { initial_balance, run_date: end, last_n_days },
        daily_return_last_n_days: {
            window_start: start,
            window_end: end,
            daily_rows: rolled.map(r => ({
                ...r,
                gross_pnl: Number(r.gross_pnl.toFixed(8)),
                fees: Number(r.fees.toFixed(8)),
                net_pnl: Number(r.net_pnl.toFixed(8)),
                start_balance: Number(r.start_balance.toFixed(8)),
                end_balance: Number(r.end_balance.toFixed(8)),
                daily_return_pct: r.daily_return_pct == null ? null : Number(r.daily_return_pct.toFixed(8)),
            })),
            total_return_pct_over_window:
                total_return_pct_over_window == null ? null : Number(total_return_pct_over_window.toFixed(8)),
        },
        month_to_date: {
            mtd_return_pct: mtd_return_pct == null ? null : Number(mtd_return_pct.toFixed(8)),
            mtd_return_usd: Number(mtd_return_usd.toFixed(8)),
            mtd_total_fees_usd: Number(mtd_total_fees_usd.toFixed(8)),
            mtd_drawdown_pct: ddAll.current_drawdown_pct,
        },
        drawdowns: ddAll,
        drawdown_period: ddPeriod,
        win_rates: {
            rolling_30d_win_rate_pct: wr30Weighted == null ? null : Number(wr30Weighted.toFixed(8)),
            win_rate_from_run_start_pct: wrAllWeighted == null ? null : Number(wrAllWeighted.toFixed(8)),
        },
        counts: { number_of_trades_total: totalTrades },
        streaks: ((): Streaks => {
            // use merged daily rows for streaks
            let max = 0, cur = 0;
            for (const r of daily) { if (r.net_pnl < 0) { cur++; max = Math.max(max, cur); } else cur = 0; }
            let curEnd = 0;
            for (let i = daily.length - 1; i >= 0; i--) { if (daily[i].net_pnl < 0) curEnd++; else break; }
            return {
                consecutive_losing_days: { max_streak: max, current_streak: curEnd, meets_threshold: max >= 4 },
            };
        })(),
        daily_return_dollars,
        mtd_return_dollars: Number(mtd_return_usd.toFixed(8)),
        mtd_total_fees_dollars: Number(mtd_total_fees_usd.toFixed(8)),
        initial_balance,
    };
}

export async function computeSelectedMetricsV2(
    selected: string[],
    cfg?: Partial<MetricConfig>
): Promise<{ selected: string[]; merged: MetricsPayload; per_account: Record<string, MetricsPayload> }> {
    const merged = await computeMergedMetricsForAccountsV2(selected, cfg);
    const perEntries = await Promise.all(
        selected.map(async (k) => [k, await computeAccountMetricsV2(k, cfg)] as const)
    );
    const per_account: Record<string, MetricsPayload> = Object.fromEntries(perEntries);
    return { selected, merged, per_account };
}
