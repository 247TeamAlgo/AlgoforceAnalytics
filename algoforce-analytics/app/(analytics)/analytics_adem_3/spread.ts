// app/analytics_adem_3_josh/metrics/spread.ts
import { ln, rolling, rollingMean, rollingStd } from "./rolling";

export interface SpreadRow {
  t: string;           // ISO day
  beta: number | null; // OLS(beta) of log(x) on log(y)
  s: number | null;    // spread = ln(x) - beta*ln(y)
  mu: number | null;   // rolling mean of spread
  sigma: number | null;// rolling std of spread
  z: number | null;    // standardized spread
}

export function rollingOlsBetaLog(x: number[], y: number[], win: number): (number | null)[] {
  const lx = x.map(ln), ly = y.map(ln);
  return rolling<number | null>(x.length, win, (s, e) => {
    const n = e - s;
    let sy = 0, sx = 0, syy = 0, syx = 0;
    for (let i = s; i < e; i += 1) { const yi = ly[i], xi = lx[i]; sy += yi; sx += xi; syy += yi*yi; syx += yi*xi; }
    const cov = syx - (sy*sx)/n;
    const varY = syy - (sy*sy)/n;
    if (Math.abs(varY) < 1e-12) return null;
    const beta = cov / varY;
    return Math.max(0.05, Math.min(beta, 20)); // sanity clamp
  });
}

export function computeSpreadZ(
  days: string[],
  xClose: number[],
  yClose: number[],
  win: number
): SpreadRow[] {
  const n = days.length;
  if (n === 0) return [];
  const beta = rollingOlsBetaLog(xClose, yClose, win);
  const sArr: number[] = new Array(n).fill(NaN);
  for (let i=0;i<n;i+=1) {
    const b = beta[i];
    if (b == null) continue;
    sArr[i] = ln(xClose[i]) - b * ln(yClose[i]);
  }
  const mu = rollingMean(sArr.map(v => Number.isFinite(v) ? v : 0), win);
  const sigma = rollingStd(sArr.map(v => Number.isFinite(v) ? v : 0), win);

  return days.map((t, i) => {
    const si = sArr[i];
    const ok = Number.isFinite(si) && mu[i] != null && sigma[i] != null && (sigma[i] as number) > 0;
    return {
      t,
      beta: beta[i],
      s: Number.isFinite(si) ? si : null,
      mu: mu[i],
      sigma: sigma[i],
      z: ok ? (si - (mu[i] as number)) / (sigma[i] as number) : null,
    };
  });
}
