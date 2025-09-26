import type {
  MetricsPayload,
  MultiSelectionResponse,
  MultiMetricsResponse,
  HistoricalBucket,
  HistoricalSummary,
  ISODate,
} from "../lib/types";

type DateRange = { start?: string; end?: string };

function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}
function daysBetween(startIso: string, endIso: string): ISODate[] {
  const out: ISODate[] = [];
  const d0 = new Date(`${startIso}T00:00:00Z`);
  const d1 = new Date(`${endIso}T00:00:00Z`);
  for (let d = d0; d <= d1; d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10));
  return out;
}

/* rng */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}
function makePRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

/* symbols/pairs */
const PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "LTCUSDT",
];
const BASE = (p: string) => p.replace(/USDT$|USD$|BUSD$/, "");

function buildHistorical(
  rand: () => number,
  accountKey: string
): HistoricalSummary {
  const n = 5 + Math.floor(rand() * 4);
  const pairs = [...PAIRS]
    .sort((a, b) => hashString(accountKey + a) - hashString(accountKey + b))
    .slice(0, n);
  const perPair: HistoricalBucket[] = pairs.map((pair) => {
    const pos = Math.round((200 + rand() * 800) * (0.5 + rand()));
    const neg = -Math.round((100 + rand() * 600) * (0.5 + rand()));
    const count = Math.floor(5 + rand() * 40);
    return {
      label: pair,
      count,
      pnl_pos: pos,
      pnl_neg: neg,
      winrate_pct: null,
    };
  });
  const perSymbolMap = new Map<
    string,
    { count: number; pos: number; neg: number }
  >();
  perPair.forEach((b) => {
    const sym = BASE(b.label);
    const prev = perSymbolMap.get(sym) ?? { count: 0, pos: 0, neg: 0 };
    prev.count += b.count;
    prev.pos += b.pnl_pos;
    prev.neg += b.pnl_neg;
    perSymbolMap.set(sym, prev);
  });
  const perSymbol: HistoricalBucket[] = [...perSymbolMap.entries()].map(
    ([label, v]) => ({
      label,
      count: v.count,
      pnl_pos: v.pos,
      pnl_neg: v.neg,
      winrate_pct: null,
    })
  );
  return { perPair, perSymbol };
}

function buildAccountMetrics(
  accountKey: string,
  startIso: ISODate,
  endIso: ISODate,
  initialBalance: number
): MetricsPayload {
  const seed = hashString(accountKey + "|" + startIso + "|" + endIso);
  const rand = makePRNG(seed);
  const days = daysBetween(startIso, endIso);

  let balance = initialBalance;
  const daily_rows = days.map((day) => {
    // daily return ~ N(0.1%, 1.2%)
    const u = rand();
    const v = rand();
    const z = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v);
    const dailyRet = 0.001 + 0.012 * z;
    const start_balance = balance;
    const gross = start_balance * dailyRet * (1 + 0.12 * (rand() - 0.5));
    const fees = Math.abs(gross) * (0.08 + 0.05 * rand());
    const net = gross - fees;
    balance = start_balance + net;

    return {
      day,
      gross_pnl: Number(gross.toFixed(2)),
      fees: Number(fees.toFixed(2)),
      net_pnl: Number(net.toFixed(2)),
      start_balance: Number(start_balance.toFixed(2)),
      end_balance: Number(balance.toFixed(2)),
      daily_return_pct:
        start_balance > 0
          ? Number(((net / start_balance) * 100).toFixed(3))
          : 0,
    };
  });

  const window_start = startIso;
  const window_end = endIso;

  const daily_return_dollars = daily_rows.map((r) => ({
    day: r.day,
    daily_profit_loss_usd: r.net_pnl,
  }));

  const endMonth = new Date(`${endIso}T00:00:00Z`);
  const mtdStart = new Date(
    Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth(), 1)
  );
  const mtdIso = toISO(mtdStart);
  const mtdRows = daily_rows.filter((r) => r.day >= mtdIso);
  const mtdNet = mtdRows.reduce((a, b) => a + b.net_pnl, 0);
  const mtdFees = mtdRows.reduce((a, b) => a + b.fees, 0);

  // streaks
  let cur = 0,
    max = 0;
  for (const r of daily_rows) {
    if (r.net_pnl < 0) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }

  return {
    config: {
      initial_balance: initialBalance,
      run_date: endIso,
      last_n_days: days.length,
    },
    historical: buildHistorical(rand, accountKey),
    daily_return_last_n_days: {
      window_start,
      window_end,
      daily_rows,
      total_return_pct_over_window:
        initialBalance > 0
          ? Number(
              (((balance - initialBalance) / initialBalance) * 100).toFixed(2)
            )
          : null,
    },
    month_to_date: {
      mtd_return_pct: null,
      mtd_return_usd: Number(mtdNet.toFixed(2)),
      mtd_total_fees_usd: Number(mtdFees.toFixed(2)),
      mtd_drawdown_pct: null,
    },
    drawdowns: {
      max_drawdown_pct: -Number((5 + 20 * rand()).toFixed(2)),
      max_drawdown_peak_day: days[Math.floor(days.length * 0.2)] ?? null,
      current_drawdown_pct: -Number((1 + 10 * rand()).toFixed(2)),
      current_drawdown_days: Math.floor(1 + rand() * 12),
    },
    drawdown_period: {
      peak_day: days[Math.floor(days.length * 0.15)] ?? null,
      trough_day: days[Math.floor(days.length * 0.25)] ?? null,
      recovery_day: days[Math.floor(days.length * 0.45)] ?? null,
    },
    win_rates: {
      rolling_30d_win_rate_pct: null,
      win_rate_from_run_start_pct: null,
    },
    counts: { number_of_trades_total: Math.floor(50 + rand() * 300) },
    streaks: {
      consecutive_losing_days: {
        max_streak: max,
        meets_threshold: max >= 3,
        current_streak: cur,
      },
    },
    daily_return_dollars,
    mtd_return_dollars: Number(mtdNet.toFixed(2)),
    mtd_total_fees_dollars: Number(mtdFees.toFixed(2)),
    initial_balance: initialBalance,
  };
}

