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

/* Aggregator hook for convenience (keeps old import sites happy).
   Also exposes backward-compat aliases:
   - metrics* fields are mapped to performance* equivalents.
*/
export function usePrefs(): AccountsContextValue &
  PerformanceMetricsContextValue & {
    // backward-compat aliases
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
    // aliases
    metrics: p.performanceMetrics,
    metricsLoading: p.performanceLoading,
    metricsError: p.performanceError,
    metricsAsOf: p.performanceAsOf,
    metricsFetchedAt: p.performanceFetchedAt,
    metricsStatus: p.performanceStatus,
  };
}

/* Named exports if you want to import slices directly */
export { useAccountsPrefs } from "./AccountsContext";
export { usePerformanceMetrics } from "./metrics/PerformanceMetricsContext";
export * from "./types";
