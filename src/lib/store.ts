import type { DiscoveryState, QuoteResult } from "../types";

const KEYS = {
  discovery: "homate:discovery",
  quote: "homate:quote",
  seed: "homate:seed",
};

export function saveDiscovery(d: DiscoveryState) {
  sessionStorage.setItem(KEYS.discovery, JSON.stringify(d));
}
export function loadDiscovery(): DiscoveryState | null {
  const raw = sessionStorage.getItem(KEYS.discovery);
  return raw ? (JSON.parse(raw) as DiscoveryState) : null;
}
export function saveQuote(q: QuoteResult) {
  sessionStorage.setItem(KEYS.quote, JSON.stringify(q));
}
export function loadQuote(): QuoteResult | null {
  const raw = sessionStorage.getItem(KEYS.quote);
  return raw ? (JSON.parse(raw) as QuoteResult) : null;
}
export function loadSeed(): string | null {
  return sessionStorage.getItem(KEYS.seed);
}
export function clearFlow() {
  Object.values(KEYS).forEach((k) => sessionStorage.removeItem(k));
}
