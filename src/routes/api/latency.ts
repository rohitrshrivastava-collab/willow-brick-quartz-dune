import { createFileRoute } from "@tanstack/react-router";

async function rtt(url: string, ms = 4000): Promise<number | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: ctrl.signal });
    await res.arrayBuffer();
    if (!res.ok && res.status >= 500) return null;
    return Date.now() - t0;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const Route = createFileRoute("/api/latency")({
  server: {
    handlers: {
      GET: async () => {
        const [binanceMs, coinswitchMs, fxMs] = await Promise.all([
          rtt("https://data-api.binance.vision/api/v3/ping"),
          rtt("https://coinswitch.co/trade/api/v2/time"),
          rtt("https://open.er-api.com/v6/latest/USD"),
        ]);
        return Response.json({
          ts: Date.now(),
          note: "Round-trip from this hosted desk, not your EC2 box. Run latency_bench.py locally for Mumbai numbers.",
          binanceMs,
          coinswitchMs,
          fxMs,
          targets: {
            binance: "https://data-api.binance.vision/api/v3/ping",
            coinswitch: "https://coinswitch.co/trade/api/v2/time",
            fx: "https://open.er-api.com/v6/latest/USD",
          },
        });
      },
    },
  },
});
