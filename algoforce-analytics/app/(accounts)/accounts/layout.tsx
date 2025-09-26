// app/(dashboard)/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Algoforce Strategy Dashboard",
  description: "Strategy overview from Redis",
};

/** Visually-hidden until focused: keyboard users can jump past the nav */
function SkipToContent() {
  return (
    <a
      href="#app-main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to content
    </a>
  );
}

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Constrain to viewport height so the inner <main> can actually scroll.
    <div className="flex h-[100dvh] flex-col">
      <SkipToContent />

      {/* Scrollable content area aligned to navbar container width */}
      <main
        id="app-main"
        role="main"
        className="
          flex-1 min-h-0
          overflow-y-auto overscroll-y-contain
          px-3 sm:px-6
          pb-[max(1rem,env(safe-area-inset-bottom))]
          pt-3 sm:pt-4
          bg-gradient-to-b from-background via-background to-muted/30 dark:to-muted/20
        "
        // Keep scrollbars from reflowing layout when they appear (where supported).
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="mx-auto w-full max-w-[1600px] min-h-0">
          {/* Optional card wrapper for visual separation on large screens.
              If a page needs edge-to-edge, remove this wrapper per-page. */}
          <div className="min-h-0 rounded-xl bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="min-h-0 p-3 sm:p-5 lg:p-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
