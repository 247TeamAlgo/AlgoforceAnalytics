// algoforce-analytics\app\(analytics)\analytics\layout.tsx
import type { ReactNode } from "react";

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    // Fixed-height viewport container that *always* scrolls vertically
    <div className="h-dvh min-h-screen w-full flex-col">
      <div className="flex min-h-0 w-full flex-1">
        <div className="bg-background flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
