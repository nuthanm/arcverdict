import type { Action } from "@/lib/types";
import { CONVICTION_WEIGHTS } from "@/lib/engine";

/** Visible identity — this desk is a second screen, not a ticket. Footer only. */
export const REFERENCE_FOOTER = "This site is for reference only. Buy or sell only from your official brokerage.";
export const RESEARCH_HINT = "This is a research hint, not an order.";
export const GOLD_ETF_NOT_IN_FEED = "UTI Gold ETF is not in this feed";
export const COPPER_ETF_EMPTY =
  "No India-listed copper ETF in this reference list. Use the COMEX copper levels above.";
export const NSE_LISTED_SNAPSHOT = "NSE-listed. Reference last on NSE, not an official NSE feed.";
export const NSE_NOT_IN_SNAPSHOT = "Not on this NSE snapshot / not in this feed.";
export const COMEX_SNAPSHOT_NOTE = "COMEX futures snapshot, not MCX / not NSE";
export const COMEX_LAST_MISSING = "COMEX last not in this snapshot.";
export const LTP_REFERENCE_NOTE =
  "Live trade values based on NSE, else COMEX if applicable. This is a reference snapshot.";
export const DESK_UNIVERSE_NOTE =
  "We show this desk’s universe, not every NSE listing. Last is a reference snapshot.";
export const NIFTY_UNIVERSE_NOTE = "Nifty 500 reference list (not the full NSE).";
export const ETF_LISTING_BASIS =
  "NSE-listed. Shown because they are in this desk’s universe and this snapshot returned a last. Not NSE official.";
export const LEGAL_MARKET_NOTE =
  "Nifty 500 names and India ETFs are NSE-listed. This is a reference snapshot, not an NSE official feed. Gold, silver and copper are COMEX futures (USD/INR) — COMEX futures snapshot, not MCX / not NSE. Metals are not NSE cash.";

export type TipBody = {
  title: string;
  meaning: string;
  act: string;
  avoid: string;
  extra?: string;
};

export const ACTION_TIPS: Record<Action, TipBody> = {
  BUY: {
    title: "BUY — Enter",
    meaning:
      "Enter / buy. The name is in an uptrend and the last price is still near the fast average, so a new long is the instruction.",
    act: "Pay the Enter at / Pay now fill at your official broker (executable ask, or last plus a small spread). Use the protective stop if the tape then fails. This site does not send orders.",
    avoid: "Do not chase if the name has already stretched far above the average — that prints HOLD, not BUY. Do not treat BUY as a short cover.",
  },
  SELL: {
    title: "SELL — Exit",
    meaning:
      "Exit / sell if you already hold. Price is below the fast average in a weakening trend. This is a close-the-long instruction.",
    act: "Come out at the Exit at / Receive now fill at your official broker (executable bid, or last minus a small spread). Stand aside after you are flat. This site does not send orders.",
    avoid: "Do not open a new long. Do not read SELL as a short-sale signal — ArcVerdict does not instruct shorts.",
  },
  HOLD: {
    title: "HOLD — Stay",
    meaning:
      "Stay. The trend is still higher, but the name is extended versus the fast average. Keep the position you have.",
    act: "Stay in the long against LTP. Keep the protective stop in view. Pay now / Receive now are not live on HOLD.",
    avoid: "Do not add. Do not sell only because a muted fill is printed — HOLD is not an exit signal.",
  },
  WATCH: {
    title: "WATCH — Wait",
    meaning:
      "Wait. The tape is mixed or weak without a confirmed exit. Neither a new entry nor a forced exit is instructed.",
    act: "Wait for the next snapshot. Compare LTP only. Enter only if the action later prints BUY; exit only if it later prints SELL.",
    avoid: "Do not enter a new long. Do not dump a sound holding solely on WATCH — it is not a SELL.",
  },
  NONE: {
    title: "NONE — Skip",
    meaning:
      "Skip. There is no instruction for this name (including a missing last or too few closes). Absence of a signal is not a trade.",
    act: "Do nothing. Leave it off the ticket until the book prints a real action.",
    avoid: "Do not treat NONE as a short. Do not invent a buy or sell from a blank instruction.",
  },
};

const enterAt: TipBody = {
  title: "Enter at / Pay now",
  meaning:
    "The executable buy fill from this snapshot — what you pay if you enter now: the quoted ask when a real bid/ask exists, otherwise last print plus a small spread. It is not a distant target.",
  act: "Use this level only when the action is BUY. Compare it to LTP; it should sit near the last print. Place the order with your official broker — this site does not send orders.",
  avoid: "Do not buy at this level on SELL, WATCH, HOLD (do not add), or NONE names. A muted Pay now is not a live order.",
};

const exitAt: TipBody = {
  title: "Exit at / Receive now",
  meaning:
    "The executable sell fill from this snapshot — what you receive if you exit now: the quoted bid when a real bid/ask exists, otherwise last print minus a small spread. It is not a distant target and not a short trigger.",
  act: "Use this level only when you hold and the action is SELL — it is the fill to get flat. Place the order with your official broker.",
  avoid: "Do not treat Receive now as a short trigger. Do not sell a HOLD solely because a muted fill is shown.",
};

const payReceive: TipBody = {
  title: "Pay / Receive now",
  meaning:
    "One fill column tied to the action. BUY shows Pay now (enter fill). SELL shows Receive now (exit fill). Other actions have no live fill here.",
  act: "Read it next to LTP only when the row is BUY or SELL. Then place that order at your official broker.",
  avoid: "Do not treat a dash as a missing target. Do not read Pay now on a SELL row or Receive now on a BUY row — those columns were dropped on purpose.",
};

