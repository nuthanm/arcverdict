import { actionClass } from "@/lib/format";
import type { Action } from "@/lib/types";

export function ActionBadge({ action }: { action: Action }) {
  return (
    <span className={`font-mono text-xs tracking-wide ${actionClass(action)}`}>
      {action}
    </span>
  );
}
