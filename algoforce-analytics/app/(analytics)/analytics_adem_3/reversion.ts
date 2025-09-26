// app/analytics_adem_3_josh/metrics/reversion.ts
import { rolling } from "./rolling";

export interface ReversionRow {
  t: string;
  phi: number | null;            // AR(1) coefficient
  strength: number | null;       // -ln(phi)
  half_life_days: number | null; // -ln(2)/ln(phi), only if 0<phi<1
}

export function rollingAr1Phi(spread: number[], win: number): (number | null)[] {
  return rolling<number | null>(spread.length, win, (s, e) => {
    if (e - s < 3) return null;
    let num=0, den=0;
    for (let i=s+1;i<e;i+=1){ const yt=spread[i], yt1=spread[i-1]; num += yt*yt1; den += yt1*yt1; }
    if (Math.abs(den) < 1e-12) return null;
    return num/den;
  });
}

export function halfLife(phi: number | null): number | null {
  if (phi == null || !(phi > 0 && phi < 1)) return null;
  const d = Math.log(phi); if (!Number.isFinite(d) || d === 0) return null;
  return -Math.log(2) / d;
}

export function computeReversion(
  days: string[],
  spread: Array<number | null>,
  win: number
): ReversionRow[] {
  const s = spread.map(v => (v == null || !Number.isFinite(v)) ? 0 : v);
  const phi = rollingAr1Phi(s, win);
  return days.map((t, i) => {
    const p = phi[i];
    return { t, phi: p, strength: p != null ? -Math.log(p) : null, half_life_days: halfLife(p) };
  });
}
