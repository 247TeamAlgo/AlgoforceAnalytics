"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Account } from "@/app/(analytics)/analytics/lib/performance_metric_types";

export type IsoDate = string;
export type AnalyticsRange = { start?: IsoDate; end?: IsoDate };

export type Prefs = {
  navbarVisible: boolean;
  setNavbarVisible: (b: boolean) => void;

  accessiblePalette: boolean;
  setAccessiblePalette: (b: boolean) => void;

  analyticsRange: AnalyticsRange;
  setAnalyticsRange: (r: AnalyticsRange) => void;

  analyticsEarliest: boolean;
  setAnalyticsEarliest: (b: boolean) => void;

  analyticsSelectedAccounts: string[];
  setAnalyticsSelectedAccounts: (ids: string[]) => void;

  analyticsAccounts: Account[];
  setAnalyticsAccounts: (a: Account[]) => void;

  analyticsLoading: boolean;
  setAnalyticsLoading: (b: boolean) => void;
};

const Ctx = createContext<Prefs | null>(null);

/* ---------------- localStorage helper ---------------- */
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota/SSR issues */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/* ---------------- date helpers (local calendar, no TZ gymnastics) --------- */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function toISODateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function mtdDefault(): AnalyticsRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { start: toISODateLocal(start), end: toISODateLocal(now) };
}
/* ------------------------------------------------------------------------- */

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  // minimal UI prefs
  const [navbarVisible, setNavbarVisible] = useLocalStorage<boolean>(
    "af_navbar_visible",
    true
  );
  const [accessiblePalette, setAccessiblePalette] = useLocalStorage<boolean>(
    "af_bright_bars",
    false
  );

  // analytics filters (persisted) — default to MTD
  const [analyticsRange, setAnalyticsRange] = useLocalStorage<AnalyticsRange>(
    "af_analytics_range",
    mtdDefault()
  );
  const [analyticsEarliest, setAnalyticsEarliest] = useLocalStorage<boolean>(
    "af_analytics_earliest",
    false
  );
  const [analyticsSelectedAccounts, setAnalyticsSelectedAccounts] =
    useLocalStorage<string[]>("af_analytics_selected", []);

  // analytics runtime (non-persisted)
  const [analyticsAccounts, setAnalyticsAccounts] = useState<Account[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  const value = useMemo<Prefs>(
    () => ({
      navbarVisible,
      setNavbarVisible,
      accessiblePalette,
      setAccessiblePalette,

      analyticsRange,
      setAnalyticsRange,
      analyticsEarliest,
      setAnalyticsEarliest,
      analyticsSelectedAccounts,
      setAnalyticsSelectedAccounts,

      analyticsAccounts,
      setAnalyticsAccounts,
      analyticsLoading,
      setAnalyticsLoading,
    }),
    [
      navbarVisible,
      setNavbarVisible,
      accessiblePalette,
      setAccessiblePalette,
      analyticsRange,
      setAnalyticsRange,
      analyticsEarliest,
      setAnalyticsEarliest,
      analyticsSelectedAccounts,
      setAnalyticsSelectedAccounts,
      analyticsAccounts,
      analyticsLoading,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}
