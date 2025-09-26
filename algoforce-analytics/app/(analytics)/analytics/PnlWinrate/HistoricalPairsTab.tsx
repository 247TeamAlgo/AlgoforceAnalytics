// app/analytics/HistoricalPairsTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import DivergingPnlBarsCard from "../DivergingPnlBarsCard";
import WinrateBarsCard from "../WinrateBarsCard";
import NoData from "../NoDataCard";
import type { Account } from "@/app/(analytics)/analytics/types";
import type { HistoricalBucket } from "@/app/(analytics)/analytics/types";

type ApiPayload = {
  perPair: HistoricalBucket[];
  perSymbol: HistoricalBucket[];
};

type ViewMode = "pair" | "symbol";
type MetricMode = "pnl" | "win";

export default function HistoricalPairsTab({
  accounts,
  defaultAccount,
}: {
  accounts: Account[];
  defaultAccount?: string; // e.g. selected[0]
}) {
  const [account, setAccount] = useState<string | undefined>(defaultAccount ?? accounts[0]?.redisName);
  const [view, setView] = useState<ViewMode>("pair");
  const [metric, setMetric] = useState<MetricMode>("pnl");

  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // fetch when account changes
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!account) {
        setData(null);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/historical_pairs?account=${encodeURIComponent(account)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = (await res.json()) as ApiPayload;
        if (alive) setData(json);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [account]);

  const rows = useMemo<HistoricalBucket[]>(() => {
    if (!data) return [];
    return view === "pair" ? data.perPair : data.perSymbol;
  }, [data, view]);

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <Card className="glass-card">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Account select */}
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap">Account</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.redisName} value={a.redisName}>
                    {a.display ?? a.redisName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View toggles */}
          <div className="flex items-center gap-2">
            <Label className="mr-2 hidden sm:inline">View</Label>
            <div className="inline-flex rounded-xl border bg-muted p-1">
              <Button
                type="button"
                size="sm"
                variant={view === "pair" ? "default" : "ghost"}
                onClick={() => setView("pair")}
                className="rounded-lg"
              >
                Per Pair
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "symbol" ? "default" : "ghost"}
                onClick={() => setView("symbol")}
                className="rounded-lg"
              >
                Per Symbol
              </Button>
            </div>
          </div>

          {/* Metric toggles */}
          <div className="flex items-center gap-2">
            <Label className="mr-2 hidden sm:inline">Metric</Label>
            <div className="inline-flex rounded-xl border bg-muted p-1">
              <Button
                type="button"
                size="sm"
                variant={metric === "pnl" ? "default" : "ghost"}
                onClick={() => setMetric("pnl")}
                className="rounded-lg"
              >
                PnL
              </Button>
              <Button
                type="button"
                size="sm"
                variant={metric === "win" ? "default" : "ghost"}
                onClick={() => setMetric("win")}
                className="rounded-lg"
              >
                Win-rate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {loading && <div>Loading historical trades…</div>}
      {error && <div className="text-red-600">Error: {error}</div>}
      {!loading && !error && (!data || rows.length === 0) && (
        <NoData title="Historical PnL & Win-rate" subtitle="No closed trades" />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-5">
          {metric === "pnl" ? (
            <DivergingPnlBarsCard
              title={view === "pair" ? "Per Pair — PnL (Positive vs Negative)" : "Per Symbol — PnL (Positive vs Negative)"}
              subtitle={view === "symbol" ? "50/50 PnL split across legs" : "Closed trades"}
              rows={rows}
            />
          ) : (
            <WinrateBarsCard
              title={view === "pair" ? "Per Pair — Win-rate" : "Per Symbol — Win-rate"}
              subtitle={view === "symbol" ? "50/50 attribution" : "Closed trades"}
              rows={rows}
            />
          )}
        </div>
      )}
    </div>
  );
}
