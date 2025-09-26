"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ControlsMenu } from "@/components/layout/ControlsMenu";
import { usePrefs } from "@/components/prefs";

/* ----------------- helpers ------------------------------------ */

/** root section: 'dashboard' | 'accounts' | 'analytics' | 'other' */
function useRootSection(): "dashboard" | "accounts" | "analytics" | "other" {
  const pathname = usePathname() ?? "/";
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  if (first === "dashboard") return "dashboard";
  if (first === "accounts") return "accounts";
  if (first === "analytics") return "analytics";
  return "other";
}

function useAccountFromPath(): string {
  const path = usePathname() ?? "/dashboard/af1";
  const parts = path.split("/").filter(Boolean);
  const i = parts.findIndex((p) => p === "dashboard");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : "af1";
}

/* ----------------- component ---------------------------------- */
export function Navbar() {
  const router = useRouter();
  const section = useRootSection();

  const account = useAccountFromPath().toLowerCase();
  const { setQuery, navbarVisible } = usePrefs();

  /* clear search box when account changes */
  useEffect(() => {
    setQuery("");
  }, [account, setQuery]);

  /* dynamic brand */
  const brandTitle =
    section === "accounts"
      ? "Add/Edit Accounts"
      : section === "analytics"
        ? "Trading Strategy Analytics"
        : "Strategy Dashboard";

  const brandHref =
    section === "accounts"
      ? "/accounts"
      : section === "analytics"
        ? "/analytics"
        : "/dashboard";

  if (!navbarVisible) return null;

  return (
    <header
      className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      role="banner"
    >
      <div className="mx-auto max-w-[1600px] px-3 h-12 flex items-center gap-3">
        {/* ----------- dynamic brand link ------------------------ */}
        <Link
          href={brandHref}
          className="font-semibold tracking-wide cursor-pointer transition-colors hover:text-foreground/90"
          aria-label={`Go to ${brandTitle} home`}
        >
          {brandTitle}
        </Link>

        {/* -------------- right-side controls -------------------- */}
        <div className="ml-auto flex items-center gap-2">
          {/* settings trigger — always visible; menu filters inside */}
          <ControlsMenu
            account={account}
            onChangeAccount={(a) => router.push(`/dashboard/${a}`)}
            triggerClassName="h-9 w-9"
            triggerIcon={<Settings className="h-4 w-4" aria-hidden />}
          />
        </div>
      </div>
    </header>
  );
}
