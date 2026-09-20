import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CONFIG } from "./config";
import { createEngineState, ingestSnapshot, sessionStats, type EngineState } from "./core";
import type { AppView, EngineConfig, LatencySample, MarketSnapshot } from "./types";

type DeskState = {
  view: AppView;
  hydrated: boolean;
  engine: EngineState;
  feed: { lastOk: boolean; lastError: string | null; lastMs: number; polls: number };
  latency: LatencySample[];
  setView: (view: AppView) => void;
  setHydrated: () => void;
  patchConfig: (partial: Partial<EngineConfig>) => void;
  start: () => void;
  stop: () => void;
  resetSession: () => void;
  ingest: (snap: MarketSnapshot) => void;
  notePoll: (ok: boolean, error: string | null, ms: number) => void;
  pushLatency: (sample: LatencySample) => void;
};

export const useDesk = create<DeskState>()(
  persist(
    (set, get) => ({
      view: "desk",
      hydrated: false,
      engine: createEngineState(DEFAULT_CONFIG),
      feed: { lastOk: false, lastError: null, lastMs: 0, polls: 0 },
      latency: [],
      setView: (view) => set({ view }),
      setHydrated: () => set({ hydrated: true }),
      patchConfig: (partial) =>
        set((s) => ({
          engine: {
            ...s.engine,
            cfg: { ...s.engine.cfg, ...partial, paperTrading: true },
          },
        })),
      start: () =>
        set((s) => {
          const now = Date.now();
          return {
            engine: {
              ...s.engine,
              status: "running",
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
      name: "lagforge-desk-v2",
      partialize: (s) => ({
        engine: {
          ...s.engine,
          status: s.engine.status === "running" ? "paused" : s.engine.status,
          delayBuf: [],
        },
        view: s.view,
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
