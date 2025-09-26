import type {
  AvgReturnRow,
  DDProbPoint,
  DatedPoint,
  Freq,
  MonthlyJson,
  PnLBreakdown,
  PnLBreakdownRow,
  RollingRow,
  RollingTable,
  RunLenRow,
  YTDRow,
} from "../types";

// ------------------- Basics -------------------
const avg = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const stdev = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = avg(a);
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  return Math.sqrt(Math.max(0, v));
};
const quantile = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx),
    hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] * (hi - idx) + a[hi] * (idx - lo);
};
const compound = (seq: number[]) => seq.reduce((acc, r) => acc * (1 + r), 1);

// Annualization helper by frequency
export function periodsPerYear(freq: Freq): number {
  if (freq === "D") return 365;
  if (freq === "W") return 52;
  return 12; // "M"
}

// ------------------- Equity & drawdown -------------------
export function equityFromReturns(r: Array<{ t: Date; v: number }>) {
  const out: Array<{ t: Date; v: number }> = [];
  let eq = 1;
  for (const p of r) {
    eq *= 1 + p.v;
    out.push({ t: p.t, v: eq });
  }
  return out;
}

export function drawdownSeries(eq: Array<{ t: Date; v: number }>) {
  const out: Array<{ t: Date; v: number }> = [];
  let peak = -Infinity;
  for (const p of eq) {
    peak = Math.max(peak, p.v);
    out.push({ t: p.t, v: p.v / peak - 1 }); // negative
  }
  return out;
}

export function toDP(arr: Array<{ t: Date; v: number }>): DatedPoint[] {
  return arr.map(({ t, v }) => ({ date: t.toISOString(), value: v }));
}

// ------------------- Rolling risk (freq-aware) -------------------
export function rollingRiskGeneric(
  ret: Array<{ t: Date; v: number }>,
  freq: Freq,
  windows: Array<{ periods: number; label: string }>
): {
  table: RollingTable;
  annReturn: number | null;
  annVol: number | null;
  // “main window” = last item in windows (e.g. 90D or 6M)
  sharpeMain: number | null;
  sortinoMain: number | null;
  calmarMain: number | null;
} {
  const P = periodsPerYear(freq);
  const rows: RollingRow[] = [];

  for (const W of windows) {
    if (ret.length < W.periods) {
      rows.push({
        windowLabel: W.label,
        periods: W.periods,
        sharpe: null,
        sortino: null,
        calmar: null,
        annReturn: null,
      });
      continue;
    }
    const slice = ret.slice(-W.periods);
    const m = avg(slice.map((x) => x.v));
    const s = stdev(slice.map((x) => x.v));
    const negSd = stdev(slice.filter((x) => x.v < 0).map((x) => x.v));
    const eqW = equityFromReturns(slice);
    const mdd = Math.min(...drawdownSeries(eqW).map((d) => d.v)); // negative
    const cagr = Math.pow(eqW[eqW.length - 1].v, P / W.periods) - 1;

    const sharpe = s ? (m / s) * Math.sqrt(P) : null;
    const sortino = negSd ? (m / negSd) * Math.sqrt(P) : null;
    const calmar = mdd < 0 ? cagr / Math.abs(mdd) : null;

    rows.push({
      windowLabel: W.label,
      periods: W.periods,
      sharpe,
      sortino,
      calmar,
      annReturn: cagr,
    });
  }

  if (!ret.length) {
    return {
      table: { rows },
      annReturn: null,
      annVol: null,
      sharpeMain: null,
      sortinoMain: null,
      calmarMain: null,
    };
  }

  const eq = equityFromReturns(ret);
  const cagrFull = Math.pow(eq[eq.length - 1].v, P / ret.length) - 1;
  const sdFull = stdev(ret.map((x) => x.v));
  const annVol = sdFull * Math.sqrt(P);

  const main = rows[rows.length - 1];
  return {
    table: { rows },
    annReturn: cagrFull,
    annVol,
    sharpeMain: main?.sharpe ?? null,
    sortinoMain: main?.sortino ?? null,
    calmarMain: main?.calmar ?? null,
  };
}

export function ytdRiskGeneric(
  ret: Array<{ t: Date; v: number }>,
  freq: Freq
): YTDRow[] {
  const P = periodsPerYear(freq);
  const byYear = new Map<number, Array<number>>();
  for (const p of ret) {
    const y = p.t.getUTCFullYear();
    const arr = byYear.get(y) ?? [];
    arr.push(p.v);
    byYear.set(y, arr);
  }
  const out: YTDRow[] = [];
  for (const y of [...byYear.keys()].sort()) {
    const vals = byYear.get(y)!;
    const m = avg(vals);
    const s = stdev(vals);
    const negSd = stdev(vals.filter((x) => x < 0));
    // synthetic monthly timeline per year for drawdown calc
    const eqY = equityFromReturns(
      vals.map((v, i) => ({ t: new Date(Date.UTC(y, Math.min(i, 11), 1)), v }))
    );
    const mdd = Math.min(...drawdownSeries(eqY).map((d) => d.v));
    const cagr = Math.pow(eqY[eqY.length - 1].v, P / vals.length) - 1;
    out.push({
      year: y,
      sharpe: s ? (m / s) * Math.sqrt(P) : null,
      sortino: negSd ? (m / negSd) * Math.sqrt(P) : null,
      calmar: mdd < 0 ? cagr / Math.abs(mdd) : null,
    });
  }
  return out;
}

// ------------------- Hit ratio & streaks -------------------
export const hitRatio = (ret: Array<{ v: number }>) =>
  ret.length ? ret.filter((x) => x.v > 0).length / ret.length : 0;

