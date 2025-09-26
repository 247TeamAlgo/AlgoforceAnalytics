"use client";

import * as React from "react";
import {
  createColumnHelper,
  type Column,
  type SortingFn,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import type { JsonAccountRow } from "./JsonAccountsView";

const helper = createColumnHelper<JsonAccountRow>();

function SortHeader<T>(props: {
  column: Column<JsonAccountRow, T>;
  label: string;
}) {
  const { column, label } = props;
  const state = column.getIsSorted();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[12px] font-medium"
          onClick={() => column.toggleSorting(state === "asc")}
          aria-sort={
            state ? (state === "asc" ? "ascending" : "descending") : "none"
          }
          aria-label={`Sort by ${label}${state ? `, ${state}` : ""}`}
        >
          <span className="truncate">{label}</span>
          {state === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 opacity-80" />
          ) : state === "desc" ? (
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">Sort by {label}</TooltipContent>
    </Tooltip>
  );
}

const NB =
  "inline-flex items-center rounded-md border bg-transparent text-[11px] px-2 py-0.5 tracking-wide";

function leverageStyle(l?: number): React.CSSProperties {
  const v = Number.isFinite(l) ? (l as number) : 1;
  if (v <= 2) {
    return {
      background: "var(--accent)",
      borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
      color: "var(--foreground)",
    };
  }
  if (v <= 5) {
    return {
      background: "color-mix(in srgb, var(--af-green) 22%, transparent)",
      borderColor: "color-mix(in srgb, var(--af-green) 38%, transparent)",
      color: "var(--foreground)",
    };
  }
  if (v <= 10) {
    return {
      background: "color-mix(in srgb, var(--af-accent) 22%, transparent)",
      borderColor: "color-mix(in srgb, var(--af-accent) 38%, transparent)",
      color: "var(--foreground)",
    };
  }
  return {
    background: "color-mix(in srgb, var(--af-red) 20%, transparent)",
    borderColor: "color-mix(in srgb, var(--af-red) 40%, transparent)",
    color: "var(--foreground)",
  };
}

export function getJsonAccountColumns(args: {
  onToggleMonitored: (id: string, next: boolean) => void;
  renderCreatedAt: (iso: string) => React.ReactNode;
  renderUpdatedAt: (iso: string) => React.ReactNode;
}) {
  const { onToggleMonitored, renderCreatedAt, renderUpdatedAt } = args;

  const columns = [
    helper.display({
      id: "select",
      header: ({ table }) => {
        const all = table.getIsAllPageRowsSelected();
        const some = table.getIsSomePageRowsSelected();
        return (
          <Checkbox
            checked={all ? true : some ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
            aria-label="Select all rows"
          />
        );
      },
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      size: 40,
    }),

    helper.accessor("redisName", {
      header: ({ column }) => <SortHeader column={column} label="ID" />,
      cell: (info) => (
        <span className="max-w-[180px] truncate font-mono text-[12px] text-muted-foreground">
          {info.getValue()}
        </span>
      ),
    }),

    helper.accessor("binanceName", {
      header: ({ column }) => <SortHeader column={column} label="Binance" />,
      cell: (info) => (
        <Badge variant="secondary" className={`${NB} uppercase`}>
          {info.getValue()}
        </Badge>
      ),
    }),

    helper.accessor("dbName", {
      header: ({ column }) => <SortHeader column={column} label="DB" />,
      cell: (info) => (
        <Badge variant="outline" className={`${NB} uppercase`}>
          {info.getValue() ?? "—"}
        </Badge>
      ),
    }),

    helper.accessor("strategy", {
      header: ({ column }) => <SortHeader column={column} label="Strategy" />,
      cell: (info) => (
        <Badge variant="outline" className={`${NB} capitalize`}>
          {info.getValue()}
        </Badge>
      ),
      filterFn: (row, id, val) =>
        !(val as JsonAccountRow["strategy"][]).length ||
        (val as JsonAccountRow["strategy"][]).includes(row.getValue(id)),
    }),

    helper.accessor("leverage", {
      header: ({ column }) => <SortHeader column={column} label="Lev." />,
      cell: (info) => {
        const value = info.getValue<number>();
        return (
          <span
            className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
            style={leverageStyle(value)}
            title={`Leverage ×${value}`}
          >
            ×{value}
          </span>
        );
      },
      sortingFn: ((a, b) =>
        Number(a.original.leverage) -
        Number(b.original.leverage)) as SortingFn<JsonAccountRow>,
    }),

    helper.accessor("createdAt", {
      header: ({ column }) => <SortHeader column={column} label="Created" />,
      cell: (info) => renderCreatedAt(info.getValue<string>()),
      sortingFn: ((a, b) =>
        new Date(a.original.createdAt).getTime() -
        new Date(b.original.createdAt).getTime()) as SortingFn<JsonAccountRow>,
    }),

    helper.accessor("updatedAt", {
      header: ({ column }) => <SortHeader column={column} label="Updated" />,
      cell: (info) => renderUpdatedAt(info.getValue<string>()),
      sortingFn: ((a, b) =>
        new Date(a.original.updatedAt).getTime() -
        new Date(b.original.updatedAt).getTime()) as SortingFn<JsonAccountRow>,
    }),

    helper.accessor("monitored", {
      header: ({ column }) => <SortHeader column={column} label="Monitored" />,
      cell: ({ row }) => {
        const checked = row.original.monitored;
        return (
          <Checkbox
            checked={checked}
            onCheckedChange={(v) =>
              onToggleMonitored(row.original.redisName, v === true)
            }
            aria-label={`Toggle monitored for ${row.original.redisName}`}
            onClick={(e) => e.stopPropagation()}
          />
        );
      },
      sortingFn: ((a, b) =>
        Number(a.original.monitored) -
        Number(b.original.monitored)) as SortingFn<JsonAccountRow>,
    }),
  ];

  return columns;
}
