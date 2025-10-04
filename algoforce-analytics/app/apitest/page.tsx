'use client';

import * as React from 'react';
import { usePrefs } from '@/components/prefs/PrefsContext';

type Dict<T = any> = Record<string, T>;

type MetricsPayload = {
  meta: { asOfStartAnchor: string; initialBalancesDate: string };
  window: { startDay: string; endDay: string; mode: 'MTD' };
  accounts: string[];
  initialBalances: Dict<number>;
  balances: {
    realized: Dict<Dict<number>>;
    margin:   Dict<Dict<number>>;
  };
  mtdDrawdown: { realized: Dict<number>; margin: Dict<number> };
  mtdReturn:   { realized: Dict<number>; margin: Dict<number> };
  losingDays: Dict<{ consecutive?: number; days?: Dict<number> }>;
  symbolRealizedPnl: { symbols: Dict<Dict<number>>; totalPerAccount: Dict<number> };
  uPnl: { as_of: string; combined: number; perAccount: Dict<number> };
};

const REFRESH_DELAY_MS = 4000;

function to6(x: number | string | undefined | null): string {
  if (x === undefined || x === null || Number.isNaN(Number(x))) return '0.000000';
  return Number(x).toFixed(6);
}
function upper(s: string) { return (s || '').toUpperCase(); }

