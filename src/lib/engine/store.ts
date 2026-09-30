import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyVenue, clampAlloc, DEFAULT_CONFIG, tradingEquity } from "./config";
import { createEngineState, ingestSnapshot, sessionStats, type EngineState } from "./core";
import type { AppView, EngineConfig, LagVenue, LatencySample, MarketSnapshot } from "./types";

type DeskState = {
  view: AppView;
  hydrated: boolean;
  liveIntent: boolean;
  keysSaved: boolean;
  confirmLive: boolean;
  liveNotice: string | null;
  engine: EngineState;
  feed: { lastOk: boolean; lastError: string | null; lastMs: number; polls: number };
  latency: LatencySample[];
  setView: (view: AppView) => void;
  setHydrated: () => void;
  setLiveIntent: (live: boolean) => void;
  setLagVenue: (venue: LagVenue) => void;
  patchConfig: (partial: Partial<EngineConfig>) => void;
  saveKeys: (apiKey: string, secretKey: string) => boolean;
  setConfirmLive: (ok: boolean) => void;
  start: () => void;
  stop: () => void;
  resetSession: () => void;
  ingest: (snap: MarketSnapshot) => void;
  notePoll: (ok: boolean, error: string | null, ms: number) => void;
  pushLatency: (sample: LatencySample) => void;
};

function nextConfig(cfg: EngineConfig, partial: Partial<EngineConfig>): EngineConfig {
  // Hosted preview always simulates fills. liveIntent is the PAPER/LIVE control surface.
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
      keysSaved: false,
      confirmLive: false,
      liveNotice: null,
      engine: createEngineState(DEFAULT_CONFIG),
      feed: { lastOk: false, lastError: null, lastMs: 0, polls: 0 },
      latency: [],
      setView: (view) => set({ view }),
      setHydrated: () => set({ hydrated: true }),
      setLiveIntent: (live) =>
        set({
          liveIntent: live,
          liveNotice: live
            ? "Live-armed mode. Save keys + type YES, then start. This hosted preview still simulates fills."
            : null,
        }),
      setLagVenue: (venue) => {
        const wasLive = get().liveIntent;
        get().patchConfig({ lagVenue: venue });
        if (wasLive) {
          set({
            keysSaved: false,
            confirmLive: false,
            liveNotice: "Venue changed. Save keys for this exchange before starting live-armed.",
          });
        }
      },
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
      saveKeys: (apiKey, secretKey) => {
        if (!apiKey.trim() || !secretKey.trim()) return false;
        set({ keysSaved: true, liveNotice: null });
        return true;
      },
      setConfirmLive: (ok) => set({ confirmLive: ok, liveNotice: ok ? null : "Type YES to arm live." }),
      start: () =>
        set((s) => {
          if (s.liveIntent && !s.keysSaved) {
            return { ...s, liveNotice: "Paste and save API key + secret for this venue, then start." };
          }
          if (s.liveIntent && !s.confirmLive) {
            return { ...s, liveNotice: "Type YES in Confirm live, save, then start." };
          }
          if (s.engine.halted) {
            const stats = sessionStats(s.engine);
            const cap = s.engine.cfg.maxSessionLossInr;
            if (cap > 0 && stats.lossUsed >= cap) {
              return s;
            }
          }
          const now = Date.now();
          return {
            liveNotice: s.liveIntent
              ? "Loop on · live-armed rehearsal. Fills here stay simulated. python main.py on your PC routes real orders."
              : null,
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
          liveNotice: null,
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
      name: "lagforge-desk-v5",
      partialize: (s) => ({
        engine: {
          ...s.engine,
          status: s.engine.status === "running" ? "paused" : s.engine.status,
          delayBuf: [],
        },
        view: s.view,
        liveIntent: s.liveIntent,
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
