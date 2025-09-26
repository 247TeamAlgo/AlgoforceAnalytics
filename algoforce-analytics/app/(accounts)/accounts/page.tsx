import type { Metadata } from "next";
import { readAccounts, type Account } from "@/lib/jsonStore";
import TablesPageClient from "./(components)/TablePageClient";
import { setAccountMonitoredSA, bulkSetAccountMonitoredSA } from "./actions";

export const metadata: Metadata = {
  title: "AlgoForce Accounts",
  icons: { icon: "/icon.ico" },
};

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const accounts = (await readAccounts()) as Account[];
  return (
    <TablesPageClient
      initialAccounts={accounts}
      setAccountMonitored={setAccountMonitoredSA}
      bulkSetAccountMonitored={bulkSetAccountMonitoredSA}
    />
  );
}
