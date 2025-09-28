"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ControlsMenu } from "@/components/layout/ControlsMenu";
import { usePrefs } from "@/components/prefs/PrefsContext";
import { RangeBadge } from "../analytics/RangeBadge";
import { AnalyticsToolbar } from "../analytics/AnalyticsToolBar";

export function Navbar() {
  const router = useRouter();
  const { navbarVisible } = usePrefs();

  if (!navbarVisible) return null;

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

        {/* Always-visible range summary */}
        <RangeBadge />

        <div className="ml-auto flex items-center gap-2">
          {/* Modal triggers */}
          <AnalyticsToolbar />

          {/* Keep your global settings menu */}
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
