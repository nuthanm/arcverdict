"use client";

import type { ReactNode } from "react";
import { HintLabel } from "@/components/InfoTip";
import { pricesAsOf } from "@/lib/session";
import type { SessionInfo } from "@/lib/types";

const SESSION_VALUE =
  /((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:[–-](?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday))?(?:\s+\d{1,2}:\d{2}\s*[ap]m)?|\d{1,2}:\d{2}\s*[ap]m|\d{1,2}[–-]\d{1,2}\s*[ap]m)/gi;

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

function pricesAsOfLine(runAt: string) {
  const text = pricesAsOf(runAt);
  const prefix = "Prices as of ";
  if (!text.startsWith(prefix)) return text;
  return (
    <>
      {prefix}
      <Strong>{text.slice(prefix.length)}</Strong>
    </>
  );
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

export function DeskStatus({
  session,
  fallbackLabel,
  runAt,
  loading,
  showRun,
  onRefresh,
}: {
  session: SessionInfo | null;
  fallbackLabel: string;
  runAt?: string;
  loading: boolean;
  showRun: boolean;
  onRefresh: () => void;
}) {
  const open = session?.open ?? false;

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-[var(--line)] pb-3">
      <div className="min-w-0 flex-1">
        <div className="desk-status-headline">
          <HintLabel tipKey="session" className="desk-status-heading text-sm leading-snug">
            <span className={open ? "text-[var(--buy)]" : "text-[var(--muted)]"}>
              {session ? session.label : fallbackLabel}
            </span>
          </HintLabel>
          {(session || loading) && <StatusChip loading={loading} open={open} />}
        </div>
        {session && (
          <p className="desk-status-hours">{emphasizeHours(session.hours)}</p>
        )}
        {open && (
          <p className="desk-status-asof">{runAt ? pricesAsOfLine(runAt) : "\u00a0"}</p>
        )}
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
