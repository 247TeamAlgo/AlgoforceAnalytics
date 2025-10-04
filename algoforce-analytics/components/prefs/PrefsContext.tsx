"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PrefsContext = createContext(undefined);

// ---------- helpers ----------
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAccounts(retries = 3, backoffMs = 300) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();

      // Accept either an array or { accounts: [...] }
      const arr = Array.isArray(json)
        ? json
        : Array.isArray(json?.accounts)
          ? json.accounts
          : [];

      return arr
        .map((a) => ({
          redisName: String(a?.redisName ?? "").trim(),
          display: a?.display ?? null,
          monitored: Boolean(a?.monitored),
        }))
        .filter((a) => !!a.redisName);
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(backoffMs * 2 ** i);
    }
  }
  throw lastErr || new Error("accounts fetch failed");
}

function defaultSelected(accounts) {
  const names = new Set(accounts.map((a) => a.redisName));
  if (names.has("fund2") && names.has("fund3")) return ["fund2", "fund3"];
  const preferred = accounts.filter((a) => a.monitored).slice(0, 2);
  const pool = preferred.length ? preferred : accounts.slice(0, 2);
  return pool.map((a) => a.redisName);
}

// ---------- provider ----------
export function PrefsProvider({ children }) {
  const [analyticsAccounts, setAnalyticsAccounts] = useState([]);
  const [analyticsSelectedAccounts, setAnalyticsSelectedAccounts] = useState([
    "fund2",
    "fund3",
  ]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Optional date range state (your components expect these)
  const [analyticsRange, setAnalyticsRange] = useState({});
  const [analyticsEarliest, setAnalyticsEarliest] = useState(false);

  // Navbar flag used in your code
  const navbarVisible = true;

  const mountedRef = useRef(false);

  const load = async () => {
    setAnalyticsLoading(true);
    try {
      const list = await fetchAccounts();
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
      // Fallback so dialog stays clickable
      const fallback = [
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
  };

  const reloadAccounts = async () => {
    await load();
  };

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    load();
  }, []);

  const value = useMemo(
    () => ({
      // UI flags
      navbarVisible,

      // Accounts
      analyticsAccounts,
      analyticsSelectedAccounts,
      setAnalyticsSelectedAccounts,
      analyticsLoading,
      reloadAccounts,

      // Range (kept for compatibility with your components)
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
      analyticsRange,
      analyticsEarliest,
    ]
  );

  return (
    <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}
