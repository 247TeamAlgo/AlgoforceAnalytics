// app/analytics/PerformanceTab.tsx
"use client";

import NoData from "./NoDataCard";
import type { MetricsPayload } from "./types";
import CumulativePnlCard from "./PerformanceDistribution/CumulativePnlCard";
import RollingRiskCard from "./PerformanceDistribution/RollingSharpeCard";
import LosingStreakChart from "./PerformanceDistribution/LosingStreakChart";
import ProbDDExceedChart from "./PerformanceDistribution/ProbDDExceedXChart";
import ProbLossKChart from "./PerformanceDistribution/ProbLossKChart";
import PnlBreakdownCard from "./PerformanceDistribution/PnlBreakdownCard";
import HitRatioChart from "./PerformanceDistribution/HitRatioChart";

export default function PerformanceTab({
  merged,
  perAccounts,
}: {
  merged: MetricsPayload | null;
  perAccounts?: Record<string, MetricsPayload>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {merged ? (
        <CumulativePnlCard metrics={merged} />
      ) : (
        <NoData title="Cumulative PnL" subtitle="Daily / Weekly / Monthly" />
      )}

      {merged ? (
        <RollingRiskCard metrics={merged} defaultRiskFreeAnnual={0} />
      ) : (
        <NoData title="Sharpe / Sortino / Calmar" subtitle="Rolling 30d / 90d / YTD" />
      )}

      {merged ? (
        <PnlBreakdownCard metrics={merged} />
      ) : (
        <NoData title="PnL Breakdown" subtitle="Daily / Weekly / Monthly" />
      )}

      {perAccounts ? (
        <LosingStreakChart perAccounts={perAccounts} />
      ) : (
        <NoData title="Losing Streak Monitor" subtitle="Days & Weeks" />
      )}

      {perAccounts ? (
        <ProbDDExceedChart perAccounts={perAccounts} />
      ) : (
        <NoData title="Bootstrap — P(DD > X%)" subtitle="Days & Weeks" />
      )}

      {perAccounts ? (
        <ProbLossKChart perAccounts={perAccounts} />
      ) : (
        <NoData title="Bootstrap — P(DD > X%)" subtitle="Days & Weeks" />
      )}

      {perAccounts ? (
        <HitRatioChart perAccounts={perAccounts} />
      ) : (
        <NoData title="Hit Ratio" subtitle="Win/Loss percentage - Per Report, Daily, Weekly" /> // Change per report to per trade
      )}
    </div>
  );
}
