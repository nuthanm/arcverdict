"use client";

import { HintCorner } from "@/components/InfoTip";
import { RESEARCH_HINT } from "@/lib/copy";
import { actionBorder, actionClass, actionTitle, actionWash, type QuoteNoteLine } from "@/lib/format";
import type { Action } from "@/lib/types";

export function InstructionPanel({
  action,
  why,
  footer,
  className = "",
}: {
  action: Action;
  why: string;
  footer: QuoteNoteLine[];
  className?: string;
}) {
  return (
    <section
      className={`relative border border-[var(--line)] border-l-4 px-4 py-4 pr-10 sm:px-5 ${actionWash(action)} ${actionBorder(action)} ${className}`}
    >
      <HintCorner tipKey={action} />
      <p className={`text-xl leading-none ${actionClass(action)}`}>{actionTitle(action)}</p>
      <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-[var(--ink)]">{why}</p>
      <p className="mt-2 text-xs font-medium text-[var(--accent)]">{RESEARCH_HINT}</p>
      <div className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
        {footer.map((parts, i) => (
          <p key={i}>
            {parts.map((part, j) =>
              part.strong ? (
                <strong key={j} className="font-semibold text-[var(--ink)]">
                  {part.text}
                </strong>
              ) : (
                part.text
              ),
            )}
          </p>
        ))}
      </div>
    </section>
  );
}
