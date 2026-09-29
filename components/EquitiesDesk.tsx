"use client";

import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/format";
import type { DailyLifecycleRow, LifecycleRow } from "@/lib/lifecycle";

type BookResponse = {
  ok: boolean;
  error?: string;
  asOf?: string | null;
  universe?: number;
  counts?: Record<string, number>;
  rows?: LifecycleRow[];
};

type DetailResponse = {
  ok: boolean;
  daily?: DailyLifecycleRow[];
};

type View = "act" | "monitor" | "all";

function suggestionClass(suggestion: string | null) {
  if (!suggestion || suggestion.startsWith("INSUFFICIENT")) return "text-[var(--muted)]";
  if (suggestion.startsWith("POTENTIAL ENTRY")) return "text-[var(--buy)]";
  if (suggestion.startsWith("CAUTION")) return "text-[var(--sell)]";
  return "text-[var(--watch)]";
}

function healthClass(state: string | null) {
  if (state === "Healthy" || state === "Extreme Strong") return "text-[var(--buy)]";
  if (state === "Deteriorating" || state === "Weakening") return "text-[var(--sell)]";
  if (state === "Transition") return "text-[var(--watch)]";
  return "text-[var(--muted)]";
}

function isEntry(suggestion: string | null) {
  return suggestion?.startsWith("POTENTIAL ENTRY") ?? false;
}

function isCaution(suggestion: string | null) {
  return suggestion?.startsWith("CAUTION") ?? false;
}

function isMonitor(suggestion: string | null) {
  return suggestion != null && !isEntry(suggestion) && !isCaution(suggestion) && !suggestion.startsWith("INSUFFICIENT");
}

