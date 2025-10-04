"use client";

import * as React from "react";
import {
  useAccountsPrefs,
  usePerformanceMetrics,
} from "@/components/prefs/PrefsContext";
import PerformanceMetricClient from "./components/PerformanceMetricsClient";
import { useMemo } from "react";

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
      analyticsSelectedAccounts?.length
        ? analyticsSelectedAccounts
        : ["fund2", "fund3"],
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