export default function Page() {
  // —— accounts come from Prefs + fallback to fund2,fund3
  const { analyticsSelectedAccounts } = usePrefs();
  const effectiveAccounts = React.useMemo(
    () => (analyticsSelectedAccounts?.length ? analyticsSelectedAccounts : ['fund2', 'fund3']),
    [analyticsSelectedAccounts]
  );

  const accountsQS = React.useMemo(
    () => new URLSearchParams({ accounts: effectiveAccounts.join(',') }).toString(),
    [effectiveAccounts]
  );

  const [data, setData] = React.useState<MetricsPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<string>('');
  const [isRunning, setIsRunning] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function loop() {
      if (!active || !isRunning) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/metrics/bulk?${accountsQS}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as MetricsPayload;
        if (!active) return;
        setData(json);
        setLastUpdated(new Date().toISOString());
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? 'Fetch failed');
      } finally {
        if (!active) return;
        setLoading(false);
        timer = setTimeout(loop, REFRESH_DELAY_MS);
      }
    }

    loop();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [accountsQS, isRunning]);

  const accList = effectiveAccounts;

  // derived rows
  const realizedRows = React.useMemo(() => {
    const block = data?.balances?.realized ?? {};
    return Object.keys(block).sort().map(d => ({ date: d, ...block[d] }));
  }, [data]);
  const marginRows = React.useMemo(() => {
    const block = data?.balances?.margin ?? {};
    return Object.keys(block).sort().map(d => ({ date: d, ...block[d] }));
  }, [data]);

  const cliLines = React.useMemo(() => {
    if (!data) return [] as string[];
    const lines: string[] = [];
    const mr = data.mtdReturn?.realized ?? {};
    const mm = data.mtdReturn?.margin ?? {};
    const dr = data.mtdDrawdown?.realized ?? {};
    const dm = data.mtdDrawdown?.margin ?? {};

    for (const a of accList) {
      lines.push(`${upper(a)} REALIZED  -> mtdReturn: ${to6(mr[a])}  mtdDrawdown: ${to6(dr[a])}`);
      lines.push(`${upper(a)} MARGIN    -> mtdReturn: ${to6(mm[a])}  mtdDrawdown: ${to6(dm[a])}`);
    }
    lines.push(`TOTAL REALIZED  -> mtdReturn: ${to6(mr.total)}  mtdDrawdown: ${to6(dr.total)}`);
    lines.push(`TOTAL MARGIN    -> mtdReturn: ${to6(mm.total)}  mtdDrawdown: ${to6(dm.total)}`);
    return lines;
  }, [data, accList]);

  return (
    <div className="min-h-screen px-6 py-8 bg-slate-50 text-slate-900">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Algoforce Metrics (Live)</h1>
        <p className="text-sm text-slate-600">
          Window: {data?.window?.startDay} → {data?.window?.endDay} • Mode: {data?.window?.mode}
        </p>
        <p className="text-xs text-slate-500">
          Updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            className={`px-3 py-2 text-sm rounded-md ${isRunning ? 'bg-slate-200' : 'bg-emerald-600 text-white'}`}
            onClick={() => setIsRunning(v => !v)}
          >
            {isRunning ? 'Pause' : 'Resume'}
          </button>
          <button
            className="px-3 py-2 text-sm rounded-md bg-slate-900 text-white"
            onClick={() => { setIsRunning(false); setTimeout(() => setIsRunning(true), 10); }}
          >
            Refresh now
          </button>
        </div>
      </header>

      {error && <div className="mb-4 rounded-md bg-red-100 text-red-800 px-4 py-2 text-sm">{error}</div>}

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <KpiCard title="MTD Return (Realized)"
          values={accList.map(a => ({ label: upper(a), value: to6(data?.mtdReturn?.realized?.[a]) }))}
          total={to6(data?.mtdReturn?.realized?.total)} />
        <KpiCard title="MTD Return (Margin)"
          values={accList.map(a => ({ label: upper(a), value: to6(data?.mtdReturn?.margin?.[a]) }))}
          total={to6(data?.mtdReturn?.margin?.total)} />
        <KpiCard title="MTD Drawdown (Realized)"
          values={accList.map(a => ({ label: upper(a), value: to6(data?.mtdDrawdown?.realized?.[a]) }))}
          total={to6(data?.mtdDrawdown?.realized?.total)} />
        <KpiCard title="MTD Drawdown (Margin)"
          values={accList.map(a => ({ label: upper(a), value: to6(data?.mtdDrawdown?.margin?.[a]) }))}
          total={to6(data?.mtdDrawdown?.margin?.total)} />
        <KpiCard title="uPnL Snapshot"
          values={accList.map(a => ({ label: upper(a), value: to6(data?.uPnl?.perAccount?.[a]) }))}
          total={to6(data?.uPnl?.combined)}
          footer={data?.uPnl?.as_of ? `as of ${new Date(data.uPnl.as_of).toLocaleString()}` : undefined} />
        <KpiCard title="Initial Balances"
          values={accList.map(a => ({ label: upper(a), value: to6(data?.initialBalances?.[a]) }))}
          total={to6(accList.reduce((sum, a) => sum + (data?.initialBalances?.[a] ?? 0), 0))} />
      </section>

      {/* Balances */}
      <section className="grid gap-6 lg:grid-cols-2 mb-6">
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-medium mb-3">Day-End Balances — Realized</h2>
          <BalancesTable rows={realizedRows} accs={accList} />
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-medium mb-3">Balances — Margin (last day)</h2>
          <BalancesTable rows={marginRows} accs={accList} />
        </div>
      </section>

      {/* Symbols */}
      <section className="bg-white rounded-xl shadow p-4 overflow-auto mb-6">
        <h2 className="font-medium mb-3">Symbol Realized PnL (MTD)</h2>
        <SymbolsTable symbols={data?.symbolRealizedPnl?.symbols || {}} />
        {data?.symbolRealizedPnl?.totalPerAccount && (
          <div className="mt-3 text-sm text-slate-600">
            Totals:&nbsp;
            {accList.map((a, i) => (
              <span key={a}>
                <b className="mr-1">{upper(a)}:</b>{to6(data.symbolRealizedPnl.totalPerAccount[a] ?? 0)}
                {i < accList.length - 1 ? ' • ' : ''}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* CLI summary */}
      <section className="bg-white rounded-xl shadow p-4">
        <h2 className="font-medium mb-3">CLI Summary</h2>
        <pre className="text-sm whitespace-pre-wrap font-mono bg-slate-50 rounded-md p-3 overflow-auto">
{cliLines.join('\n')}
        </pre>
      </section>

      {loading && (
        <div className="fixed bottom-4 right-4 bg-white border shadow px-3 py-2 rounded-md text-sm">
          fetching…
        </div>
      )}
    </div>
  );
}

/* ——— UI helpers ——— */

function KpiCard({
  title, values, total, footer,
}: { title: string; values: { label: string; value: string }[]; total?: string; footer?: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</div>
      <div className="space-y-1">
        {values.map(v => (
          <div key={v.label} className="flex justify-between text-sm">
            <span className="text-slate-600">{v.label}</span>
            <span className="font-medium tabular-nums">{v.value}</span>
          </div>
        ))}
        {total !== undefined && (
          <div className="flex justify-between pt-2 mt-2 border-t">
            <span className="font-semibold">TOTAL</span>
            <span className="font-semibold tabular-nums">{total}</span>
          </div>
        )}
      </div>
      {footer && <div className="mt-2 text-xs text-slate-500">{footer}</div>}
    </div>
  );
}

function BalancesTable({ rows, accs }: { rows: Array<Dict<number | string>>; accs: string[] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-600">
          <tr>
            <th className="py-2 pr-3">Date</th>
            {accs.map(a => <th key={a} className="py-2 pr-3">{upper(a)}</th>)}
            <th className="py-2">TOTAL</th>
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(even)]:bg-slate-50">
          {rows.map(r => (
            <tr key={String(r.date)}>
              <td className="py-2 pr-3">{String(r.date)}</td>
              {accs.map(a => <td key={a} className="py-2 pr-3 tabular-nums">{to6(r[a] as number)}</td>)}
              <td className="py-2 tabular-nums font-medium">{to6(r.total as number)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={accs.length + 2} className="py-6 text-center text-slate-500">No data</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SymbolsTable({ symbols }: { symbols: Dict<Dict<number>> }) {
  const rows = React.useMemo(
    () => Object.entries(symbols).map(([sym, vals]) => ({ sym, vals })),
    [symbols]
  );
  const accs = React.useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => Object.keys(r.vals).forEach(k => { if (k !== 'TOTAL') set.add(k); }));
    return Array.from(set);
  }, [rows]);

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-600">
          <tr>
            <th className="py-2 pr-3">Symbol</th>
            {accs.map(a => <th key={a} className="py-2 pr-3">{upper(a)}</th>)}
            <th className="py-2">TOTAL</th>
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(even)]:bg-slate-50">
          {rows.map(r => (
            <tr key={r.sym}>
              <td className="py-2 pr-3 font-medium">{r.sym}</td>
              {accs.map(a => <td key={a} className="py-2 pr-3 tabular-nums">{to6(r.vals[a] ?? 0)}</td>)}
              <td className="py-2 tabular-nums font-semibold">{to6(r.vals.TOTAL ?? 0)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={accs.length + 2} className="py-6 text-center text-slate-500">No symbols</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
