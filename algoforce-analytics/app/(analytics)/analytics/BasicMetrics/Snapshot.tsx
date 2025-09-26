"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { fmtPct, fmtUsd } from "../types";
import type { MetricsPayload } from "../types";
import type { ReportOverlay } from "../types";

function KV({ label, value }: { label: string; value: string }) {
    const v = value.trim();
    const isNegative = v.startsWith("-");
    const isMoneyOrPct = v.includes("%") || v.includes("$");
    const accent = isNegative ? "text-destructive" : isMoneyOrPct ? "text-chart-3" : "text-foreground";

    return (
        <div className="h-full min-h-20 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur-sm">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground/90">{label}</p>
            <p
                className={`mt-1 text-right text-lg font-semibold ${accent} font-mono tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis`}
                aria-label={`${label} ${v}`}
            >
                {v}
            </p>
        </div>
    );
}

function rangeSummary(metrics: MetricsPayload) {
    const rows = metrics.daily_return_last_n_days.daily_rows ?? [];
    const start = metrics.daily_return_last_n_days.window_start;
    const end = metrics.daily_return_last_n_days.window_end;

    const profit = rows.reduce((s, r) => s + r.net_pnl, 0);
    const fees = rows.reduce((s, r) => s + r.fees, 0);

    const equityEnd = rows.length ? rows[rows.length - 1].end_balance : metrics.initial_balance;
    const equityStart = rows.length ? rows[0].start_balance : metrics.initial_balance;
    const rangeReturnPct = equityStart !== 0 ? ((equityEnd / equityStart) - 1) * 100 : null;

    let peak = equityStart;
    let maxDD = 0;
    let curDD = 0;
    for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        if (r.end_balance > peak) peak = r.end_balance;
        const dd = peak !== 0 ? ((r.end_balance - peak) / peak) * 100 : 0;
        if (dd < maxDD) maxDD = dd;
        if (i === rows.length - 1) curDD = dd;
    }

    return {
        label: `Range: ${start} → ${end}`,
        profit,
        fees,
        equityEnd,
        rangeReturnPct,
        rangeMaxDD: maxDD || 0,
        rangeCurDD: curDD || 0,
    } as const;
}

function SectionHeader({ title, subtitle, right }: { title?: string; subtitle?: string; right?: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div>
                {title ? <CardTitle className="leading-tight">{title}</CardTitle> : null}
                {subtitle ? <CardDescription className="mt-0.5 text-sm leading-snug">{subtitle}</CardDescription> : null}
            </div>
            {right ? <div className="shrink-0">{right}</div> : null}
        </div>
    );
}

function StatsGrid({ children }: { children: React.ReactNode }) {
    // Auto-fit columns ensure tiles wrap before they get too narrow.
    return (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] auto-rows-[minmax(0,1fr)] gap-3 md:gap-4">
            {children}
        </div>
    );
}

export default function Snapshot({
    metrics,
    label,
    report,
}: {
    metrics: MetricsPayload;
    label: string;
    report?: ReportOverlay;
}) {
    const range = rangeSummary(metrics);

    return (
        <Card className="glass-card w-full overflow-hidden border-border/60 shadow-lg">
            <CardHeader className="pb-3">
                <SectionHeader
                    title={label}
                    subtitle={range.label}
                    right={
                        <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-semibold">
                            {metrics.counts.number_of_trades_total.toLocaleString()} trades
                        </Badge>
                    }
                />
            </CardHeader>

            <CardContent className="pt-0 overflow-hidden">
                <div className="flex items-center justify-between pb-2">
                    <CardDescription className="font-medium">Selected Range</CardDescription>
                </div>
                <StatsGrid>
                    <KV label="Range Return" value={fmtPct(range.rangeReturnPct)} />
                    <KV label="Range Profit" value={fmtUsd(range.profit)} />
                    <KV label="Fees (Range)" value={fmtUsd(range.fees)} />
                    <KV label="Equity @ Range End" value={fmtUsd(range.equityEnd)} />
                    {/* <KV label="Max DD (Range)" value={fmtPct(range.rangeMaxDD)} />
                    <KV label="Current DD (Range)" value={fmtPct(range.rangeCurDD)} /> */}
                </StatsGrid>
            </CardContent>

            <Separator className="my-2" />

            <CardContent className="pt-0 overflow-hidden">
                <div className="flex items-center justify-between pb-2">
                    <CardDescription className="font-medium">Month-to-Date</CardDescription>
                </div>
                <StatsGrid>
                    <KV label="MTD Return" value={fmtPct(metrics.month_to_date.mtd_return_pct)} />
                    <KV label="MTD Profit" value={fmtUsd(metrics.mtd_return_dollars)} />
                    <KV label="Fees (MTD)" value={fmtUsd(metrics.month_to_date.mtd_total_fees_usd)} />
                    {/* <KV label="Current DD (MTD)" value={fmtPct(metrics.month_to_date.mtd_drawdown_pct)} /> */}
                </StatsGrid>
            </CardContent>

            {report ? (
                <>
                    <Separator className="my-2" />
                    <CardContent className="pt-0 overflow-hidden">
                        <div className="flex items-center justify-between pb-2">
                            <CardDescription className="font-medium">
                                Live Snapshot{report.date_str ? ` • ${report.date_str}` : ""}
                            </CardDescription>
                        </div>
                        <StatsGrid>
                            <KV label="Wallet" value={fmtUsd(report.wallet_balance ?? 0)} />
                            <KV label="Profit" value={fmtUsd(report.profit ?? 0)} />
                            <KV label="% Return" value={fmtPct(report.pct_return ?? null)} />
                            <KV
                                label="Winrate (Live)"
                                value={report.overall_winrate_pct == null ? "—" : `${report.overall_winrate_pct.toFixed(2)}%`}
                            />
                            <KV label="Trades (Live)" value={(report.overall_trades ?? 0).toLocaleString()} />
                            <KV label="Earning Bal" value={fmtUsd(report.earning_balance ?? 0)} />
                            <KV label="Spot Bal" value={fmtUsd(report.spot_balance ?? 0)} />
                            <KV label="Current uPNL" value={fmtUsd(report.current_unrealized_pnl ?? 0)} />
                            {report.initial_balance != null ? <KV label="Initial Balance (Live)" value={fmtUsd(report.initial_balance)} /> : null}
                        </StatsGrid>
                    </CardContent>
                </>
            ) : null}
        </Card>
    );
}