export function runLengths(ret: Array<{ v: number }>): {
  current: number;
  max: number;
} {
  let max = 0,
    curr = 0;
  for (const r of ret) {
    if (r.v < 0) {
      curr += 1;
      if (curr > max) max = curr;
    } else curr = 0;
  }
  let currNow = 0;
  for (let i = ret.length - 1; i >= 0; i--) {
    if (ret[i].v < 0) currNow += 1;
    else break;
  }
  return { current: currNow, max };
}

// ------------------- PnL breakdown -------------------
export function pnlBreakdown(
  retMap: Partial<Record<Freq, Array<{ v: number }>>>
): PnLBreakdown {
  const rows: PnLBreakdownRow[] = [];
  const add = (freq: Freq, label: "Daily" | "Weekly" | "Monthly") => {
    const arr = retMap[freq];
    if (!arr || !arr.length) return;
    const vals = arr.map((p) => p.v);
    rows.push({
      freq: label,
      observations: vals.length,
      totalReturn: compound(vals) - 1,
      mean: avg(vals),
      std: stdev(vals),
      hitRatio: hitRatio(arr),
    });
  };
  add("D", "Daily");
  add("W", "Weekly");
  add("M", "Monthly");
  return { rows };
}

// ------------------- Bootstrap (freq-agnostic, i.i.d.) -------------------
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleSequences(
  pool: number[],
  horizon: number,
  n: number,
  seed: number
): number[][] {
  const rng = mulberry32(seed);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let t = 0; t < horizon; t++)
      row.push(pool[Math.floor(rng() * pool.length)]);
    out.push(row);
  }
  return out;
}

function maxDrawdownOfSeq(seq: number[]): number {
  let eq = 1,
    peak = 1,
    minDD = 0;
  for (const r of seq) {
    eq *= 1 + r;
    if (eq > peak) peak = eq;
    const dd = eq / peak - 1;
    if (dd < minDD) minDD = dd;
  }
  return minDD;
}

function maxLossRun(seq: number[]): number {
  let curr = 0,
    max = 0;
  for (const r of seq) {
    if (r < 0) {
      curr += 1;
      if (curr > max) max = curr;
    } else curr = 0;
  }
  return max;
}

// Average return distribution over horizons (label provided by caller)
export function simulateAvgReturn(
  pool: number[],
  horizons: Array<{ periods: number; label: string }>,
  sims: number,
  seed: number
): AvgReturnRow[] {
  const rng = mulberry32(seed);
  const out: AvgReturnRow[] = [];
  for (const H of horizons) {
    const means: number[] = [];
    for (let i = 0; i < sims; i++) {
      let sum = 0;
      for (let t = 0; t < H.periods; t++) {
        sum += pool[Math.floor(rng() * pool.length)];
      }
      means.push(sum / H.periods);
    }
    means.sort((a, b) => a - b);
    out.push({
      horizonLabel: H.label,
      mean: avg(means),
      p5: quantile(means, 0.05),
      p50: quantile(means, 0.5),
      p95: quantile(means, 0.95),
    });
  }
  return out;
}

export function simulateDrawdownExceed(
  pool: number[],
  horizons: Array<{ periods: number; label: string }>,
  thresholdsPct: number[]
): DDProbPoint[] {
  const points: DDProbPoint[] = [];
  for (const H of horizons) {
    const seqs = sampleSequences(pool, H.periods, 10_000, 123);
    const mdds = seqs.map((s) => maxDrawdownOfSeq(s));
    for (const thr of thresholdsPct) {
      const p = mdds.filter((x) => x <= -thr / 100).length / mdds.length;
      points.push({ thresholdPct: thr, horizonLabel: H.label, probability: p });
    }
  }
  return points;
}

export function simulateRunLen(
  pool: number[],
  horizons: Array<{ periods: number; label: string }>,
  ks: number[]
): RunLenRow[] {
  const rows: RunLenRow[] = [];
  for (const H of horizons) {
    const seqs = sampleSequences(pool, H.periods, 10_000, 999);
    const maxRuns = seqs.map((s) => maxLossRun(s));
    for (const k of ks) {
      const p = maxRuns.filter((m) => m > k).length / maxRuns.length;
      rows.push({ horizonLabel: H.label, k, probability: p });
    }
  }
  return rows;
}

// ------------------- Current source: Monthly_return.json -------------------
export function monthlyReturnsFromJson(json: MonthlyJson): {
  rM_overall: Array<{ t: Date; v: number }>;
  perAccount: Map<string, Array<{ t: Date; v: number }>>;
} {
  const rM_overall: Array<{ t: Date; v: number }> = [];
  const perAccount = new Map<string, Array<{ t: Date; v: number }>>();

  for (const m of json.months) {
    const d = new Date(`${m.month}-01T00:00:00Z`);
    const oi = m.totals.overall.initial_balance;
    const of = m.totals.overall.final_balance;
    const r = of / oi - 1;
    if (Number.isFinite(r)) rM_overall.push({ t: d, v: r });

    for (const a of m.accounts) {
      const ai = a.initial_balance;
      const af = a.final_balance;
      const ar = af / ai - 1;
      if (!perAccount.has(a.name)) perAccount.set(a.name, []);
      if (Number.isFinite(ar)) perAccount.get(a.name)!.push({ t: d, v: ar });
    }
  }

  rM_overall.sort((a, b) => a.t.getTime() - b.t.getTime());
  perAccount.forEach((arr, key) => {
    arr.sort((a, b) => a.t.getTime() - b.t.getTime());
    perAccount.set(key, arr);
  });

  return { rM_overall, perAccount };
}
