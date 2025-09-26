// src/app/.../AnalyticsPage.tsx
"use client";
import HistoricalPairsTab from "./PnlWinrate/HistoricalPairsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useMemo, useState } from "react";
import ConcentrationLeverageTab from "./ConcentrationLeverage/ConcentrationLeverageTab";
import Controls from "./Controls";
import LiquidityRiskTab from "./LiquidityRiskTab";
import MarketRiskTab from "./MarketRisk/MarketRiskTab";
import OpsForecastTab from "./OpsCrypto/OpsCryptoTab";
import SimForecastTab from "./SimForecast/SimForecastTab";
import OverviewTab from "./BasicMetrics/OverviewTab";
import PerformanceTab from "./PerformanceTab";
import RawJsonPanel from "./RawJsonPanel";
import StrategyRiskTab from "./StrategyRiskTab";
import type { Account, MetricsPayload, MultiMetricsResponse } from "./types";
import { isMultiSelectionResponse } from "./types";

/* ----------------------------- typed fetchers ----------------------------- */
async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Account[];
  return Array.isArray(data) ? data.filter((a) => !!a?.redisName) : [];
}

// NOTE: We DO NOT send earliest=true by default anymore.
// If earliest is true, we only include it when no explicit startDate exists.
async function fetchMetricsForSelected(
  accounts: string[],
  range: { start?: string; end?: string },
  earliest: boolean
): Promise<MultiMetricsResponse> {
  const params = new URLSearchParams();
  if (accounts.length > 0) params.set("accounts", accounts.join(","));
  const hasExplicitRange = Boolean(range.start && range.end);

  if (hasExplicitRange) {
    params.set("startDate", range.start as string);
    params.set("endDate", range.end as string);
  } else if (earliest && range.end) {
    params.set("earliest", "true");
    params.set("endDate", range.end);
  } else {
    // nothing valid; caller should guard against this.
  }

  const res = await fetch(`/api/metrics?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as MultiMetricsResponse;
}

export default function AnalyticsPage() {
  // Date range state (no tz)
  const [range, setRange] = useState<{ start?: string; end?: string }>({});
  const [earliest, setEarliest] = useState<boolean>(false); // default OFF

  // Accounts selection
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  // Data
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState<MultiMetricsResponse | null>(null);

  /* ----------------------- bootstrap on mount ----------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await fetchAccounts();
        if (!alive) return;
        setAccounts(all);

        const monitored = all
          .filter((a) => a.monitored)
          .map((a) => a.redisName);
        setSelected(monitored);

        // Default to last 30 days and ensure earliest=false on startup
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        setRange({
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
        });
        setEarliest(false);
        // No metrics fetch here; Controls/onAutoFetch will trigger once state is valid.
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to initialize");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ----------------------- auto-fetch handler ----------------------- */
  const onAutoFetch = async (): Promise<void> => {
    // Only fetch when we have accounts AND a valid explicit [start,end]
    // or (no start && earliest && end)
    if (!selected.length) return;

    const hasExplicitRange = Boolean(range.start && range.end);
    if (!hasExplicitRange && !(earliest && range.end)) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchMetricsForSelected(selected, range, earliest);
      setRawJson(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  };

  /* --------------------- derived data for tabs ---------------------- */
  const merged = useMemo<MetricsPayload | null>(() => {
    if (!rawJson) return null;
    return isMultiSelectionResponse(rawJson) ? rawJson.merged : rawJson;
  }, [rawJson]);

  const perAccounts = useMemo<
    Record<string, MetricsPayload> | undefined
  >(() => {
    if (!rawJson) return undefined;
    return isMultiSelectionResponse(rawJson) ? rawJson.per_account : undefined;
  }, [rawJson]);

  const dailyStrip = useMemo(() => {
    if (!merged) return [] as Array<{ day: string; v: number }>;
    return merged.daily_return_dollars.map((d) => ({
      day: d.day,
      v: d.daily_profit_loss_usd,
    }));
  }, [merged]);

  return (
    <div className="min-h-full w-full bg-background p-5">
      <section className="p-5 space-y-5 max-w-[1600px] mx-auto">
        <Controls
          accounts={accounts}
          selected={selected}
          setSelected={setSelected}
          range={range}
          setRange={setRange}
          earliest={earliest}
          setEarliest={setEarliest} // FIXED: previously passed a boolean
          loading={loading}
          error={error}
          onAutoFetch={onAutoFetch}
        />

        <Tabs defaultValue="basics" className="space-y-5">
          {/* SCROLL WRAPPER start */}
          <div className="-mx-3 px-3">
            <div className="overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
              <TabsList className="flex min-w-max whitespace-nowrap gap-2 glass-card p-1 h-12">
                <TabsTrigger value="basics">Basic Metrics</TabsTrigger>
                <TabsTrigger value="pnl-win">PNL and Winrate</TabsTrigger>
                <TabsTrigger value="return-dd">
                  Returns and Drawdown
                </TabsTrigger>

                <TabsTrigger value="performance">
                  Performance &amp; Distribution
                </TabsTrigger>
                <TabsTrigger value="market-risk">Market Risk</TabsTrigger>
                <TabsTrigger value="strategy-risk">Strategy Risk</TabsTrigger>
                <TabsTrigger value="liquidity-risk">Liquidity Risk</TabsTrigger>
                <TabsTrigger value="concentration-leverage">
                  Concentration &amp; Leverage
                </TabsTrigger>
                <TabsTrigger value="ops-crypto">
                  Ops &amp; Crypto-Specific
                </TabsTrigger>
                <TabsTrigger value="simulation-forecast">
                  Simulation &amp; Forecast
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="basics">
            <OverviewTab
              merged={merged}
              perAccounts={perAccounts}
              accounts={accounts}
              dailyStrip={dailyStrip}
              selectedCount={selected.length}
            />
          </TabsContent>
          <TabsContent value="pnl-win">
            <HistoricalPairsTab
              accounts={accounts}
              defaultAccount={selected[1]}
            />
          </TabsContent>
          <TabsContent value="performance">
            <PerformanceTab merged={merged} perAccounts={perAccounts} />
          </TabsContent>
          <TabsContent value="market-risk">
            <MarketRiskTab merged={merged} />
          </TabsContent>
          <TabsContent value="strategy-risk">
            <StrategyRiskTab />
          </TabsContent>
          <TabsContent value="liquidity-risk">
            <LiquidityRiskTab />
          </TabsContent>
          <TabsContent value="concentration-leverage">
            <ConcentrationLeverageTab merged={merged} />
          </TabsContent>
          <TabsContent value="ops-crypto">
            <OpsForecastTab />
          </TabsContent>
          <TabsContent value="simulation-forecast">
            <SimForecastTab merged={merged} />
          </TabsContent>
        </Tabs>

        <RawJsonPanel title="Raw JSON" json={rawJson} />
      </section>
    </div>
  );
}
