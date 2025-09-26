// app/analytics/OverviewTab.tsx
"use client";
import Snapshot from "./Snapshot";
import DailyReturnsStrip from "./DailyReturnsStrip";
import TradeRatio from "./TradeRatio";

import type { Account, MetricsPayload } from "../types";
import { displayName } from "../types";
import ChartPlaceholder from "../ChartPlaceholder";

export default function OverviewTab({
    merged, perAccounts, accounts, dailyStrip, selectedCount,
}: {
    merged: MetricsPayload | null;
    perAccounts?: Record<string, MetricsPayload>;
    accounts: Account[];
    dailyStrip: Array<{ day: string; v: number }>;
    selectedCount: number;
}) {
    if (!merged) {
        return <div className="text-sm text-muted-foreground border rounded p-6">Run a fetch to see metrics.</div>;
    }

    const hasRangeData = merged.daily_return_last_n_days.daily_rows.length > 0;

    return (
        <div className="space-y-5">
            <Snapshot metrics={merged} label={`Merged Metrics${selectedCount ? ` (${selectedCount} acct)` : ""}`} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <DailyReturnsStrip rows={dailyStrip} />
                <TradeRatio
                    winRatePct={merged.win_rates.win_rate_from_run_start_pct}
                    totalTrades={merged.counts.number_of_trades_total}
                />
                <ChartPlaceholder title="PnL Heatmap" subtitle={hasRangeData ? "Monthly returns by year" : "No data"} />
            </div>

            {perAccounts ? (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold tracking-wide">Per-account Snapshots</h3>
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {Object.entries(perAccounts).map(([key, mp]) => {
                            const acc = accounts.find((a) => a.redisName === key);
                            return <Snapshot key={key} metrics={mp} label={acc ? displayName(acc) : key} />;
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
