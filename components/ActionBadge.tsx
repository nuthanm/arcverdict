"use client";

import { HintLabel } from "@/components/InfoTip";
import { actionClass, actionWash } from "@/lib/format";
import type { Action } from "@/lib/types";

export function ActionBadge({ action }: { action: Action }) {
  return (
    <HintLabel
      tipKey={action}
      className={`rounded-sm px-1.5 py-0.5 font-mono text-xs tracking-wide ${actionClass(action)} ${actionWash(action)}`}
    >
      {action}
    </HintLabel>
  );
}
