function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  return value?.trim() || undefined;
}

export const env = {
  marketDataBaseUrl: (
    required("MARKET_DATA_BASE_URL", "https://query1.finance.yahoo.com") ??
    "https://query1.finance.yahoo.com"
  ).replace(/\/$/, ""),
  marketDataApiKey: required("MARKET_DATA_API_KEY"),
  marketDataUserAgent: required(
    "MARKET_DATA_USER_AGENT",
    "Mozilla/5.0 (compatible; ArcVerdict/1.0)",
  ),
  scanConcurrency: Number(required("SCAN_CONCURRENCY", "6") ?? "6") || 6,
  allowClosedMarketFetch: required("ALLOW_CLOSED_MARKET_FETCH") === "true",
};
