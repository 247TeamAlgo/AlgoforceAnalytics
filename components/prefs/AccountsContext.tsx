"use client";

import * as React from "react";
import type {
  AccountMeta,
  AccountsContextValue,
  AnalyticsRange,
} from "./types";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const AccountsContext = createContext<AccountsContextValue | undefined>(
  undefined
);

/* ---------- helpers ---------- */

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeAccounts(arr: unknown): AccountMeta[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((a) => ({
      redisName: String((a as AccountMeta)?.redisName ?? "").trim(),
      display:
        typeof (a as AccountMeta)?.display === "string" ||
        (a as AccountMeta)?.display == null
          ? ((a as AccountMeta)?.display ?? null)
          : String((a as { display?: unknown }).display),
      monitored: Boolean((a as AccountMeta)?.monitored),
    }))
    .filter((a) => a.redisName.length > 0);
}

async function fetchAccountsOnce(
  retries = 3,
  backoffMs = 300
): Promise<AccountMeta[]> {
  let last: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json: unknown = await res.json();
      const arr = Array.isArray(json)
        ? json
        : Array.isArray((json as { accounts?: unknown })?.accounts)
          ? (json as { accounts: unknown[] }).accounts
          : [];
      return sanitizeAccounts(arr);
    } catch (e) {
      last = e;
      if (i < retries) await sleep(backoffMs * 2 ** i);
    }
  }
  throw last instanceof Error ? last : new Error("accounts fetch failed");
}

function defaultSelected(accounts: AccountMeta[]): string[] {
  const names = new Set(accounts.map((a) => a.redisName));
  if (names.has("fund2") && names.has("fund3")) return ["fund2", "fund3"];
  const preferred = accounts.filter((a) => a.monitored).slice(0, 2);
  const pool = preferred.length ? preferred : accounts.slice(0, 2);
  return pool.map((a) => a.redisName);
}

/* ---------- provider ---------- */

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [analyticsAccounts, setAnalyticsAccounts] = useState<AccountMeta[]>([]);
  const [analyticsSelectedAccounts, setAnalyticsSelectedAccounts] = useState<
    string[]
  >(["fund2", "fund3"]);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(true);

  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>({});
  const [analyticsEarliest, setAnalyticsEarliest] = useState<boolean>(false);

  const navbarVisible = true;

  const mountedRef = useRef(false);

  const reloadAccounts = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const list = await fetchAccountsOnce();
      setAnalyticsAccounts(list);
      setAnalyticsSelectedAccounts((prev) => {
        if (prev && prev.length > 0) {
          const allowed = new Set(list.map((a) => a.redisName));
          const filtered = prev.filter((x) => allowed.has(x));
          return filtered.length > 0 ? filtered : defaultSelected(list);
        }
        return defaultSelected(list);
      });
    } catch {
      // minimal fallback so UI stays usable
      const fallback: AccountMeta[] = [
        { redisName: "fund2", display: "Fund 2", monitored: true },
        { redisName: "fund3", display: "Fund 3", monitored: true },
      ];
      setAnalyticsAccounts(fallback);
      setAnalyticsSelectedAccounts((prev) =>
        prev.length ? prev : ["fund2", "fund3"]
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void reloadAccounts();
  }, [reloadAccounts]);

  const value = useMemo<AccountsContextValue>(
    () => ({
      navbarVisible,
      analyticsAccounts,
      analyticsSelectedAccounts,
      setAnalyticsSelectedAccounts,
      analyticsLoading,
      reloadAccounts,
      analyticsRange,
      setAnalyticsRange,
      analyticsEarliest,
      setAnalyticsEarliest,
    }),
    [
      navbarVisible,
      analyticsAccounts,
      analyticsSelectedAccounts,
      analyticsLoading,
      reloadAccounts,
      analyticsRange,
      analyticsEarliest,
    ]
  );

  return (
    <AccountsContext.Provider value={value}>
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccountsPrefs(): AccountsContextValue {
  const ctx = useContext(AccountsContext);
  if (!ctx)
    throw new Error("useAccountsPrefs must be used within AccountsProvider");
  return ctx;
}
