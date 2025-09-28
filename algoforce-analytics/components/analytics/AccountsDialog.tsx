"use client";

import * as React from "react";
import { BadgeCheck, ShieldCheck, Server, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { usePrefs } from "@/components/prefs/PrefsContext";
import { displayName } from "@/app/(analytics)/analytics/lib/performance_metric_types";

export function AccountsDialog() {
  const {
    analyticsAccounts: accounts,
    analyticsSelectedAccounts,
    setAnalyticsSelectedAccounts,
    analyticsLoading,
  } = usePrefs();

  const [open, setOpen] = React.useState<boolean>(false);
  const [q, setQ] = React.useState<string>("");
  const [draft, setDraft] = React.useState<string[]>(analyticsSelectedAccounts);

  React.useEffect(() => {
    if (open) setDraft(analyticsSelectedAccounts);
  }, [open, analyticsSelectedAccounts]);

  const selectedSet = React.useMemo(() => new Set<string>(draft), [draft]);

  const ordered = React.useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    const monitored = list.filter((a) => Boolean(a?.monitored));
    const rest = list.filter((a) => !a?.monitored);
    return monitored.concat(rest);
  }, [accounts]);

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ordered;
    return ordered.filter((a) => {
      const label = `${a.redisName} ${a.display ?? ""}`.toLowerCase();
      return label.includes(term);
    });
  }, [ordered, q]);

  const toggle = (id: string): void => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = (): void => setDraft(ordered.map((a) => a.redisName));
  const selectMonitored = (): void =>
    setDraft(
      ordered.filter((a) => Boolean(a.monitored)).map((a) => a.redisName)
    );
  const clearAll = (): void => setDraft([]);

  const apply = (): void => {
    setAnalyticsSelectedAccounts(draft);
    setOpen(false);
  };

  const disabled = analyticsLoading || accounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Open accounts selection dialog"
          className="h-9 gap-2"
        >
          <Users className="h-4 w-4" aria-hidden />
          Accounts
          <Badge variant="secondary" className="ml-1">
            {analyticsSelectedAccounts.length}/{accounts.length}
          </Badge>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Select Accounts</DialogTitle>
          <DialogDescription>
            Choose which accounts are included in analytics. Monitored accounts
            are highlighted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Selected: <span className="font-medium">{draft.length}</span> of{" "}
              {accounts.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={selectMonitored}
                disabled={disabled}
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                Monitored
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={selectAll}
                disabled={disabled}
              >
                <BadgeCheck className="h-4 w-4 mr-1" />
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={disabled || draft.length === 0}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 opacity-60" />
            <Input
              className="pl-8"
              placeholder="Search accounts…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <Separator />

          <ScrollArea className="h-[360px] rounded-md border p-2">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {filtered.map((a) => {
                const checked = selectedSet.has(a.redisName);
                const label = displayName(a);
                const Icon = a.monitored ? ShieldCheck : Server;

                return (
                  <label
                    key={a.redisName}
                    title={`${a.redisName}${a.display ? ` • ${String(a.display)}` : ""}`}
                    className={[
                      "flex items-center gap-2 rounded-md border p-2 cursor-pointer transition",
                      checked
                        ? "bg-secondary/60 border-secondary"
                        : "hover:bg-muted/40",
                    ].join(" ")}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(a.redisName)}
                      aria-label={`Toggle ${label}`}
                    />
                    <Icon className="h-4 w-4 opacity-80" />
                    <span className="truncate">{label}</span>
                    {a.monitored ? (
                      <Badge className="ml-auto" variant="outline">
                        Monitored
                      </Badge>
                    ) : null}
                  </label>
                );
              })}
              {filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground p-2">
                  No accounts match your search.
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={disabled}>
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
