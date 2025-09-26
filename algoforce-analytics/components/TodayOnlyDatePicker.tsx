"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

type Props = {
    /** Applied value from parent, in YYYY-MM-DD. If undefined, defaults to today. */
    value?: string;
    /** Called when the user explicitly applies a date (today). */
    onChange: (ymd: string) => void;
    disabled?: boolean;
    className?: string;
    /** If true, auto-apply immediately on open (since only today is valid anyway). */
    autoApply?: boolean;
};

function toISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function fromISO(s?: string): Date | undefined {
    if (!s) return undefined;
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
}

export default function TodayOnlyDatePicker({
    value,
    onChange,
    disabled,
    className,
    autoApply,
}: Props) {
    const [open, setOpen] = React.useState<boolean>(false);

    const today = React.useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const selectedDate = React.useMemo(() => fromISO(value) ?? today, [value, today]);
    const triggerLabel = React.useMemo(() => {
        const d = selectedDate ?? today;
        return d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
    }, [selectedDate, today]);

    // Only allow selecting today. Disable everything else.
    const disabledMatcher = React.useCallback(
        (date: Date) => {
            const a = new Date(date);
            a.setHours(0, 0, 0, 0);
            return a.getTime() !== today.getTime();
        },
        [today]
    );

    // Optional: auto-apply on open (since there is exactly one valid day).
    React.useEffect(() => {
        if (open && autoApply) {
            onChange(toISO(today));
        }
    }, [open, autoApply, onChange, today]);

    const handleSelect = (d?: Date): void => {
        if (!d) return;
        const norm = new Date(d);
        norm.setHours(0, 0, 0, 0);
        if (norm.getTime() !== today.getTime()) return; // ignore invalid picks
        onChange(toISO(today));
        // keep popover open—consistent with your range picker UX—user can click outside to close
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

            <PopoverContent align="start" className="p-0 w-auto">
                <div className="p-3 sm:p-4">
                    <Calendar
                        mode="single"
                        numberOfMonths={1}
                        selected={selectedDate}
                        onSelect={handleSelect}
                        disabled={disabledMatcher}
                        initialFocus
                    />
                    <div className="text-[11px] text-muted-foreground pt-2">
                        Only today is available.
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
