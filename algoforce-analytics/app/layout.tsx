// src/app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";

import { Navbar } from "@/components/layout/NavBar";
import { PrefsProvider } from "@/components/prefs";

export const metadata: Metadata = {
  title: "Algoforce Strategy Dashboard",
  description: "Strategy overview from Redis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ENSURE_SNIPPET = `
    (function () {
      try {
        var u = '/api/sync-monitor/ensure?src=beforeInteractive&mode=beacon';
        if (navigator.sendBeacon) { navigator.sendBeacon(u, '1'); } // POST beacon
        else { fetch(u, { method: 'GET', keepalive: true, cache: 'no-store' }).catch(function(){}); }
      } catch (_) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="sync-ensure"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: ENSURE_SNIPPET }}
        />
        <noscript>
          {/* No-JS fallback: low-cost HEAD beacon via preload */}
          <link
            rel="preload"
            href="/api/sync-monitor/ensure?src=noscript&mode=beacon"
            as="fetch"
            crossOrigin="anonymous"
          />
        </noscript>
      </head>
      <body className="bg-background overflow-hidden text-foreground h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <PrefsProvider>
            <Navbar />
            {children}
            <Toaster richColors position="bottom-right" closeButton />
          </PrefsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
