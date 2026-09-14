"use client";

import { fillClass, fillNow, fillNowCaption } from "@/lib/format";
import type { Action } from "@/lib/types";

export function FillNowCell({
  action,
  buyLabel,
  sellLabel,
}: {
  action: Action;
  buyLabel: string | null;
  sellLabel: string | null;
}) {
  const fill = fillNow(action, buyLabel, sellLabel);
  const caption = fillNowCaption(fill.kind);
  return (
    <td className={`px-3 py-1.5 text-right font-mono ${fillClass(action, fill.kind === "receive" ? "exit" : "enter")}`}>
      <span className="block">{fill.value}</span>
      {caption ? <span className="mt-0.5 block text-[10px] font-sans tracking-normal">{caption}</span> : null}
    </td>
  );
}
