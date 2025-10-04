// app/(analytics)/analytics/page.tsx
"use client";

import PerformanceMetricClient from "@/app/apitest/components/PerformanceMetricsClient";
import { useAccountsPrefs } from "@/components/prefs/AccountsContext";
import { usePerformanceMetrics } from "@/components/prefs/metrics/PerformanceMetricsContext";
import React, { useMemo } from "react";

export default function Page() {
  const { analyticsSelectedAccounts } = useAccountsPrefs();
  const {
    performanceMetrics,
    performanceLoading,
    performanceError,
    performanceAsOf,
    performanceFetchedAt,
  } = usePerformanceMetrics();

  const accounts = useMemo(
    () =>
      (analyticsSelectedAccounts?.length
        ? analyticsSelectedAccounts
        : ["fund2", "fund3"]) as string[],
    [analyticsSelectedAccounts]
  );

  return (
    <PerformanceMetricClient
      accounts={accounts}
      payload={performanceMetrics}
      loading={performanceLoading}
      error={performanceError}
      asOf={performanceAsOf}
      fetchedAt={performanceFetchedAt}
    />
  );
}
