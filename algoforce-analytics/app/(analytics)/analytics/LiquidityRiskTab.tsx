// FILE: app/analytics/LiquidityRiskTab.tsx
"use client";
import ChartPlaceholder from "./ChartPlaceholder";

export default function LiquidityRiskTab() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartPlaceholder title="Turnover Ratio" subtitle="Volume / AUM" />
            <ChartPlaceholder title="Simulated Slippage" subtitle="by order book depth" />
            <ChartPlaceholder title="Order Book Depth" subtitle="by crypto" />
            <ChartPlaceholder title="Bid–Ask Spread Heatmap" subtitle="by crypto" />
            <ChartPlaceholder title="Liquidity Stress Test" subtitle="1‑day forced liquidation cost" />
        </div>
    );
}
