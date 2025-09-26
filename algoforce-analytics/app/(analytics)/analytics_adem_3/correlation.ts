// app/analytics_adem_3_josh/metrics/correlation.ts
import { logReturns, rolling } from "./rolling";

export interface CorrRow {
  t: string;
  pearson: number | null;
  spearman: number | null;
  kendall: number | null; // TODO
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length; if (n < 2 || n !== y.length) return null;
  let sx=0, sy=0, sxx=0, syy=0, sxy=0;
  for (let i=0;i<n;i+=1){ const a=x[i], b=y[i]; sx+=a; sy+=b; sxx+=a*a; syy+=b*b; sxy+=a*b; }
  const cov = sxy - (sx*sy)/n;
  const vx = sxx - (sx*sx)/n;
  const vy = syy - (sy*sy)/n;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx*vy);
}

// Spearman via rank transform
function rankArray(a: number[]): number[] {
  const idx = a.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
  const ranks = new Array(a.length);
  let r = 1;
  while (r <= a.length) {
    const j = r - 1;
    let k = j;
    // tie group
    while (k + 1 < a.length && idx[k + 1].v === idx[j].v) k += 1;
    const avg = (j + k + 2) / 2; // average rank (1-based)
    for (let t = j; t <= k; t += 1) ranks[idx[t].i] = avg;
    r = k + 2;
  }
  return ranks;
}

function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 2) return null;
  const rx = rankArray(x);
  const ry = rankArray(y);
  return pearson(rx, ry);
}

export function computeRollingCorrelations(
  days: string[],
  xClose: number[],
  yClose: number[],
  win: number
): CorrRow[] {
  if (days.length === 0) return [];
  const rx = logReturns(xClose);
  const ry = logReturns(yClose);

  return days.map((t, i) => {
    // align to returns index: days[i] uses returns up to i (exclusive) ⇒ i-1 index in returns
    if (i < win) return { t, pearson: null, spearman: null, kendall: null };
    const end = i;               // exclusive in returns space
    const start = end - win;
    const ax = rx.slice(start, end);
    const ay = ry.slice(start, end);
    return {
      t,
      pearson: pearson(ax, ay),
      spearman: spearman(ax, ay),
      kendall: null, // implement if you need tau-b
    };
  });
}