function num(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function EquitiesDesk() {
  const [data, setData] = useState<BookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("act");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyLifecycleRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lifecycle", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as BookResponse;
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Lifecycle book failed");
        if (!cancelled) setData(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lifecycle book failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setDaily([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/lifecycle?company=${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as DetailResponse;
        if (!cancelled) setDaily(body.daily ?? []);
      })
      .catch(() => {
        if (!cancelled) setDaily([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const rows = data?.rows ?? [];
  const filtered = rows.filter((row) => {
    const q = query.trim().toUpperCase();
    return !q || row.company.includes(q);
  });

  const groups = useMemo(
    () => ({
      entry: filtered.filter((row) => isEntry(row.suggestion)),
      caution: filtered.filter((row) => isCaution(row.suggestion)),
      monitor: filtered.filter((row) => isMonitor(row.suggestion)),
      quiet: filtered.filter((row) => row.suggestion?.startsWith("INSUFFICIENT")),
    }),
    [filtered],
  );

  const picked = rows.find((row) => row.company === selected) ?? null;
  const counts = data?.counts ?? {};
  const entryCount = Object.entries(counts)
    .filter(([key]) => key.startsWith("POTENTIAL ENTRY"))
    .reduce((sum, [, n]) => sum + n, 0);
  const cautionCount = Object.entries(counts)
    .filter(([key]) => key.startsWith("CAUTION"))
    .reduce((sum, [, n]) => sum + n, 0);
  const monitorCount = Object.entries(counts)
    .filter(([key]) => isMonitor(key))
    .reduce((sum, [, n]) => sum + n, 0);
  const quietCount = counts["INSUFFICIENT DATA - DO NOT INTERPRET"] ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-[var(--muted)]">
          Trend lifecycle · {data?.universe ?? "—"} names
          {data?.asOf ? ` · as of ${data.asOf}` : ""}
        </span>
        {loading && <span className="text-xs text-[var(--muted)]">Loading book…</span>}
      </div>

      {error && <p className="border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</p>}

      {data?.ok && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Count label="Potential entry" value={entryCount} tone="text-[var(--buy)]" />
            <Count label="Caution" value={cautionCount} tone="text-[var(--sell)]" />
            <Count label="Monitor" value={monitorCount} tone="text-[var(--watch)]" />
            <Count label="Insufficient data" value={quietCount} tone="text-[var(--muted)]" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Toggle label="Act" active={view === "act"} onClick={() => setView("act")} />
            <Toggle label="Monitor" active={view === "monitor"} onClick={() => setView("monitor")} />
            <Toggle label="Full book" active={view === "all"} onClick={() => setView("all")} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol"
              className="min-w-[180px] flex-1 border border-[var(--line)] bg-white px-3 py-1.5 text-sm outline-none"
            />
          </div>

          {(view === "act" || view === "all") && (
            <BookTable title="Potential entry" rows={groups.entry} selected={selected} onSelect={setSelected} />
          )}
          {(view === "act" || view === "all") && (
            <BookTable title="Caution" rows={groups.caution} selected={selected} onSelect={setSelected} />
          )}
          {(view === "monitor" || view === "all") && (
            <BookTable title="Monitor" rows={groups.monitor} selected={selected} onSelect={setSelected} />
          )}
          {view === "all" && (
            <BookTable title="Insufficient data" rows={groups.quiet} selected={selected} onSelect={setSelected} />
          )}
        </>
      )}

      {picked && (
        <section className="border border-[var(--line)] bg-white p-4">
          <p className="font-mono text-xs text-[var(--muted)]">
            {picked.company} · {picked.date}
          </p>
          <h2 className="mt-1 text-lg text-[var(--ink)]">{picked.company}</h2>
          <p className={`mt-3 text-sm ${suggestionClass(picked.suggestion)}`}>{picked.suggestion}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Close" value={inr(picked.close)} />
            <Stat label="Health" value={num(picked.healthScore)} className={healthClass(picked.healthState)} />
            <Stat label="State" value={picked.healthState ?? "—"} className={healthClass(picked.healthState)} />
            <Stat label="Pressure" value={picked.pressure ?? "—"} />
            <Stat label="Pressure 1D" value={num(picked.healthPressure1d)} />
            <Stat label="Pressure 5D" value={num(picked.healthPressure5d)} />
            <Stat label="Structure" value={picked.structureState ?? "—"} />
            <Stat label="Candidate" value={picked.candidateStatus ?? "—"} />
            <Stat label="Decay" value={picked.decayStatus ?? "—"} />
            <Stat label="Lower high / low" value={`${picked.lowerHigh ? "Yes" : "No"} / ${picked.lowerLow ? "Yes" : "No"}`} />
            <Stat
              label="History"
              value={
                picked.research
                  ? `${picked.research.candidateRows ?? 0} candidate · ${picked.research.confirmedDecayRows ?? 0} decay`
                  : "—"
              }
            />
            <Stat label="Trend" value={picked.metrics ? `${picked.metrics.trend ?? "—"} · ${picked.metrics.trendScore ?? "—"}` : "—"} />
          </dl>
          {picked.metrics && (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4 text-sm sm:grid-cols-4">
              <Stat label="Running sum" value={num(picked.metrics.runningSum)} />
              <Stat label="RSI 14" value={num(picked.metrics.rsi)} />
              <Stat label="ADX" value={num(picked.metrics.adx)} />
              <Stat label="ATR %" value={num(picked.metrics.atrPct)} />
              <Stat label="EMA 20" value={inr(picked.metrics.ema20)} />
              <Stat label="EMA 50" value={inr(picked.metrics.ema50)} />
              <Stat label="EMA 200" value={picked.metrics.ema200 ? inr(picked.metrics.ema200) : "—"} />
              <Stat label="Bollinger position" value={num(picked.metrics.bbPosition, 2)} />
            </dl>
          )}
          {daily.length > 0 && (
            <div className="mt-4 overflow-x-auto border border-[var(--line)]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[var(--wash)] text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-right">Close</th>
                    <th className="px-3 py-2 font-medium text-right">Health</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">Pressure</th>
                    <th className="px-3 py-2 font-medium">Structure</th>
                    <th className="px-3 py-2 font-medium">Suggestion</th>
                  </tr>
                </thead>
                <tbody>
                  {[...daily].reverse().map((row) => (
                    <tr key={row.date} className="border-t border-[var(--line)]">
                      <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                      <td className="px-3 py-2 text-right font-mono">{inr(row.close)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${healthClass(row.healthState)}`}>
                        {num(row.healthScore)}
                      </td>
                      <td className="px-3 py-2">{row.healthState ?? "—"}</td>
                      <td className="px-3 py-2">{row.pressure ?? "—"}</td>
                      <td className="px-3 py-2">{row.structureState ?? "—"}</td>
                      <td className={`px-3 py-2 ${suggestionClass(row.suggestion)}`}>{row.suggestion ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border border-[var(--line)] bg-white px-3 py-3">
      <p className={`font-mono text-xl ${tone}`}>{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className={`font-mono text-xs ${className ?? ""}`}>{value}</dd>
    </div>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`px-3 py-1.5 text-sm ${active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function BookTable({
  title,
  rows,
  selected,
  onSelect,
}: {
  title: string;
  rows: LifecycleRow[];
  selected: string | null;
  onSelect: (company: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm text-[var(--ink)]">
        {title} <span className="text-[var(--muted)]">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">None in this snapshot.</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--line)] bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[var(--wash)] text-xs text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Suggestion</th>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium text-right">Close</th>
                <th className="px-3 py-2 font-medium text-right">Health</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Pressure</th>
                <th className="px-3 py-2 font-medium">Structure</th>
                <th className="px-3 py-2 font-medium">Candidate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.company}
                  role="button"
                  tabIndex={0}
                  aria-label={`${row.company}, ${row.suggestion ?? "no suggestion"}`}
                  className={`cursor-pointer border-t border-[var(--line)] ${selected === row.company ? "bg-[var(--wash)]" : "hover:bg-[var(--wash)]"}`}
                  onClick={() => onSelect(row.company)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(row.company);
                    }
                  }}
                >
                  <td className={`max-w-[240px] px-3 py-2 ${suggestionClass(row.suggestion)}`}>{row.suggestion}</td>
                  <td className="px-3 py-2 font-mono">{row.company}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(row.close)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${healthClass(row.healthState)}`}>
                    {num(row.healthScore)}
                  </td>
                  <td className="px-3 py-2">{row.healthState ?? "—"}</td>
                  <td className="px-3 py-2">{row.pressure ?? "—"}</td>
                  <td className="px-3 py-2">{row.structureState ?? "—"}</td>
                  <td className="px-3 py-2">{row.candidateStatus ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
