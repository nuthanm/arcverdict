export type Action = "BUY" | "SELL" | "HOLD" | "WATCH" | "NONE";
export type InstrumentKind = "equity" | "etf";
export type PriceSource = "bid_ask" | "last";
export type QuoteCurrency = "INR" | "USD";
export type FxSource = "live" | "cached";

export type ScanRow = {
  ticker: string;
  name: string;
  kind: InstrumentKind;
  last: number | null;
  buyAt: number | null;
  sellAt: number | null;
  priceSource: PriceSource;
  changePct: number | null;
  smaFast: number | null;
  smaSlow: number | null;
  action: Action;
  why: string;
  stop: number | null;
  conviction: number;
  asOf: string | null;
};

export type MetalCode = "gold" | "silver" | "copper";

export type EtfQuote = {
  ticker: string;
  name: string;
  last: number | null;
  buyAt: number | null;
  sellAt: number | null;
  priceSource: PriceSource;
  changePct: number | null;
  action: Action;
  why: string;
  stop: number | null;
  conviction: number;
  asOf: string | null;
};

export type MetalQuote = {
  code: MetalCode;
  name: string;
  venue: string;
  yahoo: string;
  lastUsd: number | null;
  lastInr: number | null;
  buyAt: number | null;
  sellAt: number | null;
  priceSource: PriceSource;
  quoteCurrency: QuoteCurrency;
  unit: string;
  changePct: number | null;
  changeUsd: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  prevClose: number | null;
  smaFast: number | null;
  smaSlow: number | null;
  action: Action;
  why: string;
  stop: number | null;
  conviction: number;
  asOf: string | null;
  etfs: EtfQuote[];
};

export type SessionInfo = {
  market: string;
  open: boolean;
  label: string;
  hours: string;
  timezone: "Asia/Kolkata" | "America/Chicago";
  nextOpen: string | null;
};

export type RefreshMode = "continuous" | "1m" | "5m" | "15m" | "1h" | "manual";

export type DeskSettings = {
  refreshMode: RefreshMode;
  continuousSeconds: number;
  smaFast: number;
  smaSlow: number;
  stopMultiple: number;
};
