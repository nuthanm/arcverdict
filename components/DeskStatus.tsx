"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HintLabel } from "@/components/InfoTip";
import { formatSecondsLabel } from "@/lib/format";
import type { SessionInfo } from "@/lib/types";

const SESSION_VALUE =
  /((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:[–-](?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday))?(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*[ap]m)?|\d{1,2}:\d{2}(?::\d{2})?\s*[ap]m|\d{1,2}[–-]\d{1,2}\s*[ap]m)/gi;

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

function emphasizeHours(hours: string) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of hours.matchAll(SESSION_VALUE)) {
    const idx = match.index ?? 0;
    if (idx > last) nodes.push(hours.slice(last, idx));
    nodes.push(<Strong key={i}>{match[0]}</Strong>);
    i += 1;
    last = idx + match[0].length;
  }
  if (last < hours.length) nodes.push(hours.slice(last));
  return nodes;
}

function snapshotClock(runAt: string) {
  const match = runAt.match(/(\d{2}:\d{2}:\d{2})\s*IST/i);
  return match ? `${match[1]} IST` : null;
}

function StatusChip({ loading, open }: { loading: boolean; open: boolean }) {
  const mode = loading ? "updating" : open ? "live" : "closed";
  const label = loading ? "Updating" : open ? "Live" : "Closed";
  return (
    <span className={`desk-status-chip is-${mode}`} aria-live="polite">
      <span className={`desk-status-chip-mark${loading ? " is-pulse" : ""}`} aria-hidden />
      {label}
    </span>
  );
}

function useElapsedLabel(fetchedAt: number | null) {
  const [elapsed, setElapsed] = useState<string | null>(null);
  useEffect(() => {
    if (fetchedAt == null) {
      setElapsed(null);
      return;
    }
    const origin = fetchedAt;
    function tick() {
      setElapsed(formatSecondsLabel((Date.now() - origin) / 1000));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [fetchedAt]);
  return elapsed;
}

export function DeskStatus({
  session,
  fallbackLabel,
  runAt,
  loading,
  showRun,
  onRefresh,
  intervalSec = 0,
  fetchedAt = null,
}: {
  session: SessionInfo | null;
  fallbackLabel: string;
  runAt?: string;
  loading: boolean;
  showRun: boolean;
  onRefresh: () => void;
  intervalSec?: number;
  fetchedAt?: number | null;
}) {
  const open = session?.open ?? false;
  const clock = runAt ? snapshotClock(runAt) : null;
  const intervalLabel = intervalSec > 0 ? formatSecondsLabel(intervalSec) : null;
  const elapsed = useElapsedLabel(open ? fetchedAt : null);

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-[var(--line)] pb-3">
      <div className="min-w-0 flex-1">
        <div className="desk-status-headline">
          <HintLabel tipKey="session" className="desk-status-heading text-sm leading-snug">
            <span className={open ? "text-[var(--buy)]" : "text-[var(--muted)]"}>
              {session ? session.label : fallbackLabel}
            </span>
          </HintLabel>
          {(session || loading) && (
            <span className="inline-flex shrink-0 items-center gap-2">
              <StatusChip loading={loading} open={open} />
              {open && clock ? (
                <span className="font-mono text-[11px] text-[var(--muted)]">refreshed {clock}</span>
              ) : null}
            </span>
          )}
        </div>
        {session && (
          <p className="desk-status-hours">{emphasizeHours(session.hours)}</p>
        )}
        {open && (intervalLabel || elapsed) ? (
          <p className="desk-status-asof">
            {intervalLabel ? (
              <>
                interval <Strong>{intervalLabel}</Strong>
              </>
            ) : null}
            {intervalLabel && elapsed ? " · " : null}
            {elapsed ? <Strong>{elapsed}</Strong> : null}
          </p>
        ) : null}
      </div>
      {showRun && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Refresh snapshot
        </button>
      )}
    </div>
  );
}
