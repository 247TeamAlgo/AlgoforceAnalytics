"use client";

import Link from "next/link";

import { usePrefs } from "@/components/prefs/PrefsContext";
import { SiBinance } from "react-icons/si";
import { AccountsDialog } from "../analytics/AccountsDialog";
import { ThemeMenu } from "./ThemeSubmenu";

/* ---------- helpers ---------- */

function freshnessClasses(status: "green" | "yellow" | "red" | "unknown"): {
  dot: string;
  text: string;
  border: string;
} {
  switch (status) {
    case "green":
      return {
        dot: "bg-emerald-500",
        text: "text-emerald-600 dark:text-emerald-400",
        border: "border-emerald-500/40",
      };
    case "yellow":
      return {
        dot: "bg-yellow-500",
        text: "text-yellow-600 dark:text-yellow-400",
        border: "border-yellow-500/40",
      };
    case "red":
      return {
        dot: "bg-red-500",
        text: "text-red-600 dark:text-red-400",
        border: "border-red-500/40",
      };
    default:
      return {
        dot: "bg-muted-foreground/40",
        text: "text-muted-foreground",
        border: "border-muted/40",
      };
  }
}

function absLabel(iso?: string): { abs?: string; tz?: string } {
  if (!iso) return {};
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return {};
  const dt = new Date(t);
  const abs = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(dt);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { abs, tz };
}

/* ---------- component ---------- */

export function Navbar() {
  const {
    navbarVisible,
    analyticsAccounts,
    metricsAsOf, // server-provided as_of
    metricsStatus,
  } = usePrefs();

  if (!navbarVisible) return null;

  const brandTitle = "Trading Strategy Analytics";
  const brandHref = "/analytics";

  const cls = freshnessClasses(metricsStatus);
  const { abs, tz } = absLabel(metricsAsOf);

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
            cls.border,
          ].join(" ")}
          title={abs ? `${abs}${tz ? ` ${tz}` : ""}` : "No timestamp available"}
          aria-label="UPnL freshness"
        >
          <span className={["h-2 w-2 rounded-full", cls.dot].join(" ")} />
          {abs ? (
            <span className="hidden sm:inline text-muted-foreground">
              {abs}
              {tz ? ` ${tz}` : ""}
            </span>
          ) : null}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {Array.isArray(analyticsAccounts) &&
          (analyticsAccounts?.length ?? 0) > 0 ? (
            <AccountsDialog />
          ) : (
            <button
              type="button"
              className="h-9 inline-flex items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground cursor-not-allowed"
              title="Loading accounts…"
            >
              <SiBinance className="h-4 w-4 text-amber-400" />
              Accounts
            </button>
          )}

          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}
