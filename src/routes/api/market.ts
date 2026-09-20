import { createFileRoute } from "@tanstack/react-router";
import { CANDIDATE_SYMBOLS } from "@/lib/engine/config";
import type { Book, MarketSnapshot } from "@/lib/engine/types";

const SYMBOLS = [...CANDIDATE_SYMBOLS];
const FX_TTL_MS = 60_000;

let fxCache: { rate: number; source: string; ts: number } | null = null;

function symbolsParam(symbols: string[]): string {
  return encodeURIComponent(JSON.stringify(symbols));
}

async function fetchJson(url: string, ms = 4500): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function loadFx(): Promise<{ rate: number; source: string }> {
  const now = Date.now();
  if (fxCache && now - fxCache.ts < FX_TTL_MS) {
    return { rate: fxCache.rate, source: fxCache.source };
  }
  try {
    const data = (await fetchJson("https://open.er-api.com/v6/latest/USD")) as {
      result?: string;
      rates?: { INR?: number };
    };
    const inr = data.rates?.INR;
    if (data.result === "success" && typeof inr === "number" && inr > 0) {
      fxCache = { rate: inr, source: "open.er-api USD/INR ≈ USDT/INR", ts: now };
      return { rate: inr, source: fxCache.source };
    }
  } catch {
    /* fall through */
  }
  if (fxCache) return { rate: fxCache.rate, source: `${fxCache.source} (stale)` };
  return { rate: 96, source: "fallback USDINR 96" };
}

type VisionBook = {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
};

type Vision24 = {
  symbol: string;
  lastPrice: string;
  quoteVolume: string;
  priceChangePercent: string;
};

async function loadBinance(): Promise<{ tickers: Book[]; venue: string } | null> {
  const q = symbolsParam(SYMBOLS);
  try {
    const [books, stats] = await Promise.all([
      fetchJson(
        `https://data-api.binance.vision/api/v3/ticker/bookTicker?symbols=${q}`,
      ) as Promise<VisionBook[]>,
      fetchJson(
        `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${q}`,
      ) as Promise<Vision24[]>,
    ]);
    const statMap = new Map(stats.map((s) => [s.symbol, s]));
    const tickers: Book[] = books
      .map((b) => {
        const s = statMap.get(b.symbol);
        const bid = Number(b.bidPrice);
        const ask = Number(b.askPrice);
        return {
          symbol: b.symbol,
          bid,
          ask,
          bidQty: Number(b.bidQty),
          askQty: Number(b.askQty),
          last: Number(s?.lastPrice ?? (bid + ask) / 2),
          quoteVolume24h: Number(s?.quoteVolume ?? 0),
          priceChangePct: Number(s?.priceChangePercent ?? 0),
          ts: Date.now(),
        } satisfies Book;
      })
      .filter((t) => t.bid > 0 && t.ask > 0);
    if (!tickers.length) return null;
    return { tickers, venue: "binance.vision spot book (lead proxy)" };
  } catch {
    return null;
  }
}

const seedPx: Record<string, number> = {
  BTCUSDT: 76300,
  ETHUSDT: 2440,
  SOLUSDT: 101,
  XRPUSDT: 2.18,
  DOGEUSDT: 0.128,
  BNBUSDT: 590,
  ADAUSDT: 0.62,
  AVAXUSDT: 28.4,
  LINKUSDT: 13.2,
  SUIUSDT: 2.55,
  DOTUSDT: 4.7,
  LTCUSDT: 78,
  NEARUSDT: 4.1,
  APTUSDT: 8.4,
  ARBUSDT: 0.38,
  UNIUSDT: 7.1,
  ATOMUSDT: 4.4,
  FILUSDT: 3.9,
};

function synthetic(): Book[] {
  const t = Date.now();
  return SYMBOLS.map((symbol, i) => {
    const base = seedPx[symbol] ?? 10;
    const wave = Math.sin(t / 900 + i) * 0.0009 + Math.sin(t / 2400 + i * 0.4) * 0.0016;
    const jump = Math.sin(t / 180 + i * 1.7) > 0.985 ? 0.0024 * Math.sign(Math.sin(t + i)) : 0;
    const px = base * (1 + wave + jump);
    const spread = px * (0.00004 + (i % 5) * 0.00001);
    return {
      symbol,
      bid: px - spread / 2,
      ask: px + spread / 2,
      bidQty: 20 + (i * 7) % 40,
      askQty: 18 + (i * 5) % 35,
      last: px,
      quoteVolume24h: 8_000_000 * (18 - i),
      priceChangePct: wave * 100,
      ts: t,
    };
  });
}

export const Route = createFileRoute("/api/market")({
  server: {
    handlers: {
      GET: async () => {
        const fx = await loadFx();
        const live = await loadBinance();
        const body: MarketSnapshot = live
          ? {
              ok: true,
              ts: Date.now(),
              venue: live.venue,
              usdtInr: fx.rate,
              fxSource: fx.source,
              tickers: live.tickers,
            }
          : {
              ok: true,
              ts: Date.now(),
              venue: "synthetic replay (Binance public feed unreachable)",
              usdtInr: fx.rate,
              fxSource: fx.source,
              tickers: synthetic(),
              error: "lead feed fallback",
            };
        return Response.json(body, {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
