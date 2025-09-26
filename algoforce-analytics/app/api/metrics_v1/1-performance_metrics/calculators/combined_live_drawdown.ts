import { readBaselineUsd } from "@/lib/baseline";
import type {
  MetricConfig,
  DrawdownBlock,
  DrawdownPeriod,
  EquityPoint,
} from "../metrics/types";
import {
  fetchDailyRows,
  findEarliestLocalDateForAccounts,
  findLatestLocalDateForAccounts,
} from "./z_sql_fetch_modify";
import { addDaysISODate, fmtISO, localTodayISO } from "./z_time_tz";
import { getJson } from "@/lib/db/redis";

/** Shapes we expect from Redis `${account}_live` */
type LiveArrayItem = { unrealizedProfit?: number | string | null };
type LiveMap = Record<string, number | string | null>;
type LiveObject = { unrealizedProfit?: LiveMap } & Record<string, unknown>;

/** Robustly sum account-level UPnL in USD from Redis */
async function sumAccountUPnLUSD(accountKey: string): Promise<number> {
  try {
    const key = `${accountKey}_live`;
    const payload = await getJson<unknown>(key);
    if (payload == null) return 0;

    // Case 1: array of positions
    if (Array.isArray(payload)) {
      return payload.reduce((sum, it) => {
        if (
          it &&
          typeof it === "object" &&
          "unrealizedProfit" in (it as Record<string, unknown>)
        ) {
          const raw = (it as LiveArrayItem).unrealizedProfit ?? 0;
          const v = Number(raw);
          return sum + (Number.isFinite(v) ? v : 0);
        }
        return sum;
      }, 0);
    }

    // Case 2: object with { unrealizedProfit: { "BTCUSDT": "12.3", ... } }
    if (typeof payload === "object") {
      const obj = payload as LiveObject;
      const map = obj.unrealizedProfit;
      if (map && typeof map === "object") {
        return Object.values(map).reduce((sum: number, raw) => {
          const v = Number(raw ?? 0);
          return sum + (Number.isFinite(v) ? v : 0);
        }, 0);
      }
    }
  } catch {
    // tolerate decode issues
  }
  return 0;
}

function equitySeriesFromDaily(
  daily: { day: string; net_pnl: number }[],
  initial: number
): EquityPoint[] {
  let cur = initial;
  return daily.map((r) => {
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
    if ((ddSeries as Array<(typeof ddSeries)[number]>)[i].dd < 0) currentDays++;
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

export type CombinedDrawdownResponse = {
  window_start: string;
  window_end: string;
  equity_series: EquityPoint[];
  drawdown: DrawdownBlock;
  drawdown_period: DrawdownPeriod;
  include_upnl: boolean;
  upnl_injected_usd: number;
};

export async function computeCombinedLiveDrawdown(
  accounts: string[],
  cfg: MetricConfig,
  includeUPnL = true
): Promise<CombinedDrawdownResponse> {
  const tz = cfg.tz || "Europe/Zurich";

  // Resolve date window (range preferred; else earliest/end logic)
  let startISO = cfg.startDate;
  let endISO = cfg.endDate;

  if (!startISO) {
    if (cfg.earliest) {
      startISO =
        (await findEarliestLocalDateForAccounts(accounts, tz)) ??
        localTodayISO(tz);
    } else {
      // default to last 30d if no explicit range
      const today = localTodayISO(tz);
      endISO = endISO ?? today;
      const d = new Date(`${endISO}T00:00:00`);
      d.setUTCDate(d.getUTCDate() - 29);
      startISO = fmtISO(d);
    }
  }
  if (!endISO) endISO = localTodayISO(tz);
  if (startISO! > endISO!) [startISO, endISO] = [endISO, startISO];

  // Clamp end to latest available across accounts
  const scopeLatest =
    (await findLatestLocalDateForAccounts(accounts, tz)) ?? endISO;
  if (endISO > scopeLatest) endISO = scopeLatest;

  const endExclusive = addDaysISODate(endISO, +1);

  // Aggregate daily PnL across accounts
  const byDay = new Map<string, number>();
  let initial = 0;
  for (const a of accounts) {
    initial += readBaselineUsd(a);
    const rows = await fetchDailyRows(a, tz, startISO, endExclusive);
    for (const r of rows) {
      const prev = byDay.get(r.day) ?? 0;
      byDay.set(r.day, prev + r.net_pnl);
    }
  }
  const days = [...byDay.keys()].sort();
  const daily = days.map((day) => ({ day, net_pnl: byDay.get(day) ?? 0 }));

  // Build equity and inject UPnL on the final point if requested
  const equity = equitySeriesFromDaily(daily, initial);
  let upnlInjected = 0;
  if (includeUPnL && equity.length) {
    const upnls = await Promise.all(accounts.map((a) => sumAccountUPnLUSD(a)));
    upnlInjected = upnls.reduce((s, x) => s + x, 0);
    if (Number.isFinite(upnlInjected) && Math.abs(upnlInjected) > 0) {
      const last = equity[equity.length - 1];
      equity[equity.length - 1] = {
        ...last,
        equity: last.equity + upnlInjected,
      };
    }
  }

  const { block, period } = drawdownStats(equity);

  return {
    window_start: startISO,
    window_end: endISO,
    equity_series: equity,
    drawdown: block,
    drawdown_period: period,
    include_upnl: includeUPnL,
    upnl_injected_usd: Number(upnlInjected.toFixed(8)),
  };
}
