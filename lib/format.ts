import { COMEX_SNAPSHOT_NOTE, LTP_REFERENCE_NOTE, NSE_LISTED_SNAPSHOT } from "@/lib/copy";
import type { Action, FxSource, MetalCode, PriceSource, QuoteCurrency } from "@/lib/types";

export type Stance = "bullish" | "bearish" | "neutral";

export function inr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

export function usd(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function signedUsd(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    signDisplay: "exceptZero",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function metalUsdDigits(code: MetalCode) {
  if (code === "copper") return 4;
  if (code === "silver") return 3;
  return 2;
}

export function money(n: number | null | undefined, ccy: QuoteCurrency = "INR") {
  return ccy === "USD" ? usd(n) : inr(n);
}

export function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function convictionPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function actionClass(action: Action) {
  if (action === "BUY") return "text-[var(--buy)]";
  if (action === "SELL") return "text-[var(--sell)]";
  if (action === "HOLD") return "text-[var(--hold)]";
  if (action === "WATCH") return "text-[var(--watch)]";
  return "text-[var(--muted)]";
}

export function actionWash(action: Action) {
  if (action === "BUY") return "bg-[var(--buy-wash)]";
  if (action === "SELL") return "bg-[var(--sell-wash)]";
  if (action === "HOLD") return "bg-[var(--hold-wash)]";
  if (action === "WATCH") return "bg-[var(--watch-wash)]";
  return "bg-[var(--none-wash)]";
}

export function actionBorder(action: Action) {
  if (action === "BUY") return "border-[var(--buy)]";
  if (action === "SELL") return "border-[var(--sell)]";
  if (action === "HOLD") return "border-[var(--hold)]";
  if (action === "WATCH") return "border-[var(--watch)]";
  return "border-[var(--line)]";
}

export function actionTitle(action: Action) {
  if (action === "BUY") return "Enter";
  if (action === "SELL") return "Exit";
  if (action === "HOLD") return "Stay";
  if (action === "WATCH") return "Wait";
  return "Skip";
}

export function changeClass(n: number | null | undefined) {
  if (n == null || Number.isNaN(n) || n === 0) return "text-[var(--muted)]";
  return n > 0 ? "text-[var(--buy)]" : "text-[var(--sell)]";
}

export function convictionClass(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "text-[var(--muted)]";
  if (n >= 65) return "text-[var(--buy)]";
  if (n <= 40) return "text-[var(--sell)]";
  return "text-[var(--watch)]";
}

export function meanConviction(values: Array<number | null | undefined>) {
  const nums = values.filter((n): n is number => n != null && !Number.isNaN(n));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}

export function actionStance(action: Action): Stance {
  if (action === "BUY" || action === "HOLD") return "bullish";
  if (action === "SELL") return "bearish";
  return "neutral";
}

export function stanceBar(stance: Stance) {
  if (stance === "bullish") return "bg-[var(--buy)]";
  if (stance === "bearish") return "bg-[var(--sell)]";
  return "bg-[var(--line)]";
}

export function stanceLabel(action: Action) {
  return actionTitle(action);
}

/** Quiet unit line — currency already lives on the number. */
export function unitCaption(unit: string) {
  return unit.replace(/^₹\s*\/\s*/i, "per ").replace(/^USD\s*\/\s*/i, "per ");
}

export function inrUnit(unit: string) {
  return unit.replace(/^₹\s*\/\s*/i, "").replace(/^USD\s*\/\s*/i, "");
}

export function liveFill(action: Action, side: "enter" | "exit") {
  return (side === "enter" && action === "BUY") || (side === "exit" && action === "SELL");
}

export function fillClass(action: Action, side: "enter" | "exit") {
  return liveFill(action, side) ? actionClass(action) : "text-[var(--muted)]";
}

/** Only the live side of the book — the other fill is not an opposite order. */
export function fillNowLabel(action: Action, side: "enter" | "exit", formatted: string | null) {
  if (!liveFill(action, side) || formatted == null) return "—";
  return formatted;
}

export function showEnterFill(action: Action) {
  return action === "BUY";
}

export function showExitFill(action: Action) {
  return action === "SELL";
}

export function showStopLevel(action: Action) {
  return action === "BUY" || action === "HOLD";
}

export function fillNowNote(source: PriceSource) {
  if (source === "bid_ask") {
    return "Pay now / Receive now (when shown) use the quoted bid and ask — not a distant target.";
  }
  return "Pay now / Receive now (when shown) are this last trade plus or minus a small spread — not a distant target.";
}

export type FillNowKind = "pay" | "receive" | "none";

export function fillNow(action: Action, formattedBuy: string | null, formattedSell: string | null): {
  kind: FillNowKind;
  value: string;
} {
  if (action === "BUY" && formattedBuy != null && formattedBuy !== "—") {
    return { kind: "pay", value: formattedBuy };
  }
  if (action === "SELL" && formattedSell != null && formattedSell !== "—") {
    return { kind: "receive", value: formattedSell };
  }
  return { kind: "none", value: "—" };
}

export function fillNowCaption(kind: FillNowKind) {
  if (kind === "pay") return "Pay now";
  if (kind === "receive") return "Receive now";
  return null;
}

export function metalEtfHeading(code: "gold" | "silver" | "copper") {
  if (code === "gold") return "NSE-listed gold ETFs (separate from COMEX gold)";
  if (code === "silver") return "NSE-listed silver ETFs (separate from COMEX silver)";
  return "NSE-listed copper ETFs (separate from COMEX copper)";
}

export type QuoteNotePart = { text: string; strong?: boolean };
export type QuoteNoteLine = QuoteNotePart[];

function quoteLine(text: string): QuoteNoteLine {
  return [{ text }];
}

export function equityQuoteNote(source: PriceSource): QuoteNoteLine[] {
  return [quoteLine(NSE_LISTED_SNAPSHOT), quoteLine(fillNowNote(source))];
}

export function metalQuoteNote(
  name: string,
  lastUsd: number | null,
  priceSource: PriceSource,
  usdInr: number | null | undefined,
  usdInrSource?: FxSource | null,
): QuoteNoteLine[] {
  const lines: QuoteNoteLine[] = [];
  if (lastUsd != null) {
    const amount = lastUsd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    lines.push([
      { text: `COMEX ${name.toLowerCase()} last traded at ` },
      { text: amount, strong: true },
      { text: ` US dollars (${COMEX_SNAPSHOT_NOTE}).` },
    ]);
  }
  if (usdInr != null) {
    const prior = usdInrSource === "cached" ? " (from a slightly earlier snapshot)" : "";
    lines.push([
      { text: "Converted at 1 USD = " },
      { text: `₹${usdInr.toFixed(2)}`, strong: true },
      { text: `${prior}.` },
    ]);
  } else if (lastUsd != null) {
    lines.push(quoteLine("The US dollar to rupee rate is missing, so the last trade is shown in US dollars."));
  }
  if (lastUsd != null || usdInr != null) {
    lines.push(quoteLine(fillNowNote(priceSource)));
  }
  lines.push(quoteLine(LTP_REFERENCE_NOTE));
  return lines;
}
