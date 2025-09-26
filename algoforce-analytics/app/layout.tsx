// src/app/layout.tsx
import type { Metadata } from "next";

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
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
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
