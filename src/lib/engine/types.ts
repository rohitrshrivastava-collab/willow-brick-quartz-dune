export type Side = "LONG" | "SHORT";
export type ExitReason = "TARGET" | "TIMEOUT" | "STOP" | "SCRATCH" | "MANUAL";
export type EngineStatus = "idle" | "running" | "paused";
export type AppView =
  | "desk"
  | "universe"
  | "blotter"
  | "alerts"
  | "reports"
  | "architecture"
  | "config"
  | "source"
  | "latency";

export type Book = {
  symbol: string;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  last: number;
  quoteVolume24h: number;
  priceChangePct: number;
  ts: number;
};

export type PairState = {
  symbol: string;
  lead: Book | null;
  lag: Book | null;
  leadMid: number;
  lagSpreadBps: number;
  longDiv: number;
  shortDiv: number;
  hurdle: number;
  eligible: boolean;
  skipReason: string | null;
  minQty: number;
  slotLocked: boolean;
  volEwma: number;
};

export type Position = {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  entryPx: number;
  entryTs: number;
  targetPx: number;
  stopPx: number;
  timeoutTs: number;
  expectedSpread: number;
  notionalUsdt: number;
  notionalInr: number;
  filledQty: number;
  requestedQty: number;
  leverage: number;
  paper: true;
  status: "OPEN" | "CLOSING";
  latencyMs: number;
  armedBreakeven?: boolean;
};

export type Trade = {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  entryPx: number;
  exitPx: number;
  entryTs: number;
  exitTs: number;
  holdSec: number;
  grossUsdt: number;
  feesUsdt: number;
  netUsdt: number;
  netInr: number;
  reason: ExitReason;
  latencyMs: number;
  paper: true;
};

export type AlertMsg = {
  id: string;
  ts: number;
  kind: "ENTRY" | "EXIT" | "INFO" | "WARN" | "HOUR";
  title: string;
  body: string;
};

export type HourReport = {
  id: string;
  ts: number;
  hourIndex: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossUsdt: number;
  feesUsdt: number;
  netUsdt: number;
  netInr: number;
  equityInr: number;
  freeInr: number;
  avgHoldSec: number;
  avgLatencyMs: number;
};

export type LatencySample = {
  ts: number;
  binanceMs: number | null;
  coinswitchMs: number | null;
  fxMs: number | null;
};

export type EngineConfig = {
  paperTrading: boolean;
  startingCapitalInr: number;
  slotCount: number;
  leverage: number;
  entryTakerFee: number;
  exitTakerFee: number;
  slippageBuffer: number;
  maxTobPct: number;
  holdTimeoutSec: number;
  minStopPct: number;
  volStopMult: number;
  lagMs: number;
  extraLagSpreadBps: number;
  maxSlippagePct: number;
  pollMs: number;
  calibrationHours: number;
  candidateSymbols: string[];
};

export type MarketSnapshot = {
  ok: boolean;
  ts: number;
  venue: string;
  usdtInr: number;
  fxSource: string;
  tickers: Book[];
  error?: string;
};
