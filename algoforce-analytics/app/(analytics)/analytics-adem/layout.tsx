"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-950 dark:to-blue-950">
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-[calc(100svh-3rem)]">
          <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6">{children}</div>
        </ScrollArea>
      </main>
    </div>
  );
}
