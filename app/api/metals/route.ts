import { engineParams } from "@/lib/api";
import { COMEX_LAST_MISSING, NSE_NOT_IN_SNAPSHOT } from "@/lib/copy";
import { classify } from "@/lib/engine";
import { env } from "@/lib/env";
import { executablePrices } from "@/lib/prices";
import { comexSession, formatIst } from "@/lib/session";
import type { EtfQuote, MetalQuote, QuoteCurrency } from "@/lib/types";
import { METAL_ETFS, METAL_SPECS } from "@/lib/universe";
import { fetchUsdInr, fetchYahooQuotes, nseSymbol, quoteBySymbol } from "@/lib/yahoo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = comexSession();
  if (!session.open && !env.allowClosedMarketFetch) {
    return Response.json({
      ok: true,
      marketClosed: true,
      session,
      metals: [],
      usdInr: null,
      usdInrSource: null,
    });
  }

  try {
    const params = engineParams(new URL(request.url).searchParams);
    const etfTickers = [...new Set(Object.values(METAL_ETFS).flat().map((e) => nseSymbol(e.ticker)))];
    const symbols = [...METAL_SPECS.map((m) => m.yahoo), ...etfTickers];
    const [quotes, fx] = await Promise.all([
      fetchYahooQuotes(symbols, {
        smaFast: params.smaFast,
        smaSlow: params.smaSlow,
      }),
      fetchUsdInr(),
    ]);
    const usdInr = fx?.rate ?? null;
    const usdInrSource = fx?.source ?? null;
    const runAt = formatIst();

    const metals: MetalQuote[] = METAL_SPECS.map((spec) => {
      const q = quoteBySymbol(quotes, spec.yahoo);
      const lastUsd = q?.regularMarketPrice ?? null;
      const prevClose = q?.previousClose ?? null;
      const dayHighUsd = q?.regularMarketDayHigh ?? null;
      const dayLowUsd = q?.regularMarketDayLow ?? null;
      const changeUsd =
        lastUsd != null && prevClose != null ? lastUsd - prevClose : (q?.regularMarketChange ?? null);
      const changePct =
        q?.regularMarketChangePercent ??
        (lastUsd != null && prevClose != null && prevClose !== 0 ? ((lastUsd - prevClose) / prevClose) * 100 : null);
      const quoteCurrency: QuoteCurrency = usdInr != null ? "INR" : "USD";
      const toDesk = (usd: number | null | undefined) => {
        if (usd == null) return null;
        return usdInr != null ? spec.convert(usd, usdInr) : usd;
      };
      const last = toDesk(lastUsd);
      const lastInr = lastUsd != null && usdInr != null ? spec.convert(lastUsd, usdInr) : null;
      const smaFast = toDesk(q?.fiftyDayAverage ?? null);
      const smaSlow = toDesk(q?.twoHundredDayAverage ?? null);
      const dayHigh = toDesk(q?.regularMarketDayHigh ?? null);
      const dayLow = toDesk(q?.regularMarketDayLow ?? null);
      const exec = executablePrices({
        last,
        bid: toDesk(q?.bid ?? null),
        ask: toDesk(q?.ask ?? null),
        kind: "etf",
      });
      const decision = classify({
        last,
        smaFast,
        smaSlow,
        dayHigh,
        dayLow,
        stopMultiple: params.stopMultiple,
        smaFastPeriod: params.smaFast,
        smaSlowPeriod: params.smaSlow,
        smaFastWindow: q?.smaFastWindow,
        smaSlowWindow: q?.smaSlowWindow,
        lastMissingWhy: COMEX_LAST_MISSING,
      });

      const etfs: EtfQuote[] = METAL_ETFS[spec.code].map((etf) => {
        const eq = quoteBySymbol(quotes, nseSymbol(etf.ticker));
        if (!eq) {
          return {
            ticker: etf.ticker,
            name: etf.name,
            last: null,
            buyAt: null,
            sellAt: null,
            priceSource: "last" as const,
            changePct: null,
            action: "NONE" as const,
            why: NSE_NOT_IN_SNAPSHOT,
            stop: null,
            conviction: 0,
            asOf: runAt,
          };
        }
        const etfLast = eq.regularMarketPrice ?? null;
        const prices = executablePrices({ last: etfLast, bid: eq.bid, ask: eq.ask, kind: "etf" });
        const etfDecision = classify({
          last: etfLast,
          smaFast: eq.fiftyDayAverage ?? null,
          smaSlow: eq.twoHundredDayAverage ?? null,
          dayHigh: eq.regularMarketDayHigh ?? null,
          dayLow: eq.regularMarketDayLow ?? null,
          stopMultiple: params.stopMultiple,
          smaFastPeriod: params.smaFast,
          smaSlowPeriod: params.smaSlow,
          smaFastWindow: eq.smaFastWindow,
          smaSlowWindow: eq.smaSlowWindow,
          lastMissingWhy: NSE_NOT_IN_SNAPSHOT,
        });
        return {
          ticker: etf.ticker,
          name: etf.name,
          last: etfLast,
          buyAt: prices.buyAt,
          sellAt: prices.sellAt,
          priceSource: prices.priceSource,
          changePct: eq.regularMarketChangePercent ?? null,
          action: etfDecision.action,
          why: etfDecision.why,
          stop: etfDecision.stop,
          conviction: etfDecision.conviction,
          asOf: eq.regularMarketTime != null ? formatIst(new Date(eq.regularMarketTime * 1000)) : runAt,
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
        quoteCurrency,
        unit: quoteCurrency === "INR" ? spec.unit : spec.usdUnit,
        changePct,
        changeUsd,
        dayHigh: dayHighUsd,
        dayLow: dayLowUsd,
        prevClose,
        smaFast,
        smaSlow,
        action: decision.action,
        why: decision.why,
        stop: decision.stop,
        conviction: decision.conviction,
        asOf: q?.regularMarketTime != null ? formatIst(new Date(q.regularMarketTime * 1000)) : runAt,
        etfs,
      };
    });

    return Response.json({
      ok: true,
      marketClosed: false,
      runAt,
      usdInr,
      usdInrSource,
      session,
      metals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Metals scan failed";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
