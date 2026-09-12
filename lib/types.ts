export type Action = "BUY" | "SELL" | "HOLD" | "WATCH" | "NONE";
export type InstrumentKind = "equity" | "etf";
export type PriceSource = "bid_ask" | "last";

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
  unit: string;
  changePct: number | null;
  smaFast: number | null;
  smaSlow: number | null;
  action: Action;
  why: string;
  stop: number | null;
  asOf: string | null;
  etfs: EtfQuote[];
};

export type SessionInfo = {
  market: string;
  open: boolean;
  label: string;
  hours: string;
  timezone: "Asia/Kolkata";
  nextOpen: string | null;
};

export type RefreshMode = "continuous" | "1m" | "5m" | "15m" | "1h" | "manual";

export type DeskSettings = {
  refreshMode: RefreshMode;
  smaFast: number;
  smaSlow: number;
  stopMultiple: number;
};
