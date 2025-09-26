// src/components/prefs/PrefsContext.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type RefreshMs = 500 | 1000 | 2000 | 5000 | 10000 | 30000;

export type Filters = {
  showOpen: boolean; // positions === 1
  showClosed: boolean; // positions === 0
  showDisabled: boolean; // everything else
  pinnedOnly: boolean; // only rows in pin set
  pnl: "all" | "pos" | "neg"; // PnL sign filter
  showBalancesCard: boolean; // balances card visible
  showOpenPositionsCard: boolean; // open positions card visible
  showAccountBalancesCard: boolean; // accounts card visible
};

const DEFAULT_FILTERS: Filters = {
  showOpen: true,
  showClosed: true,
  showDisabled: true,
  pinnedOnly: false,
  pnl: "all",
  showBalancesCard: true,
  showOpenPositionsCard: true,
  showAccountBalancesCard: false, // ⬅️ hidden by default (saves memory/CPU)
};

type Prefs = {
  refreshMs: RefreshMs;
  setRefreshMs: (v: RefreshMs) => void;
  query: string;
  setQuery: (v: string) => void;
  accessiblePalette: boolean;
  setAccessiblePalette: (b: boolean) => void;
  navbarVisible: boolean;
  setNavbarVisible: (b: boolean) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
};

const Ctx = createContext<Prefs | null>(null);

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
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [refreshMs, setRefreshMs] = useLocalStorage<RefreshMs>(
    "af_refresh_ms",
    1000
  );
  const [query, setQuery] = useLocalStorage<string>("af_query", "");
  const [accessiblePalette, setAccessiblePalette] = useLocalStorage<boolean>(
    "af_bright_bars",
    false
  );
  const [navbarVisible, setNavbarVisible] = useLocalStorage<boolean>(
    "af_navbar_visible",
    true
  );
  const [filters, setFilters] = useLocalStorage<Filters>(
    "af_filters",
    DEFAULT_FILTERS
  );

  const value = useMemo<Prefs>(
    () => ({
      refreshMs,
      setRefreshMs,
      query,
      setQuery,
      accessiblePalette,
      setAccessiblePalette,
      navbarVisible,
      setNavbarVisible,
      filters,
      setFilters,
    }),
    [
      refreshMs,
      setRefreshMs,
      query,
      setQuery,
      accessiblePalette,
      setAccessiblePalette,
      navbarVisible,
      setNavbarVisible,
      filters,
      setFilters,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}

export const DEFAULT_FILTERS_EXPORT = DEFAULT_FILTERS;
