"use client";

import { useMemo, useState } from "react";
import type {
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import debounce from "lodash.debounce";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RefreshCcw,
  Download,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { getJsonAccountColumns } from "./columns";

export type Strategy = "Charm" | "Janus" | "None";

export type JsonAccountRow = {
  binanceName: string;
  redisName: string;
  dbName?: string | null;
  strategy: Strategy;
  leverage: number;
  monitored: boolean;
  createdAt: string;
  updatedAt: string;
};

export const ALL_STRATEGIES: Strategy[] = ["Charm", "Janus", "None"];

function formatRel(iso: string): string {
  const d = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - d) / 1000);
  const abs = Math.abs(diffSec);
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, secs] of table) {
    const delta = Math.floor(abs / secs);
    if (delta >= 1) return rtf.format(-Math.sign(diffSec) * delta, unit);
  }
  return "just now";
}

function toLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString()} (${iso})`;
}

function strategyBadgeClass(s: Strategy): string {
  switch (s) {
    case "Charm":
      return "bg-purple-500/15 text-purple-900 dark:text-purple-300 border border-purple-500/30";
    case "Janus":
      return "bg-teal-500/15 text-teal-900 dark:text-teal-300 border border-teal-500/30";
    default:
      return "bg-slate-500/15 text-slate-900 dark:text-slate-300 border border-slate-500/30";
  }
}

export default function JsonAccountsView(props: {
  accounts: JsonAccountRow[];
  onToggleMonitored: (id: string, next: boolean) => void;
  onBulkToggleMonitored: (ids: string[], next: boolean) => void;
}) {
  const { accounts, onToggleMonitored, onBulkToggleMonitored } = props;

  const [searchInput, setSearchInput] = useState<string>("");
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [details, setDetails] = useState<JsonAccountRow | null>(null);
  const router = useRouter();

  const columns = useMemo(
    () =>
      getJsonAccountColumns({
        onToggleMonitored,
        renderCreatedAt: (iso: string) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-[12px] text-blue-900 dark:text-blue-300">
                {formatRel(iso)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{toLocal(iso)}</TooltipContent>
          </Tooltip>
        ),
        renderUpdatedAt: (iso: string) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-[12px] font-medium text-emerald-900 dark:text-emerald-300">
                {formatRel(iso)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{toLocal(iso)}</TooltipContent>
          </Tooltip>
        ),
      }),
    [onToggleMonitored]
  );

  const table = useReactTable({
    data: accounts,
    columns,
    state: { globalFilter, columnFilters, sorting, pagination, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.redisName,
    manualPagination: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const onSearchChange = useMemo(
    () =>
      debounce((v: string) => {
        setGlobalFilter(v);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      }, 300),
    []
  );

  const selectedIds = table
    .getSelectedRowModel()
    .rows.map((r) => r.original.redisName);
  const filteredRows = table.getFilteredRowModel().rows.length;
  const visibleRows = table.getRowModel().rows.map((r) => r.original);

  const total = accounts.length;
  const monitored = accounts.filter((a) => a.monitored).length;
  const byStrat = (["Charm", "Janus", "None"] as const).reduce<
    Record<Strategy, number>
  >(
    (acc, s) => ({
      ...acc,
      [s]: accounts.filter((a) => a.strategy === s).length,
    }),
    { Charm: 0, Janus: 0, None: 0 }
  );
  const latestUpdate = accounts.reduce<string>(
    (m, a) => (m && new Date(m) > new Date(a.updatedAt) ? m : a.updatedAt),
    accounts[0]?.updatedAt ?? new Date(0).toISOString()
  );

  function exportJSON(): void {
    const blob = new Blob([JSON.stringify(visibleRows, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accounts-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-[80vh] flex-col space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-500/12 to-blue-500/0 border-blue-500/25">
          <CardHeader className="py-2">
            <CardTitle className="text-sm text-blue-900 dark:text-blue-200">
              Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between py-2">
            <span className="text-2xl font-semibold text-blue-900 dark:text-blue-100">
              {total}
            </span>
            <span className="flex items-center gap-1 text-xs text-blue-800/80 dark:text-blue-300/80">
              <Info className="h-3.5 w-3.5" /> Updated {formatRel(latestUpdate)}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/12 to-emerald-500/0 border-emerald-500/25">
          <CardHeader className="py-2">
            <CardTitle className="text-sm text-emerald-900 dark:text-emerald-200">
              Monitored
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <span className="text-2xl font-semibold text-emerald-900 dark:text-emerald-100">
              {monitored}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-500/12 to-violet-500/0 border-violet-500/25">
          <CardHeader className="py-2">
            <CardTitle className="text-sm text-violet-900 dark:text-violet-200">
              By Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 py-2">
            {(["Charm", "Janus", "None"] as const).map((s) => (
              <Badge
                key={s}
                variant="secondary"
                className={`px-2 py-0.5 capitalize ${
                  s === "Charm"
                    ? "bg-purple-500/15 text-purple-900 dark:text-purple-300 border border-purple-500/30"
                    : s === "Janus"
                      ? "bg-teal-500/15 text-teal-900 dark:text-teal-300 border border-teal-500/30"
                      : "bg-slate-500/15 text-slate-900 dark:text-slate-300 border border-slate-500/30"
                }`}
              >
                {s}: {byStrat[s]}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedIds.length ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onBulkToggleMonitored(selectedIds, true)}
              >
                Monitor
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onBulkToggleMonitored(selectedIds, false)}
              >
                Unmonitor
              </Button>
            </>
          ) : (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex cursor-pointer items-center gap-1"
                  >
                    Filter Columns <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  className="w-48 p-2"
                >
                  {table
                    .getAllLeafColumns()
                    .filter((c) => c.getCanHide())
                    .map((col) => (
                      <label
                        key={col.id}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:bg-accent flex cursor-pointer items-center space-x-2 rounded px-2 py-1"
                      >
                        <Checkbox
                          checked={col.getIsVisible()}
                          onCheckedChange={() => col.toggleVisibility()}
                          className="cursor-pointer border-none focus:ring-0"
                        />
                        <span className="text-sm">
                          {col.id
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (w) => w.toUpperCase())}
                        </span>
                      </label>
                    ))}
                </PopoverContent>
              </Popover>

              <Button size="sm" variant="outline" onClick={exportJSON}>
                <Download className="mr-2 h-4 w-4" /> Export JSON
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Input
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  onSearchChange(e.target.value);
                }}
                placeholder="Search accounts…"
                className="w-60"
              />
            </TooltipTrigger>
            <TooltipContent side="top">Filter rows</TooltipContent>
          </Tooltip>

          <Tooltip>
            <Select
              value={`${pagination.pageSize}`}
              onValueChange={(v) =>
                setPagination((p) => ({
                  ...p,
                  pageSize: Number(v),
                  pageIndex: 0,
                }))
              }
            >
              <TooltipTrigger asChild>
                <SelectTrigger className="h-9 w-[90px]">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
              </TooltipTrigger>
              <SelectContent align="end" className="w-[90px]">
                {[10, 20, 50].map((s) => (
                  <SelectItem key={s} value={`${s}`}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TooltipContent side="top">Rows per page</TooltipContent>
          </Tooltip>

          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 rounded-md border">
        <div className="max-h-[65vh] overflow-auto">
          {table.getRowModel().rows.length === 0 ? (
            <div className="text-muted-foreground flex min-h-[200px] flex-col items-center justify-center gap-3 py-12">
              <Inbox className="h-12 w-12" />
              <p className="text-lg font-medium">No accounts found</p>
            </div>
          ) : (
            <>
              <Table className="min-w-[900px]">
                <TableHeader>
                  {table.getHeaderGroups().map((g) => (
                    <TableRow key={g.id}>
                      {g.headers.map((h) => (
                        <TableHead
                          key={h.id}
                          className="select-none capitalize"
                        >
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext()
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/50">
                      {r.getVisibleCells().map((c) => (
                        <TableCell key={c.id}>
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div
                className="
                  sticky bottom-0 z-10
                  border-t
                  bg-background/95
                  px-3 py-2
                  backdrop-blur supports-[backdrop-filter]:bg-background/70
                "
              >
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {table.getSelectedRowModel().rows.length} selected ·{" "}
                    {filteredRows} total
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 px-2"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Prev</span>
                    </Button>
                    <span className="tabular-nums text-xs">
                      Page {pagination.pageIndex + 1} of{" "}
                      {Math.max(
                        1,
                        Math.ceil(filteredRows / pagination.pageSize)
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 px-2"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Sheet open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Account details</SheetTitle>
            <SheetDescription className="text-xs">
              Admin-owned fields are read-only. Toggle monitoring via the table
              checkbox or bulk actions.
            </SheetDescription>
          </SheetHeader>
          {details && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">ID</span>
                <span className="col-span-2 font-mono">
                  {details.redisName}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Binance</span>
                <span className="col-span-2 uppercase">
                  {details.binanceName}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">DB</span>
                <span className="col-span-2">{details.dbName ?? "—"}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Strategy</span>
                <span className="col-span-2">{details.strategy}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Leverage</span>
                <span className="col-span-2">×{details.leverage}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Monitored</span>
                <span className="col-span-2">
                  {details.monitored ? "Yes" : "No"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Created</span>
                <span className="col-span-2">{toLocal(details.createdAt)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Updated</span>
                <span className="col-span-2">{toLocal(details.updatedAt)}</span>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
