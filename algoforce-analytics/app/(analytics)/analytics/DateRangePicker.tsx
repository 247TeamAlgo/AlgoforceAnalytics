"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { addDays, startOfMonth, startOfYear } from "date-fns";
import { CalendarIcon } from "lucide-react";

type DateRange = { start?: string; end?: string };

type Props = {
    /** Applied value from parent (not drafts) */
    value: DateRange;
    /** Called ONLY when user presses Apply */
    onChange: (next: DateRange) => void;
    /** Applied earliest flag from parent (not drafts) */
    earliest: boolean;
    /** Called on Apply with final earliest value */
    onToggleEarliest: (b: boolean) => void;
    disabled?: boolean;
    className?: string;
};

function toISO(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function fromISO(s?: string) {
    if (!s) return undefined;
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
}
function pretty(s?: string) {
    const d = fromISO(s);
    return d ? d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }) : "";
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

    // Draft state (what user is editing inside the popover)
    const [draft, setDraft] = React.useState<DateRange>(value);
    const [draftEarliest, setDraftEarliest] = React.useState<boolean>(earliest);

    // Keep drafts in sync when parent value/flags change externally
    React.useEffect(() => setDraft(value), [value.start, value.end, value]);
    React.useEffect(() => setDraftEarliest(earliest), [earliest]);

    // Derived for the calendar
    const start = fromISO(draft.start);
    const end = fromISO(draft.end);

    // What to show on the trigger button (always the *applied* values)
    const triggerLabel = React.useMemo(() => {
        const showStart = pretty(value.start) || (earliest && !value.start ? "Earliest" : "Pick start");
        const showEnd = pretty(value.end) || "Pick end";
        return `${showStart} → ${showEnd}`;
    }, [value.start, value.end, earliest]);

    // Handle range picks inside the calendar (don’t apply yet)
    const onSelectRange = (r: { from?: Date; to?: Date } | undefined) => {
        if (!r) return;
        setDraftEarliest(false); // picking dates disables "earliest" draft
        const s = r.from ? toISO(r.from) : undefined;
        const e = r.to ? toISO(r.to) : r.from ? toISO(r.from) : draft.end;
        setDraft({ start: s, end: e });
    };

    // Quick presets (set drafts only)
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
        // Leave start undefined; server expands to earliest. End = today by default.
        setDraft({ start: undefined, end: todayISO() });
        setDraftEarliest(true);
    };

    // Earliest toggle (draft only)
    const onDraftEarliestChange = (b: boolean) => {
        setDraftEarliest(b);
        if (b) {
            // when turning earliest on, ensure we have an end date (default today)
            setDraft((d) => ({ start: undefined, end: d.end ?? todayISO() }));
        }
    };

    // APPLY (commit drafts to parent) — do NOT close popover
    const onApply = () => {
        onToggleEarliest(draftEarliest);
        onChange(draft);
        // keep it open; user can click outside to close
    };

    // CLEAR (draft only)
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
                    <span className="truncate">
                        <CalendarIcon className="inline -mt-0.5 mr-2 h-4 w-4 opacity-70" />
                        {triggerLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">Change</span>
                </Button>
            </PopoverTrigger>

            {/* Stay open on selection; only close on outside click */}
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
                        <div className="text-xs font-medium text-muted-foreground">Quick ranges (draft)</div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="secondary" size="sm" onClick={() => applyPreset(7)}>Last 7d</Button>
                            <Button variant="secondary" size="sm" onClick={() => applyPreset(30)}>Last 30d</Button>
                            <Button variant="secondary" size="sm" onClick={() => applyPreset(90)}>Last 90d</Button>
                            <Button variant="secondary" size="sm" onClick={applyMTD}>MTD</Button>
                            <Button variant="secondary" size="sm" onClick={applyYTD}>YTD</Button>
                            <Button variant="secondary" size="sm" onClick={applyAllTime}>All time</Button>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                            <Switch id="earliest" checked={draftEarliest} onCheckedChange={onDraftEarliestChange} />
                            <Label htmlFor="earliest" className="text-sm cursor-pointer">
                                Use earliest available as start
                            </Label>
                        </div>

                        {/* Action row — Apply does NOT close the popover */}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
                            <Button size="sm" onClick={onApply}>Apply</Button>
                        </div>

                        {/* Tiny helper text showing the draft range */}
                        <div className="text-[11px] text-muted-foreground pt-1">
                            Draft: {(draftEarliest && !draft.start) ? "Earliest" : (pretty(draft.start) || "—")} → {pretty(draft.end) || "—"}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
