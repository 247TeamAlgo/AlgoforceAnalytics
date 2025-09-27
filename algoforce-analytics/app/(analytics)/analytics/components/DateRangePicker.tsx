// app/(analytics)/analytics/components/DateRangePicker.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "../lib/types";
import { addDays, startOfMonth, startOfYear } from "date-fns";
import { CalendarIcon } from "lucide-react";

type DateRange = { start?: string; end?: string };

type Props = {
  value: DateRange;
  onChange: (next: DateRange) => void;
  earliest: boolean;
  onToggleEarliest: (b: boolean) => void;
  disabled?: boolean;
  className?: string;
};

const UTC_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fromISO(s?: string) {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}
function pretty(s?: string) {
  if (!s) return "";
  return UTC_FMT.format(new Date(`${s}T00:00:00Z`));
}
function todayISO(): string {
  return toISO(new Date());
}

export default function DateRangePicker({
  value,
  onChange,
  earliest,
  onToggleEarliest,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange>(value);
  const [draftEarliest, setDraftEarliest] = React.useState<boolean>(earliest);

  React.useEffect(() => setDraft(value), [value.start, value.end, value]);
  React.useEffect(() => setDraftEarliest(earliest), [earliest]);

  const start = fromISO(draft.start);
  const end = fromISO(draft.end);

  const triggerLabel = React.useMemo(() => {
    const s =
      pretty(value.start) ||
      (earliest && !value.start ? "Earliest" : "Pick start");
    const e = pretty(value.end) || "Pick end";
    return `${s} → ${e}`;
  }, [value.start, value.end, earliest]);

  const onSelectRange = (r: { from?: Date; to?: Date } | undefined) => {
    if (!r) return;
    setDraftEarliest(false);
    const s = r.from ? toISO(r.from) : undefined;
    const e = r.to ? toISO(r.to) : r.from ? toISO(r.from) : draft.end;
    setDraft({ start: s, end: e });
  };

  const applyPreset = (days: number) => {
    const e = new Date();
    const s = addDays(e, -days + 1);
    setDraftEarliest(false);
    setDraft({ start: toISO(s), end: toISO(e) });
  };
  const applyMTD = () => {
    const now = new Date();
    setDraftEarliest(false);
    setDraft({ start: toISO(startOfMonth(now)), end: toISO(now) });
  };
  const applyYTD = () => {
    const now = new Date();
    setDraftEarliest(false);
    setDraft({ start: toISO(startOfYear(now)), end: toISO(now) });
  };
  const applyAllTime = () => {
    setDraft({ start: undefined, end: todayISO() });
    setDraftEarliest(true);
  };

  const onDraftEarliestChange = (b: boolean) => {
    setDraftEarliest(b);
    if (b) setDraft((d) => ({ start: undefined, end: d.end ?? todayISO() }));
  };

  const onApply = () => {
    onToggleEarliest(draftEarliest);
    onChange(draft);
  };
  const onClear = () => {
    setDraft({ start: undefined, end: undefined });
    setDraftEarliest(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-between h-10", className)}
        >
          <span className="truncate" suppressHydrationWarning>
            <CalendarIcon className="inline -mt-0.5 mr-2 h-4 w-4 opacity-70" />
            {triggerLabel}
          </span>
          <span className="text-xs text-muted-foreground">Change</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="p-0 w-auto">
        <div className="flex flex-col sm:flex-row">
          <div className="p-3 sm:p-4 border-b sm:border-b-0 sm:border-r">
            <Calendar
              mode="range"
              numberOfMonths={2}
              disabled={disabled}
              selected={{ from: start, to: end }}
              onSelect={onSelectRange}
              initialFocus
            />
          </div>

          <div className="p-3 sm:p-4 min-w-[240px] space-y-3">
            <div className="text-xs font-medium text-muted-foreground">
              Quick ranges (draft)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(7)}
              >
                Last 7d
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(30)}
              >
                Last 30d
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(90)}
              >
                Last 90d
              </Button>
              <Button variant="secondary" size="sm" onClick={applyMTD}>
                MTD
              </Button>
              <Button variant="secondary" size="sm" onClick={applyYTD}>
                YTD
              </Button>
              <Button variant="secondary" size="sm" onClick={applyAllTime}>
                All time
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="earliest"
                checked={draftEarliest}
                onCheckedChange={onDraftEarliestChange}
              />
              <Label htmlFor="earliest" className="text-sm cursor-pointer">
                Use earliest available as start
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear
              </Button>
              <Button size="sm" onClick={onApply}>
                Apply
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground pt-1">
              Draft:{" "}
              {draftEarliest && !draft.start
                ? "Earliest"
                : pretty(draft.start) || "—"}{" "}
              → {pretty(draft.end) || "—"}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
