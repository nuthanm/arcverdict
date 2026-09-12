import type { Action } from "@/lib/types";

export function inr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

export function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function actionClass(action: Action) {
  if (action === "BUY") return "text-[var(--buy)]";
  if (action === "SELL") return "text-[var(--sell)]";
  if (action === "HOLD") return "text-[var(--hold)]";
  if (action === "WATCH") return "text-[var(--watch)]";
  return "text-[var(--muted)]";
}

export function actionTitle(action: Action) {
  if (action === "BUY") return "Enter";
  if (action === "SELL") return "Exit";
  if (action === "HOLD") return "Maintain";
  if (action === "WATCH") return "Wait";
  return "No instruction";
}
