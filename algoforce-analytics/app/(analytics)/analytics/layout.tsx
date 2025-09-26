// app/analytics/layout.tsx
import type { ReactNode } from "react";

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
    return (
        // Fixed-height viewport container that *always* scrolls vertically
        <div className="h-dvh w-full overflow-y-auto overflow-x-hidden bg-background">
            {children}
        </div>
    );
}
