import { engineParams } from "@/lib/api";
import { NSE_NOT_IN_SNAPSHOT } from "@/lib/copy";
import { classify } from "@/lib/engine";
import { formatNseLastTrade } from "@/lib/format";
import { executablePrices } from "@/lib/prices";
import { formatIst, nseSession } from "@/lib/session";
import type { ScanRow } from "@/lib/types";
import { NIFTY_UNIVERSE } from "@/lib/universe";
import { fetchYahooQuotes, nseSymbol } from "@/lib/yahoo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = nseSession();

  try {
    const params = engineParams(new URL(request.url).searchParams);
    const quotes = await fetchYahooQuotes(
      NIFTY_UNIVERSE.map((u) => nseSymbol(u.ticker)),
      { smaFast: params.smaFast, smaSlow: params.smaSlow },
    );
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    const runAt = formatIst();

    const rows: ScanRow[] = NIFTY_UNIVERSE.map((u) => {
      const kind = u.kind ?? "equity";
      const q = bySymbol.get(nseSymbol(u.ticker));
      const last = q?.regularMarketPrice ?? null;
      const prevClose = q?.previousClose ?? null;
      const changeInr =
        last != null && prevClose != null ? last - prevClose : (q?.regularMarketChange ?? null);
      const changePct =
        q?.regularMarketChangePercent ??
        (last != null && prevClose != null && prevClose !== 0 ? ((last - prevClose) / prevClose) * 100 : null);
      const exec = executablePrices({ last, bid: q?.bid, ask: q?.ask, kind });
      const decision = classify({
        last,
        smaFast: q?.fiftyDayAverage ?? null,
        smaSlow: q?.twoHundredDayAverage ?? null,
        dayHigh: q?.regularMarketDayHigh ?? null,
        dayLow: q?.regularMarketDayLow ?? null,
        stopMultiple: params.stopMultiple,
        smaFastPeriod: params.smaFast,
        smaSlowPeriod: params.smaSlow,
        smaFastWindow: q?.smaFastWindow,
        smaSlowWindow: q?.smaSlowWindow,
        lastMissingWhy: NSE_NOT_IN_SNAPSHOT,
      });
      const asOf =
        q?.regularMarketTime != null ? formatNseLastTrade(q.regularMarketTime) : formatNseLastTrade(Date.now() / 1000);
      return {
        ticker: u.ticker,
        name: u.name,
        kind,
        last,
        buyAt: exec.buyAt,
        sellAt: exec.sellAt,
        priceSource: exec.priceSource,
        changePct,
        changeInr,
        prevClose,
        dayHigh: q?.regularMarketDayHigh ?? null,
        dayLow: q?.regularMarketDayLow ?? null,
        smaFast: q?.fiftyDayAverage ?? null,
        smaSlow: q?.twoHundredDayAverage ?? null,
        action: decision.action,
        why: decision.why,
        stop: decision.stop,
        conviction: decision.conviction,
        asOf,
      };
    });

    const counts = {
      BUY: rows.filter((r) => r.action === "BUY").length,
      SELL: rows.filter((r) => r.action === "SELL").length,
      HOLD: rows.filter((r) => r.action === "HOLD").length,
      WATCH: rows.filter((r) => r.action === "WATCH").length,
      NONE: rows.filter((r) => r.action === "NONE").length,
    };

    return Response.json({
      ok: true,
      marketClosed: !session.open,
      runAt,
      session,
      universe: NIFTY_UNIVERSE.length,
      quoted: quotes.length,
      counts,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
