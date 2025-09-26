// app/analytics_adem_3_josh/metrics/rolling.ts
export function ln(x: number): number { return Math.log(x); }

export function logReturns(closes: number[]): number[] {
  const out: number[] = new Array(Math.max(0, closes.length - 1));
  for (let i = 1; i < closes.length; i += 1) out[i - 1] = Math.log(closes[i]) - Math.log(closes[i - 1]);
  return out;
}

export function rolling<T>(n: number, win: number, f: (s: number, e: number) => T | null): (T | null)[] {
  const out: (T | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const e = i + 1, s = Math.max(0, e - win);
    if (e - s >= win) out[i] = f(s, e);
  }
  return out;
}

export function rollingMean(a: number[], win: number): (number | null)[] {
  return rolling<number | null>(a.length, win, (s, e) => {
    let sum = 0; for (let i=s;i<e;i+=1) sum += a[i]; return sum/(e-s);
  });
}
export function rollingStd(a: number[], win: number): (number | null)[] {
  return rolling<number | null>(a.length, win, (s, e) => {
    const n = e-s; if (n < 2) return null;
    let sum=0, sum2=0; for (let i=s;i<e;i+=1){ const v=a[i]; sum+=v; sum2+=v*v; }
    const mu = sum/n; const varS = (sum2 - n*mu*mu)/(n-1);
    return varS > 0 ? Math.sqrt(varS) : 0;
  });
}
