// FILE: app/analytics/api.ts
import type { Account, MetricsPayload, MultiMetricsResponse } from "./types";

export async function fetchAccounts(): Promise<Account[]> {
    const res = await fetch("/api/accounts", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Account[];
    return Array.isArray(data) ? data.filter((a) => !!a?.redisName) : [];
}

export async function fetchMetricsForSelected(
    accounts: string[],
    tz: string,
    lastNDays: number,
    runDate?: string
): Promise<MultiMetricsResponse> {
    const params = new URLSearchParams({ tz, lastNDays: String(lastNDays) });
    if (runDate) params.set("runDate", runDate);
    if (accounts.length > 0) params.set("accounts", accounts.join(","));
    const res = await fetch(`/api/metrics?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as MultiMetricsResponse;
}

export async function fetchMetricsOverall(
    tz: string,
    lastNDays: number,
    runDate?: string
): Promise<MetricsPayload> {
    const params = new URLSearchParams({ tz, lastNDays: String(lastNDays) });
    if (runDate) params.set("runDate", runDate);
    const res = await fetch(`/api/metrics/overall?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as MetricsPayload;
}
