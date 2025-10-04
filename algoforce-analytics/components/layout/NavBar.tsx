"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Activity, Users, SunMoon, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { AccountsDialog } from "../analytics/AccountsDialog";
import { usePrefs } from "../prefs/PrefsContext";

type BulkAsOfPayload = { uPnl?: { as_of?: string } };

async function fetchJsonRetry<T>(
  url: string,
  retries = 4,
  baseDelayMs = 250
): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      if (i < retries)
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
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
      abs = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(dt);
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }

  return { dot, text, border, relLabel: rel, absLabel: abs, tz };
}

async function fetchBulkAsOf(
  accounts: readonly string[]
): Promise<string | undefined> {
  const list = Array.from(new Set(accounts.filter(Boolean)));
  if (list.length === 0) return undefined;
  const params = new URLSearchParams({ accounts: list.join(",") });
  const json = await fetchJsonRetry<BulkAsOfPayload>(
    `/api/metrics/bulk?${params.toString()}`
  );
  return json?.uPnl?.as_of;
}

export function Navbar() {
  const router = useRouter();
  const { navbarVisible, analyticsSelectedAccounts, analyticsAccounts } =
    usePrefs();
  const [asOf, setAsOf] = React.useState<string | undefined>(undefined);

  // fallback to fund2,fund3
  const effectiveAccounts = React.useMemo(
    () =>
      analyticsSelectedAccounts?.length
        ? analyticsSelectedAccounts
        : ["fund2", "fund3"],
    [analyticsSelectedAccounts]
  );
  const accountsKey = React.useMemo(() => {
    const uniq = Array.from(new Set(effectiveAccounts));
    uniq.sort();
    return uniq.join(",");
  }, [effectiveAccounts]);

  // poll freshness every 5s (interval restarts when accounts change)
  const pollIdRef = React.useRef<number | null>(null);
  const lastKeyRef = React.useRef<string>("");
  const doFetch = React.useCallback(async () => {
    if (!accountsKey) return;
    const list = accountsKey.split(",").filter(Boolean);
    const iso = await fetchBulkAsOf(list).catch(() => undefined);
    if (iso != null) setAsOf(iso);
  }, [accountsKey]);

  React.useEffect(() => {
    if (!accountsKey) return;
    if (lastKeyRef.current === accountsKey && pollIdRef.current != null) return;
    lastKeyRef.current = accountsKey;

    if (pollIdRef.current != null) {
      window.clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }

    void doFetch();
    const id = window.setInterval(() => {
      void doFetch();
    }, 5000);
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
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-[1600px] px-3 h-12 flex items-center gap-3">
        <Link
          href={brandHref}
          className="font-semibold tracking-wide cursor-pointer transition-colors hover:text-foreground/90"
          aria-label={`Go to ${brandTitle} home`}
        >
          {brandTitle}
        </Link>

        {/* freshness pill */}
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
          {Array.isArray(analyticsAccounts) &&
          (analyticsAccounts?.length ?? 0) > 0 ? (
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

          {/* Theme menu (direct, no config button) */}
          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}

function ThemeMenu() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [open, setOpen] = React.useState(false);

  const opts: { key: string; label: string }[] = [
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "system", label: `System${systemTheme ? ` (${systemTheme})` : ""}` },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-accent"
        title="Theme"
      >
        <SunMoon className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-40 rounded-md border bg-popover shadow-lg p-1 text-sm"
          onMouseLeave={() => setOpen(false)}
        >
          {opts.map((o) => (
            <button
              key={o.key}
              role="menuitemradio"
              aria-checked={theme === o.key}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent"
              onClick={() => {
                setTheme(o.key);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {theme === o.key ? <Check className="h-4 w-4" /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
