import type { InstrumentKind, PriceSource } from "./types";

export function executablePrices(params: {
  last: number | null;
  bid?: number | null;
  ask?: number | null;
  kind: InstrumentKind;
}): { buyAt: number | null; sellAt: number | null; priceSource: PriceSource } {
  const { last, bid, ask, kind } = params;
  if (last == null) return { buyAt: null, sellAt: null, priceSource: "last" };

  if (bid != null && ask != null && ask >= bid) {
    return { buyAt: round4(ask), sellAt: round4(bid), priceSource: "bid_ask" };
  }

  const halfSpread = kind === "etf" ? 0.0006 : 0.0004;
  return {
    buyAt: round4(last * (1 + halfSpread)),
    sellAt: round4(last * (1 - halfSpread)),
    priceSource: "last",
  };
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
