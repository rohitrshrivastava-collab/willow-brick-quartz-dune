import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyVenue, clampAlloc, DEFAULT_CONFIG, tradingEquity } from "./config";
import { createEngineState, ingestSnapshot, sessionStats, type EngineState } from "./core";
import type { AppView, EngineConfig, LagVenue, LatencySample, MarketSnapshot } from "./types";

type DeskState = {
  view: AppView;
  hydrated: boolean;
  liveIntent: boolean;
  engine: EngineState;
  feed: { lastOk: boolean; lastError: string | null; lastMs: number; polls: number };
  latency: LatencySample[];
  setView: (view: AppView) => void;
  setHydrated: () => void;
  setLiveIntent: (live: boolean) => void;
  setLagVenue: (venue: LagVenue) => void;
  patchConfig: (partial: Partial<EngineConfig>) => void;
  start: () => void;
  stop: () => void;
  resetSession: () => void;
  ingest: (snap: MarketSnapshot) => void;
  notePoll: (ok: boolean, error: string | null, ms: number) => void;
  pushLatency: (sample: LatencySample) => void;
};

function nextConfig(cfg: EngineConfig, partial: Partial<EngineConfig>): EngineConfig {
  let next: EngineConfig = { ...cfg, ...partial, paperTrading: true };
  if (partial.lagVenue && partial.lagVenue !== cfg.lagVenue) {
    next = applyVenue(next, partial.lagVenue);
  }
  if (partial.allocPct != null) next.allocPct = clampAlloc(partial.allocPct);
  if (partial.maxSessionLossInr != null) {
    next.maxSessionLossInr = Math.max(0, partial.maxSessionLossInr);
  }
  if (partial.startingCapitalInr != null) {
    next.startingCapitalInr = Math.max(0, partial.startingCapitalInr);
  }
  return next;
}

export const useDesk = create<DeskState>()(
  persist(
    (set, get) => ({
      view: "desk",
      hydrated: false,
      liveIntent: false,
      engine: createEngineState(DEFAULT_CONFIG),
      feed: { lastOk: false, lastError: null, lastMs: 0, polls: 0 },
      latency: [],
      setView: (view) => set({ view }),
      setHydrated: () => set({ hydrated: true }),
      setLiveIntent: (live) => set({ liveIntent: live }),
      setLagVenue: (venue) => get().patchConfig({ lagVenue: venue }),
      patchConfig: (partial) =>
        set((s) => {
          const cfg = nextConfig(s.engine.cfg, partial);
          return {
            engine: {
              ...s.engine,
              cfg,
              equityInr: tradingEquity(cfg, s.engine.realizedNetInr),
            },
          };
        }),
      start: () =>
        set((s) => {
          if (s.engine.halted) {
            const stats = sessionStats(s.engine);
            const cap = s.engine.cfg.maxSessionLossInr;
            if (cap > 0 && stats.lossUsed >= cap) {
              return s;
            }
          }
          const now = Date.now();
          return {
            engine: {
              ...s.engine,
              status: "running",
              halted: false,
              haltReason: null,
              sessionStart: s.engine.sessionStart ?? now,
              hourBucket:
                s.engine.hourBucket.start === 0
                  ? { start: now, trades: [] }
                  : s.engine.hourBucket,
            },
          };
        }),
      stop: () =>
        set((s) => ({
          engine: { ...s.engine, status: s.engine.status === "idle" ? "idle" : "paused" },
        })),
      resetSession: () =>
        set((s) => ({
          engine: createEngineState(s.engine.cfg),
          feed: { lastOk: false, lastError: null, lastMs: 0, polls: 0 },
        })),
      ingest: (snap) =>
        set((s) => {
          if (s.engine.status !== "running") {
            return {
              engine: {
                ...s.engine,
                usdtInr: snap.usdtInr || s.engine.usdtInr,
                fxSource: snap.fxSource,
                venue: snap.venue,
              },
            };
          }
          const next = ingestSnapshot(
            {
              ...s.engine,
              cfg: s.engine.cfg,
              positions: [...s.engine.positions],
              trades: [...s.engine.trades],
              alerts: [...s.engine.alerts],
              reports: [...s.engine.reports],
              delayBuf: [...s.engine.delayBuf],
              lastSpreadHist: { ...s.engine.lastSpreadHist },
              vol: { ...s.engine.vol },
              lastMids: { ...s.engine.lastMids },
              hourBucket: {
                start: s.engine.hourBucket.start,
                trades: [...s.engine.hourBucket.trades],
              },
            },
            snap.tickers,
            snap.usdtInr,
            snap.fxSource,
            snap.venue,
            snap.ts,
          );
          return { engine: next };
        }),
      notePoll: (ok, error, ms) =>
        set((s) => ({
          feed: { lastOk: ok, lastError: error, lastMs: ms, polls: s.feed.polls + 1 },
        })),
      pushLatency: (sample) =>
        set((s) => ({ latency: [sample, ...s.latency].slice(0, 40) })),
    }),
    {
      name: "lagforge-desk-v4",
      partialize: (s) => ({
        engine: {
          ...s.engine,
          status: s.engine.status === "running" ? "paused" : s.engine.status,
          delayBuf: [],
        },
        view: s.view,
        liveIntent: false,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

export function useStats() {
  return sessionStats(useDesk.getState().engine);
}