export const TIPS = {
  ltp: {
    title: "LTP",
    meaning:
      "Last traded price from this snapshot — live trade values based on NSE, else COMEX if applicable. This is a reference snapshot, not a live order ticket. The primary quote to compare against Pay now, Receive now, and the protective stop.",
    act: "Read LTP first. Pay now / Receive now are fill-now levels around this print, not opposite instructions.",
    avoid: "Do not treat LTP itself as an order. The action decides whether to transact.",
  },
  enterAt,
  exitAt,
  payReceive,
  buyAt: enterAt,
  sellAt: exitAt,
  stop: {
    title: "Protective stop",
    meaning:
      "A suggested stop under LTP: last minus (stop multiple × today’s high–low range, or 1.2% of last if the range is missing). Published on BUY and HOLD; omitted on confirmed SELL. This is a reference stop, not a broker order.",
    act: "If you are long (BUY or HOLD), this is where to come out if price reaches this risk level after entry.",
    avoid: "Do not use a stop as a reason to enter. Do not assume a blank stop on SELL/NONE is a hidden target.",
  },
  smaFast: {
    title: "Fast average (days)",
    meaning:
      "The short-term trend. Default 50: the typical average of the last ~50 daily closes. Last price versus this line is the nearer trend.",
    act: "Compare last price with this line. Near it in an uptrend can print BUY; stretched far above can print HOLD (do not add); below it in a weakening trend can print SELL.",
    avoid: "Do not treat 50 days as a magic number or a promised edge. This is not a backtest win rate.",
  },
  smaSlow: {
    title: "Slow average (days)",
    meaning:
      "The long-term trend. Default 200: about 200 daily closes. Fast above slow is the usual 50/200 uptrend structure; mixed or below is wait/caution.",
    act: "Use it as structure, not as an order. When the fast average sits above the slow, the book can look for entries. When the lines are mixed or the slow window is not filled, stay on wait/caution.",
    avoid: "Do not treat 50/200 as a guarantee the name will rise. This is not a backtest win rate.",
  },
  stopMultiple: {
    title: "Stop multiple",
    meaning:
      "How far the protective stop sits under last traded price. Default 2.1. The stop is last minus (this multiple × today’s high–low range). If that range is missing, the range is 1.2% of last. Larger multiple = stop farther from price = more room, and more rupees at risk if the tape is wrong. This is a reference stop, not a broker order.",
    act: "Use it only if you are already long (BUY or HOLD). Widen the multiple only if you can accept a larger loss if you are wrong. Place any stop with your official broker — this site does not send orders.",
    avoid:
      "Do not use the stop as a reason to enter. Do not treat this as a backtest win rate. The gap between the fast and slow averages is not used for this stop.",
    extra:
      "Formula: stop = last − (stop multiple × range). range = (day high − day low) when both exist and high > low; otherwise range = last × 0.012. Then rounded to 2 decimal places.",
  },
  conviction: {
    title: "Conviction",
    meaning:
      "A 0–100 structural score from this snapshot — not a historical win rate, not audited past performance, and not a guarantee.",
    act: "Read it as confidence in the live structure: higher leans bullish (aligned averages, BUY that is not extended); lower leans bearish (SELL / downtrend). Use it as an overlay on the action, not as a standalone order.",
    avoid: "Do not quote this as a success rate. We do not have a colleague O2/O6 backtest. Do not treat 90% as a promise the trade will work.",
    extra: `Formula: start ${CONVICTION_WEIGHTS.base}; +${CONVICTION_WEIGHTS.priceAboveFast} if last price is above the fast average; +${CONVICTION_WEIGHTS.fastAboveSlow} if the fast average is above the slow average; +${CONVICTION_WEIGHTS.buyNotExtended} if the action is BUY and price is not extended (more than 3.5% above the fast average); −${CONVICTION_WEIGHTS.sellOrDowntrend} if the action is SELL or the tape is in a downtrend. Rounded and clamped 0–100.`,
  },
  session: {
    title: "Session status",
    meaning:
      "This line says whether live prices are being taken. On Nifty 500 it is the NSE India equity session (9:15 am–3:30 pm IST, Monday–Friday). On gold, silver and copper it is US metals futures on COMEX (CME Globex), timed in Chicago — not the Indian MCX and not NSE cash. COMEX runs Sunday 5:00 pm – Friday 4:00 pm Chicago time, with a daily pause 4–5 pm. Indian Standard Time is about 10½ hours ahead of Chicago. An NSE holiday does not close COMEX.",
    act: "Treat enter/exit as live research only while the session is open. Snapshots refresh on the cadence in Settings. Place orders with your official broker.",
    avoid: "Do not place orders from this site, and do not use a closed-session screen as a ticket. Quotes are not requested while the session is shut. NSE holidays do not close COMEX.",
  },
  change: {
    title: "Change",
    meaning:
      "Last minus Close (previous settlement), as a dollar amount on COMEX and a percent on both columns. Green is up versus that close; red is down.",
    act: "Use it as tape context next to the action — a green day does not by itself mean BUY.",
    avoid: "Do not trade on the day’s change alone. The action is driven by trend versus the fast and slow averages.",
  },
  close: {
    title: "Close",
    meaning:
      "COMEX close (previous settlement), not last trade. During the Globex session this is today’s daily open when that is the board settlement; otherwise the previous completed daily close. It is not Yahoo’s session last from an earlier day.",
    act: "Read Change as last minus this Close. High and low stay this session’s range.",
    avoid:
      "Do not treat Close as the live last print. A prior session last (for example 4408.90) is not the Close when the board shows settlement near today’s open.",
  },
} satisfies Record<string, TipBody>;

export type TipKey = Action | keyof typeof TIPS;

export function tipFor(key: TipKey): TipBody {
  if (key in ACTION_TIPS) return ACTION_TIPS[key as Action];
  return TIPS[key as keyof typeof TIPS];
}
