"use client";

import { HintCorner, InfoTip } from "@/components/InfoTip";
import type { TipKey } from "@/lib/copy";
import { changeClass, convictionClass, convictionPct, pct } from "@/lib/format";
import type { ReactNode } from "react";

export function HintStat({
  value,
  label,
  tipKey,
  unit,
  className,
  wash,
  border,
  muted,
}: {
  value: string;
  label: string;
  tipKey: TipKey;
  unit?: string;
  className?: string;
  wash?: string;
  border?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`relative border border-[var(--line)] px-3 py-2.5 pr-7 ${wash ?? "bg-white"} ${
        border ? `border-l-4 ${border}` : ""
      } ${muted ? "opacity-55" : ""}`}
    >
      <HintCorner tipKey={tipKey} />
      <p className={`font-mono text-lg leading-tight ${className ?? "text-[var(--ink)]"}`}>{value}</p>
      {unit ? <p className="mt-0.5 text-[10px] text-[var(--muted)]">{unit}</p> : null}
      <p className="mt-1 text-[11px] text-[var(--muted)]">{label}</p>
    </div>
  );
}

export function HintTh({
  tipKey,
  children,
  align = "end",
  className = "",
}: {
  tipKey: TipKey;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <span
        className={`inline-flex w-full items-center gap-1 whitespace-nowrap ${
          align === "end" ? "justify-end" : "justify-start"
        }`}
      >
        <span className="normal-case tracking-normal">{children}</span>
        <InfoTip tipKey={tipKey} align={align} />
      </span>
    </th>
  );
}

export function ConvictionChangeTiles({
  conviction,
  changePct,
}: {
  conviction: number | null | undefined;
  changePct: number | null | undefined;
}) {
  return (
    <>
      <HintStat
        value={convictionPct(conviction)}
        label="Conviction"
        tipKey="conviction"
        className={convictionClass(conviction)}
      />
      <HintStat
        value={pct(changePct)}
        label="Change"
        tipKey="change"
        className={changeClass(changePct)}
      />
    </>
  );
}
