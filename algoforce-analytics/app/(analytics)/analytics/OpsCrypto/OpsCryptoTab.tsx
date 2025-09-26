
// FILE: app/analytics/OpsForecastTab.tsx
"use client";
import ChartPlaceholder from "../ChartPlaceholder";

export default function OpsForecastTab() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartPlaceholder title="Funding Fees" subtitle="and net impact on PnL" />
            <ChartPlaceholder title="Execution Failure Rate" subtitle="rejected / unfilled (logs)" />
            <ChartPlaceholder title="Latency Monitor" subtitle="signal → execution (logs)" />
        </div>
    );
}