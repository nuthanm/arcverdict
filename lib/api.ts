import { parseSettings } from "@/lib/settings";

export function engineParams(searchParams: URLSearchParams) {
  return parseSettings({
    smaFast: Number(searchParams.get("smaFast") ?? undefined),
    smaSlow: Number(searchParams.get("smaSlow") ?? undefined),
    stopMultiple: Number(searchParams.get("stopMultiple") ?? undefined),
  });
}

export function emptyCounts() {
  return { BUY: 0, SELL: 0, HOLD: 0, WATCH: 0, NONE: 0 };
}
