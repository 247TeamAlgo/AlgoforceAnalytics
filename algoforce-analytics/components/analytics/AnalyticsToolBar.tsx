"use client";

import { AccountsDialog } from "./AccountsDialog";
import { DateRangeDialog } from "./DateRangeDialog";

export function AnalyticsToolbar() {
  return (
    <div className="flex items-center gap-2">
      <DateRangeDialog />
      <AccountsDialog />
    </div>
  );
}
