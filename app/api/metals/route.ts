import { engineParams } from "@/lib/api";
import { classify } from "@/lib/engine";
import { env } from "@/lib/env";
import { executablePrices } from "@/lib/prices";
import { formatIst, mcxSession } from "@/lib/session";
import type { EtfQuote, MetalQuote } from "@/lib/types";
import { METAL_ETFS, METAL_SPECS } from "@/lib/universe";
import { fetchYahooQuotes, nseSymbol } from "@/lib/yahoo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = mcxSession();
  if (!session.open && !env.allowClosedMarketFetch) {
    return Response.json({
      ok: true,
      marketClosed: true,
      session,
      metals: [],
      usdInr: null,
    });
  }

  try {
    const params = engineParams(new URL(request.url).searchParams);
    const etfTickers = [...new Set(Object.values(METAL_ETFS).flat().map((e) => nseSymbol(e.ticker)))];
    const symbols = [...METAL_SPECS.map((m) => m.yahoo), "USDINR=X", ...etfTickers];
    const quotes = await fetchYahooQuotes(symbols, {
      smaFast: params.smaFast,
      smaSlow: params.smaSlow,
    });
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    const usdInr = bySymbol.get("USDINR=X")?.regularMarketPrice ?? null;
    const runAt = formatIst();

    const metals: MetalQuote[] = METAL_SPECS.map((spec) => {
      const q = bySymbol.get(spec.yahoo);
      const lastUsd = q?.regularMarketPrice ?? null;
      const lastInr = lastUsd != null && usdInr != null ? spec.convert(lastUsd, usdInr) : null;
      const smaFastUsd = q?.fiftyDayAverage ?? null;
      const smaSlowUsd = q?.twoHundredDayAverage ?? null;
      const smaFast = smaFastUsd != null && usdInr != null ? spec.convert(smaFastUsd, usdInr) : null;
      const smaSlow = smaSlowUsd != null && usdInr != null ? spec.convert(smaSlowUsd, usdInr) : null;
      const dayHigh =
        q?.regularMarketDayHigh != null && usdInr != null ? spec.convert(q.regularMarketDayHigh, usdInr) : null;
      const dayLow =
        q?.regularMarketDayLow != null && usdInr != null ? spec.convert(q.regularMarketDayLow, usdInr) : null;
      const exec = executablePrices({
        last: lastInr,
        bid: q?.bid != null && usdInr != null ? spec.convert(q.bid, usdInr) : null,
        ask: q?.ask != null && usdInr != null ? spec.convert(q.ask, usdInr) : null,
        kind: "etf",
      });
      const decision = classify({
        last: lastInr,
        smaFast,
        smaSlow,
        dayHigh,
        dayLow,
        stopMultiple: params.stopMultiple,
      });

      const etfs: EtfQuote[] = METAL_ETFS[spec.code].map((etf) => {
        const eq = bySymbol.get(nseSymbol(etf.ticker));
        const last = eq?.regularMarketPrice ?? null;
        const prices = executablePrices({ last, bid: eq?.bid, ask: eq?.ask, kind: "etf" });
        const etfDecision = classify({
          last,
          smaFast: eq?.fiftyDayAverage ?? null,
          smaSlow: eq?.twoHundredDayAverage ?? null,
          dayHigh: eq?.regularMarketDayHigh ?? null,
          dayLow: eq?.regularMarketDayLow ?? null,
          stopMultiple: params.stopMultiple,
        });
        return {
          ticker: etf.ticker,
          name: etf.name,
          last,
          buyAt: prices.buyAt,
          sellAt: prices.sellAt,
          priceSource: prices.priceSource,
          changePct: eq?.regularMarketChangePercent ?? null,
          action: etfDecision.action,
          why: etfDecision.why,
          stop: etfDecision.stop,
          asOf: eq?.regularMarketTime != null ? formatIst(new Date(eq.regularMarketTime * 1000)) : runAt,
        };
      });

      return {
        code: spec.code,
        name: spec.name,
        venue: spec.venue,
        yahoo: spec.yahoo,
        lastUsd,
        lastInr,
        buyAt: exec.buyAt,
        sellAt: exec.sellAt,
        priceSource: exec.priceSource,
        unit: spec.unit,
        changePct: q?.regularMarketChangePercent ?? null,
        smaFast,
        smaSlow,
        action: decision.action,
        why: decision.why,
        stop: decision.stop,
        asOf: q?.regularMarketTime != null ? formatIst(new Date(q.regularMarketTime * 1000)) : runAt,
        etfs,
      };
    });

    return Response.json({
      ok: true,
      marketClosed: false,
      runAt,
      usdInr,
      session,
      metals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Metals scan failed";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