function mergeHistorical(items: HistoricalSummary[]): HistoricalSummary {
  const pairMap = new Map<
    string,
    { count: number; pos: number; neg: number }
  >();
  const symMap = new Map<string, { count: number; pos: number; neg: number }>();
  for (const h of items) {
    for (const b of h.perPair) {
      const v = pairMap.get(b.label) ?? { count: 0, pos: 0, neg: 0 };
      v.count += b.count;
      v.pos += b.pnl_pos;
      v.neg += b.pnl_neg;
      pairMap.set(b.label, v);
    }
    for (const b of h.perSymbol) {
      const v = symMap.get(b.label) ?? { count: 0, pos: 0, neg: 0 };
      v.count += b.count;
      v.pos += b.pnl_pos;
      v.neg += b.pnl_neg;
      symMap.set(b.label, v);
    }
  }
  const toBuckets = (
    m: Map<string, { count: number; pos: number; neg: number }>
  ): HistoricalBucket[] =>
    [...m.entries()].map(([label, v]) => ({
      label,
      count: v.count,
      pnl_pos: v.pos,
      pnl_neg: v.neg,
      winrate_pct: null,
    }));
  return { perPair: toBuckets(pairMap), perSymbol: toBuckets(symMap) };
}

function mergeMetrics(payloads: MetricsPayload[]): MetricsPayload {
  const first = payloads[0];
  const start = first.daily_return_last_n_days.window_start;
  const end = first.daily_return_last_n_days.window_end;
  const initial = payloads.reduce((a, p) => a + p.initial_balance, 0);

  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  for (const p of payloads) {
    for (const r of p.daily_return_last_n_days.daily_rows) {
      const prev = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
      prev.gross += r.gross_pnl;
      prev.fees += r.fees;
      prev.net += r.net_pnl;
      byDay.set(r.day, prev);
    }
  }
  const days = daysBetween(start, end);
  let balance = initial;
  const daily_rows = days.map((day) => {
    const agg = byDay.get(day) ?? { gross: 0, fees: 0, net: 0 };
    const start_balance = balance;
    const end_balance = start_balance + agg.net;
    balance = end_balance;
    return {
      day,
      gross_pnl: Number(agg.gross.toFixed(2)),
      fees: Number(agg.fees.toFixed(2)),
      net_pnl: Number(agg.net.toFixed(2)),
      start_balance: Number(start_balance.toFixed(2)),
      end_balance: Number(end_balance.toFixed(2)),
      daily_return_pct:
        start_balance > 0
          ? Number(((agg.net / start_balance) * 100).toFixed(3))
          : 0,
    };
  });

  return {
    ...first,
    historical: mergeHistorical(
      payloads.map((p) => p.historical ?? { perPair: [], perSymbol: [] })
    ),
    config: {
      initial_balance: initial,
      run_date: end,
      last_n_days: days.length,
    },
    daily_return_last_n_days: {
      window_start: start,
      window_end: end,
      daily_rows,
      total_return_pct_over_window:
        initial > 0
          ? Number((((balance - initial) / initial) * 100).toFixed(2))
          : null,
    },
    daily_return_dollars: daily_rows.map((r) => ({
      day: r.day,
      daily_profit_loss_usd: r.net_pnl,
    })),
    mtd_return_dollars: Number(
      daily_rows
        .filter((r) => r.day.slice(0, 7) === end.slice(0, 7))
        .reduce((a, r) => a + r.net_pnl, 0)
        .toFixed(2)
    ),
    mtd_total_fees_dollars: Number(
      daily_rows
        .filter((r) => r.day.slice(0, 7) === end.slice(0, 7))
        .reduce((a, r) => a + r.fees, 0)
        .toFixed(2)
    ),
    initial_balance: initial,
  };
}

export function generateDummyMetrics(
  selected: string[],
  range: DateRange,
  earliest: boolean
): MultiMetricsResponse {
  const todayIso = toISO(new Date());
  const endIso = range.end ?? todayIso;
  const startIso =
    range.start ??
    (earliest
      ? toISO(new Date(Date.UTC(new Date(endIso).getUTCFullYear(), 0, 1)))
      : endIso);

  const per_account: Record<string, MetricsPayload> = {};
  for (const key of selected) {
    const initBal = 50_000 + Math.floor(hashString(key) % 75_000);
    per_account[key] = buildAccountMetrics(key, startIso, endIso, initBal);
  }

  const merged = selected.length
    ? mergeMetrics(Object.values(per_account))
    : buildAccountMetrics("EMPTY", startIso, endIso, 100_000);

  const multi: MultiSelectionResponse = {
    selected,
    merged,
    per_account,
    meta: {
      server_time_utc: new Date().toISOString(),
      server_time_in_tz: new Date().toString(),
      tz_resolved: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      run_date_used: endIso,
    },
  };
  return multi;
}
