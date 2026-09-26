import type { EngineConfig, LagVenue } from "./types";

/** Conservative CoinSwitch-style lot sizes for the paper desk. */
export const MIN_QTY: Record<string, number> = {
  BTCUSDT: 0.001,
  ETHUSDT: 0.001,
  SOLUSDT: 0.01,
  BNBUSDT: 0.01,
  XRPUSDT: 1,
  DOGEUSDT: 1,
  ADAUSDT: 1,
  AVAXUSDT: 0.1,
  LINKUSDT: 0.1,
  DOTUSDT: 0.1,
  LTCUSDT: 0.01,
  SUIUSDT: 1,
  NEARUSDT: 0.1,
  APTUSDT: 0.01,
  ARBUSDT: 1,
  OPUSDT: 1,
  UNIUSDT: 0.1,
  ATOMUSDT: 0.1,
  FILUSDT: 0.1,
  PEPEUSDT: 100000,
  SHIBUSDT: 10000,
  WIFUSDT: 1,
};

export const CANDIDATE_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "BNBUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ARBUSDT",
  "UNIUSDT",
  "ATOMUSDT",
  "FILUSDT",
] as const;

/** Taker fees as used for hurdle + PnL. CoinDCX 0.05% USDT-M + 18% GST. */
export const VENUE_PROFILE: Record<
  LagVenue,
  { label: string; short: string; entryTakerFee: number; exitTakerFee: number; extraLagSpreadBps: number }
> = {
  COINSWITCH: {
    label: "CoinSwitch PRO",
    short: "CS",
    entryTakerFee: 0.00065,
    exitTakerFee: 0.00065,
    extraLagSpreadBps: 4,
  },
  COINDCX: {
    label: "CoinDCX",
    short: "DCX",
    entryTakerFee: 0.00059,
    exitTakerFee: 0.00059,
    extraLagSpreadBps: 5,
  },
};

export const DEFAULT_CONFIG: EngineConfig = {
  paperTrading: true,
  lagVenue: "COINSWITCH",
  startingCapitalInr: 10000,
  allocPct: 100,
  maxSessionLossInr: 1000,
  slotCount: 10,
  leverage: 10,
  entryTakerFee: VENUE_PROFILE.COINSWITCH.entryTakerFee,
  exitTakerFee: VENUE_PROFILE.COINSWITCH.exitTakerFee,
  slippageBuffer: 0.0005,
  maxTobPct: 0.25,
  holdTimeoutSec: 45,
  minStopPct: 0.0015,
  volStopMult: 2.2,
  lagMs: 220,
  extraLagSpreadBps: VENUE_PROFILE.COINSWITCH.extraLagSpreadBps,
  maxSlippagePct: 0.001,
  pollMs: 400,
  calibrationHours: 72,
  candidateSymbols: [...CANDIDATE_SYMBOLS],
};

export function clampAlloc(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(1, Math.round(n)));
}

export function venueLabel(venue: LagVenue): string {
  return VENUE_PROFILE[venue]?.label ?? venue;
}

export function venueShort(venue: LagVenue): string {
  return VENUE_PROFILE[venue]?.short ?? venue;
}

export function applyVenue(cfg: EngineConfig, venue: LagVenue): EngineConfig {
  const p = VENUE_PROFILE[venue];
  return {
    ...cfg,
    lagVenue: venue,
    entryTakerFee: p.entryTakerFee,
    exitTakerFee: p.exitTakerFee,
    extraLagSpreadBps: p.extraLagSpreadBps,
  };
}

/** INR earmarked for slots at session start (wallet × alloc %). */
export function allocatedSeed(cfg: EngineConfig): number {
  return cfg.startingCapitalInr * (clampAlloc(cfg.allocPct) / 100);
}

/** Allocated seed plus realized session PnL — this is what sizes slots. */
export function tradingEquity(cfg: EngineConfig, realizedNetInr: number): number {
  return allocatedSeed(cfg) + realizedNetInr;
}

export function hurdlePct(cfg: EngineConfig): number {
  return cfg.entryTakerFee + cfg.exitTakerFee + cfg.slippageBuffer;
}

export function minQty(symbol: string): number {
  return MIN_QTY[symbol] ?? 0.01;
}

export function roundQty(qty: number, step: number): number {
  if (step <= 0) return qty;
  const rounded = Math.floor(qty / step + 1e-12) * step;
  const decimals = step >= 1 ? 0 : Math.min(8, (step.toString().split(".")[1] ?? "").length);
  return Number(rounded.toFixed(decimals));
}

export function baseOf(symbol: string): string {
  return symbol.replace(/USDT$/i, "");
}
