import type { EngineConfig } from "./types";

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

export const DEFAULT_CONFIG: EngineConfig = {
  paperTrading: true,
  startingCapitalInr: 10000,
  slotCount: 10,
  leverage: 10,
  entryTakerFee: 0.00065,
  exitTakerFee: 0.00065,
  slippageBuffer: 0.0005,
  maxTobPct: 0.25,
  holdTimeoutSec: 45,
  minStopPct: 0.0015,
  volStopMult: 2.2,
  lagMs: 220,
  extraLagSpreadBps: 4,
  maxSlippagePct: 0.001,
  pollMs: 400,
  calibrationHours: 72,
  candidateSymbols: [...CANDIDATE_SYMBOLS],
};

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
