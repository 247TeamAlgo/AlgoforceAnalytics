import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Trading Strategy Analytics",
  description: "Live MTD metrics (combined + per-account)",
};

export default function AnalyticsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-[1600px] px-3 py-4">{children}</section>
  );
}
