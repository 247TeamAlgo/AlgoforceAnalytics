"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings, Activity, Users } from "lucide-react";

import { ControlsMenu } from "@/components/layout/ControlsMenu";
import { usePrefs } from "@/components/prefs/PrefsContext";
import { AccountsDialog } from "../analytics/AccountsDialog";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function fetchJsonRetry<T>(url: string, retries = 4, baseDelayMs = 250): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      if (i < retries) await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw last instanceof Error ? last : new Error("Request failed");
}

function msSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return Date.now() - t;
}
function freshnessMeta(iso?: string) {
  const ms = msSince(iso);
  let rel = "unknown";
  let dot = "bg-muted-foreground/40";
  let text = "text-muted-foreground";
  let border = "border-muted/40";
  let abs: string | undefined;
  let tz: string | undefined;

  if (ms !== undefined) {
    const s = Math.max(0, Math.floor(ms / 1000));
    rel = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

    if (s <= 3) {
      dot = "bg-emerald-500";
      text = "text-emerald-600 dark:text-emerald-400";
      border = "border-emerald-500/40";
    } else if (s <= 12) {
      dot = "bg-yellow-500";
      text = "text-yellow-600 dark:text-yellow-400";
      border = "border-yellow-500/40";
    } else {
      dot = "bg-red-500";
      text = "text-red-600 dark:text-red-400";
      border = "border-red-500/40";
    }

    const dt = iso ? new Date(iso) : undefined;
    if (dt && !Number.isNaN(dt.getTime())) {
      abs = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(dt);
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }

  return { dot, text, border, relLabel: rel, absLabel: abs, tz };
}

type BulkAsOfPayload = { uPnl?: { as_of?: string } };

async function fetchBulkAsOf(accounts: readonly string[]): Promise<string | undefined> {
  const list = Array.from(new Set(accounts.filter(Boolean)));
  if (list.length === 0) return undefined;
  const params = new URLSearchParams({ accounts: list.join(",") });
  const json = await fetchJsonRetry<BulkAsOfPayload>(`/api/metrics/bulk?${params.toString()}`);
  return json?.uPnl?.as_of;
}

export function Navbar() {
  const router = useRouter();
  const { navbarVisible, analyticsSelectedAccounts, analyticsAccounts } = usePrefs();

  const [asOf, setAsOf] = useState<string | undefined>(undefined);

  const accountsKey = useMemo<string>(() => {
    const uniq = Array.from(new Set((analyticsSelectedAccounts ?? []).filter(Boolean)));
    uniq.sort();
    return uniq.join(",");
  }, [analyticsSelectedAccounts]);

  const pollIdRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string>("");

  const doFetch = useCallback(async (): Promise<void> => {
    if (!accountsKey) return;
    const list = accountsKey.split(",").filter(Boolean);
    const iso = await fetchBulkAsOf(list).catch(() => undefined);
    if (iso != null) setAsOf(iso);
  }, [accountsKey]);

  useEffect(() => {
    if (!accountsKey) return;

    // If key unchanged and polling already running, no-op
    if (lastKeyRef.current === accountsKey && pollIdRef.current != null) return;
    lastKeyRef.current = accountsKey;

    // Reset any prior poller
    if (pollIdRef.current != null) {
      window.clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }

    // Immediate fetch + poll every 5s
    void doFetch();
    const id = window.setInterval(() => { void doFetch(); }, 5000);
    pollIdRef.current = id;

    return () => {
      if (pollIdRef.current != null) {
        window.clearInterval(pollIdRef.current);
        pollIdRef.current = null;
      }
    };
  }, [accountsKey, doFetch]);

  if (!navbarVisible) return null;

  const fresh = freshnessMeta(asOf);
  const brandTitle = "Trading Strategy Analytics";
  const brandHref = "/analytics";

  return (
    <header
      className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      role="banner"
    >
      <div className="mx-auto max-w-[1600px] px-3 h-12 flex items-center gap-3">
        <Link
          href={brandHref}
          className="font-semibold tracking-wide cursor-pointer transition-colors hover:text-foreground/90"
          aria-label={`Go to ${brandTitle} home`}
        >
          {brandTitle}
        </Link>

        {/* LIVE freshness pill */}
        <span
          className={[
            "ml-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] border",
            fresh.border,
          ].join(" ")}
          title={
            fresh.absLabel
              ? `${fresh.absLabel}${fresh.tz ? ` • ${fresh.tz}` : ""}`
              : "unknown"
          }
          aria-label="UPnL freshness"
        >
          <span className={["h-2 w-2 rounded-full", fresh.dot].join(" ")} />
          <Activity className={["h-3.5 w-3.5", fresh.text].join(" ")} />
          <span className={fresh.text}>{fresh.relLabel}</span>
          {fresh.absLabel ? (
            <span className="hidden sm:inline text-muted-foreground">
              &nbsp;•&nbsp;{fresh.absLabel}
              {fresh.tz ? ` • ${fresh.tz}` : ""}
            </span>
          ) : null}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Accounts selector */}
          {Array.isArray(analyticsAccounts) && (analyticsAccounts?.length ?? 0) > 0 ? (
            <AccountsDialog />
          ) : (
            <button
              type="button"
              className="h-9 inline-flex items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground cursor-not-allowed"
              title="Loading accounts…"
            >
              <Users className="h-4 w-4" />
              Accounts
            </button>
          )}

          {/* Global settings menu */}
          <ControlsMenu
            account="analytics"
            onChangeAccount={(a) => router.push(`/dashboard/${a}`)}
            triggerClassName="h-9 w-9"
            triggerIcon={<Settings className="h-4 w-4" aria-hidden />}
          />
        </div>
      </div>
    </header>
  );
}
