// components/prefs/PrefsProvider.tsx
"use client";

import * as React from "react";
import { AccountsProvider, useAccountsPrefs } from "./AccountsContext";
import {
  PerformanceMetricsProvider,
  usePerformanceMetrics,
} from "./metrics/PerformanceMetricsContext";
import type {
  AccountsContextValue,
  PerformanceMetricsContextValue,
} from "./types";
import { ReactNode } from "react";

/* Compose providers so the rest of the app can keep using <PrefsProvider> */
export function PrefsProvider({ children }: { children: ReactNode }) {
  return (
    <AccountsProvider>
      <PerformanceMetricsProvider>{children}</PerformanceMetricsProvider>
    </AccountsProvider>
  );
}

/* Aggregator hook for convenience (keeps old import sites happy) */
export function usePrefs(): AccountsContextValue &
  PerformanceMetricsContextValue & {
    metrics: PerformanceMetricsContextValue["performanceMetrics"];
    metricsLoading: PerformanceMetricsContextValue["performanceLoading"];
    metricsError: PerformanceMetricsContextValue["performanceError"];
    metricsAsOf: PerformanceMetricsContextValue["performanceAsOf"];
    metricsFetchedAt: PerformanceMetricsContextValue["performanceFetchedAt"];
    metricsStatus: PerformanceMetricsContextValue["performanceStatus"];
  } {
  const a = useAccountsPrefs();
  const p = usePerformanceMetrics();

  return {
    ...a,
    ...p,
    // backward-compat aliases
    metrics: p.performanceMetrics,
    metricsLoading: p.performanceLoading,
    metricsError: p.performanceError,
    metricsAsOf: p.performanceAsOf,
    metricsFetchedAt: p.performanceFetchedAt,
    metricsStatus: p.performanceStatus,
  };
}

export { useAccountsPrefs } from "./AccountsContext";
export { usePerformanceMetrics } from "./metrics/PerformanceMetricsContext";
