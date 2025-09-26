export function localTodayISO(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
export function resolveAsOf(runDate: string | undefined, tz: string): Date {
  return new Date(`${runDate ?? localTodayISO(tz)}T00:00:00`);
}
export function startOfMonthISO(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
export function addDaysISODate(iso: string, n: number): string {
  return addDays(new Date(`${iso}T00:00:00`), n)
    .toISOString()
    .slice(0, 10);
}
export function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function diffDaysInclusive(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T00:00:00Z`).getTime();
  const b = new Date(`${bISO}T00:00:00Z`).getTime();
  return Math.abs(Math.round((b - a) / 86_400_000)) + 1;
}

/** Minimal offset map to avoid MySQL tz tables. */
export function tzOffsetHours(tz: string): number {
  const t = tz.toLowerCase().trim();
  if (
    t.includes("asia/manila") ||
    t.includes("asia/kuala_lumpur") ||
    t.includes("malay peninsula standard time") ||
    t.includes("kuala lumpur") ||
    t.includes("manila")
  )
    return 8;
  return 0;
}
export function offsetHHMMSS(hours: number): string {
  const sign = hours >= 0 ? "" : "-";
  const hh = Math.abs(hours).toString().padStart(2, "0");
  return `${sign}${hh}:00:00`;
}
/** Convert a local-day midnight to a UTC timestamp string for MySQL. */
export function localMidnightToUtc(dateISO: string, offsetHours: number): string {
  const ms = Date.parse(`${dateISO}T00:00:00Z`) - offsetHours * 3600_000;
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}