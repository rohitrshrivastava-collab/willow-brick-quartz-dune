import { hurdlePct, minQty, roundQty, tradingEquity } from "./config";
import type {
  AlertMsg,
  Book,
  EngineConfig,
  HourReport,
  PairState,
  Position,
  Side,
  Trade,
} from "./types";

export type EngineState = {
  cfg: EngineConfig;
  status: "idle" | "running" | "paused";
  halted: boolean;
  haltReason: string | null;
  sessionStart: number | null;
  lastTick: number;
  usdtInr: number;
  fxSource: string;
  venue: string;
  equityInr: number;
  realizedNetInr: number;
  realizedGrossUsdt: number;
  realizedFeesUsdt: number;
  lead: Record<string, Book>;
  lag: Record<string, Book>;
  pairs: Record<string, PairState>;
  positions: Position[];
  trades: Trade[];
  alerts: AlertMsg[];
  reports: HourReport[];
  universe: string[];
  delayBuf: { t: number; books: Record<string, Book> }[];
  lastMids: Record<string, { px: number; t: number }>;
  vol: Record<string, number>;
  hourCursor: number;
  hourBucket: {
    start: number;
    trades: Trade[];
  };
  ticks: number;
  lastSpreadHist: Record<string, number[]>;
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function mid(b: Book): number {
  return (b.bid + b.ask) / 2;
}

/** Lowest LONG exit / highest SHORT exit that is net-flat after round-trip taker fees. */
export function scratchPx(side: Side, entry: number, entryFee: number, exitFee: number): number {
  if (side === "LONG") return (entry * (1 + entryFee)) / Math.max(1e-9, 1 - exitFee);
  return (entry * (1 - entryFee)) / (1 + exitFee);
}

export function netUsdt(
  side: Side,
  entry: number,
  exit: number,
  qty: number,
  entryFee: number,
  exitFee: number,
): number {
  const gross = side === "LONG" ? (exit - entry) * qty : (entry - exit) * qty;
  return gross - (entry * qty * entryFee + exit * qty * exitFee);
}

function pushAlert(
  state: EngineState,
  kind: AlertMsg["kind"],
  title: string,
  body: string,
  ts: number,
) {
  state.alerts = [
    { id: uid("al"), ts, kind, title, body },
    ...state.alerts,
  ].slice(0, 200);
}

export function createEngineState(cfg: EngineConfig, now = Date.now()): EngineState {
  return {
    cfg,
    status: "idle",
    halted: false,
    haltReason: null,
    sessionStart: null,
    lastTick: now,
    usdtInr: 96,
    fxSource: "seed",
    venue: "binance",
    equityInr: tradingEquity(cfg, 0),
    realizedNetInr: 0,
    realizedGrossUsdt: 0,
    realizedFeesUsdt: 0,
    lead: {},
    lag: {},
    pairs: {},
    positions: [],
    trades: [],
    alerts: [],
    reports: [],
    universe: [],
    delayBuf: [],
    lastMids: {},
    vol: {},
    hourCursor: 0,
    hourBucket: { start: now, trades: [] },
    ticks: 0,
    lastSpreadHist: {},
  };
}

function screenUniverse(
  tickers: Book[],
  cfg: EngineConfig,
  usdtInr: number,
  equityInr: number,
): string[] {
  const slotUsdt = equityInr / cfg.slotCount / Math.max(usdtInr, 1e-9);
  const maxNotional = slotUsdt * cfg.leverage;
  const ranked = tickers
    .filter((t) => cfg.candidateSymbols.includes(t.symbol))
    .filter((t) => t.bid > 0 && t.ask > 0 && t.ask >= t.bid)
    .map((t) => {
      const lot = minQty(t.symbol);
      const minNotional = lot * t.ask;
      return { t, minNotional, spreadBps: ((t.ask - t.bid) / t.ask) * 1e4 };
    })
    .filter((x) => x.minNotional <= maxNotional * 0.95 && x.spreadBps < 12)
    .sort((a, b) => b.t.quoteVolume24h - a.t.quoteVolume24h)
    .slice(0, cfg.slotCount)
    .map((x) => x.t.symbol);
  return ranked;
}

function applyLagSpread(book: Book, extraBps: number): Book {
  const midPx = mid(book);
  const half = (extraBps / 2 / 1e4) * midPx;
  return {
    ...book,
    bid: Math.max(0, book.bid - half),
    ask: book.ask + half,
  };
}

function sizeOrder(
  cfg: EngineConfig,
  symbol: string,
  px: number,
  tobQty: number,
  equityInr: number,
  usdtInr: number,
): { qty: number; notionalUsdt: number; notionalInr: number; reason: string | null } {
  const lot = minQty(symbol);
  const slotInr = equityInr / cfg.slotCount;
  const slotUsdt = slotInr / usdtInr;
  const notionalUsdt = slotUsdt * cfg.leverage;
  let qty = notionalUsdt / px;
  const cap = tobQty * cfg.maxTobPct;
  if (qty > cap) qty = cap;
  qty = roundQty(qty, lot);
  if (qty < lot) {
    return {
      qty: 0,
      notionalUsdt: 0,
      notionalInr: 0,
      reason: `lot ${lot} exceeds slot notional`,
    };
  }
  const slipIfFull = 0;
  if (tobQty <= 0) {
    return { qty: 0, notionalUsdt: 0, notionalInr: 0, reason: "empty top of book" };
  }
  const filledNotional = qty * px;
  return {
    qty,
    notionalUsdt: filledNotional,
    notionalInr: filledNotional * usdtInr,
    reason: slipIfFull ? "slip" : null,
  };
}

function closePosition(
  state: EngineState,
  pos: Position,
  exitPx: number,
  reason: Trade["reason"],
  ts: number,
): boolean {
  const qty = pos.filledQty;
  const gross =
    pos.side === "LONG" ? (exitPx - pos.entryPx) * qty : (pos.entryPx - exitPx) * qty;
  const feeAmt =
    pos.entryPx * qty * state.cfg.entryTakerFee + exitPx * qty * state.cfg.exitTakerFee;
  const net = gross - feeAmt;
  if (reason !== "STOP" && reason !== "KILL" && net < 0) return false;
  const netInr = net * state.usdtInr;
  const trade: Trade = {
    id: uid("tr"),
    symbol: pos.symbol,
    side: pos.side,
    qty,
    entryPx: pos.entryPx,
    exitPx,
    entryTs: pos.entryTs,
    exitTs: ts,
    holdSec: (ts - pos.entryTs) / 1000,
    grossUsdt: gross,
    feesUsdt: feeAmt,
    netUsdt: net,
    netInr,
    reason,
    latencyMs: pos.latencyMs,
    paper: true,
  };
  state.trades = [trade, ...state.trades].slice(0, 500);
  state.hourBucket.trades.push(trade);
  state.positions = state.positions.filter((p) => p.id !== pos.id);
  state.realizedNetInr += netInr;
  state.realizedGrossUsdt += gross;
  state.realizedFeesUsdt += feeAmt;
  state.equityInr = tradingEquity(state.cfg, state.realizedNetInr);
  const sign = net >= 0 ? "+" : "";
  pushAlert(
    state,
    "EXIT",
    `${pos.side} ${pos.symbol.replace("USDT", "")} ${reason}`,
    `Fill ${fmtPx(exitPx)} · qty ${qty} · net ${sign}₹${netInr.toFixed(2)} (${sign}${net.toFixed(4)} USDT) · hold ${trade.holdSec.toFixed(1)}s · PAPER`,
    ts,
  );
  return true;
}

function markUnrealizedInr(state: EngineState): number {
  return state.positions.reduce((s, p) => {
    const C = state.lag[p.symbol];
    if (!C) return s;
    const mark = p.side === "LONG" ? C.bid : C.ask;
    return (
      s +
      netUsdt(
        p.side,
        p.entryPx,
        mark,
        p.filledQty,
        state.cfg.entryTakerFee,
        state.cfg.exitTakerFee,
      ) *
        state.usdtInr
    );
  }, 0);
}

function flattenKill(state: EngineState, ts: number) {
  for (const pos of [...state.positions]) {
    const C = state.lag[pos.symbol];
    const exitPx = C ? (pos.side === "LONG" ? C.bid : C.ask) : pos.entryPx;
    closePosition(state, pos, exitPx, "KILL", ts);
  }
  state.halted = true;
  state.haltReason = "MAX_LOSS";
  state.status = "paused";
  pushAlert(
    state,
    "WARN",
    "Session max loss hit — loop stopped",
    `Realized ${state.realizedNetInr >= 0 ? "+" : ""}₹${state.realizedNetInr.toFixed(2)} · cap ₹${state.cfg.maxSessionLossInr.toFixed(0)} · ${state.cfg.lagVenue}. Open slots flattened. Raise the cap or reset the session to arm again.`,
    ts,
  );
}

function maybeSessionKill(state: EngineState, ts: number): boolean {
  const cap = state.cfg.maxSessionLossInr;
  if (!(cap > 0) || state.halted) return state.halted;
  const pnl = state.realizedNetInr + markUnrealizedInr(state);
  if (-pnl + 1e-9 >= cap) {
    flattenKill(state, ts);
    return true;
  }
  return false;
}

function fmtPx(px: number): string {
  if (px >= 1000) return px.toFixed(2);
  if (px >= 10) return px.toFixed(3);
  if (px >= 1) return px.toFixed(4);
  return px.toPrecision(4);
}

function maybeFlushHour(state: EngineState, ts: number) {
  if (!state.sessionStart) return;
  const elapsed = ts - state.hourBucket.start;
  if (elapsed < 60 * 60 * 1000) return;
  const bucket = state.hourBucket.trades;
  const wins = bucket.filter((t) => t.netUsdt > 0).length;
  const losses = bucket.filter((t) => t.netUsdt <= 0).length;
  const trades = bucket.length;
  const gross = bucket.reduce((s, t) => s + t.grossUsdt, 0);
  const fees = bucket.reduce((s, t) => s + t.feesUsdt, 0);
  const net = bucket.reduce((s, t) => s + t.netUsdt, 0);
  const avgHold = trades ? bucket.reduce((s, t) => s + t.holdSec, 0) / trades : 0;
  const avgLat = trades ? bucket.reduce((s, t) => s + t.latencyMs, 0) / trades : 0;
  const locked = state.positions.reduce((s, p) => s + p.notionalInr / p.leverage, 0);
  const report: HourReport = {
    id: uid("hr"),
    ts,
    hourIndex: state.hourCursor + 1,
    trades,
    wins,
    losses,
    winRate: trades ? (wins / trades) * 100 : 0,
    grossUsdt: gross,
    feesUsdt: fees,
    netUsdt: net,
    netInr: net * state.usdtInr,
    equityInr: state.equityInr,
    freeInr: Math.max(0, state.equityInr - locked),
    avgHoldSec: avgHold,
    avgLatencyMs: avgLat,
  };
  state.reports = [report, ...state.reports].slice(0, 96);
  state.hourCursor += 1;
  state.hourBucket = { start: ts, trades: [] };
  pushAlert(
    state,
    "HOUR",
    `Hour ${report.hourIndex} summary`,
    `Trades ${trades} · W/L ${wins}/${losses} · WR ${report.winRate.toFixed(0)}% · net ₹${report.netInr.toFixed(2)} · equity ₹${state.equityInr.toFixed(0)} · avg hold ${avgHold.toFixed(1)}s · avg exec ${avgLat.toFixed(1)}ms`,
    ts,
  );
}

export function ingestSnapshot(
  state: EngineState,
  tickers: Book[],
  usdtInr: number,
  fxSource: string,
  venue: string,
  now: number,
): EngineState {
  if (state.status !== "running") {
    return { ...state, lastTick: now };
  }

  state.lastTick = now;
  state.usdtInr = usdtInr;
  state.fxSource = fxSource;
  state.venue = venue;
  state.ticks += 1;
  state.equityInr = tradingEquity(state.cfg, state.realizedNetInr);

  const lead: Record<string, Book> = { ...state.lead };
  for (const t of tickers) lead[t.symbol] = t;
  state.lead = lead;

  const bankroll = state.equityInr;
  const nextUniverse = screenUniverse(tickers, state.cfg, usdtInr, bankroll);
  if (nextUniverse.length) state.universe = nextUniverse;

  state.delayBuf.push({ t: now, books: Object.fromEntries(tickers.map((t) => [t.symbol, t])) });
  const lagCut = now - state.cfg.lagMs;
  let released: Record<string, Book> | null = null;
  while (state.delayBuf.length && state.delayBuf[0].t <= lagCut) {
    released = state.delayBuf.shift()!.books;
  }
  if (released) {
    const lagged: Record<string, Book> = { ...state.lag };
    for (const [sym, book] of Object.entries(released)) {
      lagged[sym] = applyLagSpread(book, state.cfg.extraLagSpreadBps);
    }
    state.lag = lagged;
  }

  const hurdle = hurdlePct(state.cfg);
  const pairs: Record<string, PairState> = {};
  const watch = new Set([...state.universe, ...state.positions.map((p) => p.symbol)]);

  for (const symbol of watch) {
    const L = state.lead[symbol];
    const C = state.lag[symbol];
    if (L) {
      const prev = state.lastMids[symbol];
      const m = mid(L);
      if (prev && now > prev.t) {
        const ret = Math.abs(m / prev.px - 1);
        const dt = (now - prev.t) / 1000;
        const inst = dt > 0 ? ret / Math.sqrt(Math.max(dt, 0.2)) : ret;
        state.vol[symbol] = (state.vol[symbol] ?? 0) * 0.94 + inst * 0.06;
      }
      state.lastMids[symbol] = { px: m, t: now };
    }
    const lot = minQty(symbol);
    const locked = state.positions.some((p) => p.symbol === symbol);
    if (!L || !C) {
      pairs[symbol] = {
        symbol,
        lead: L ?? null,
        lag: C ?? null,
        leadMid: L ? mid(L) : 0,
        lagSpreadBps: C ? ((C.ask - C.bid) / C.ask) * 1e4 : 0,
        longDiv: 0,
        shortDiv: 0,
        hurdle,
        eligible: false,
        skipReason: !C ? "awaiting lag book" : "no lead",
        minQty: lot,
        slotLocked: locked,
        volEwma: state.vol[symbol] ?? 0,
      };
      continue;
    }
    const leadMid = mid(L);
    const longDiv = (leadMid - C.ask) / C.ask;
    const shortDiv = (C.bid - leadMid) / C.bid;
    const slotUsdt = bankroll / state.cfg.slotCount / usdtInr;
    const minNotional = lot * C.ask;
    let skip: string | null = null;
    if (minNotional > slotUsdt * state.cfg.leverage) skip = "min lot > slot";
    else if (C.askQty <= 0 || C.bidQty <= 0) skip = "thin book";
    pairs[symbol] = {
      symbol,
      lead: L,
      lag: C,
      leadMid,
      lagSpreadBps: ((C.ask - C.bid) / C.ask) * 1e4,
      longDiv,
      shortDiv,
      hurdle,
      eligible: !skip && !locked,
      skipReason: locked ? "slot locked" : skip,
      minQty: lot,
      slotLocked: locked,
      volEwma: state.vol[symbol] ?? 0,
    };
    const hist = state.lastSpreadHist[symbol] ?? [];
    hist.push(Math.max(longDiv, shortDiv) * 1e4);
    if (hist.length > 90) hist.shift();
    state.lastSpreadHist[symbol] = hist;
  }
  state.pairs = pairs;

  for (const pos of [...state.positions]) {
    const C = state.lag[pos.symbol];
    if (!C) continue;
    const mark = pos.side === "LONG" ? C.bid : C.ask;
    const net = netUsdt(
      pos.side,
      pos.entryPx,
      mark,
      pos.filledQty,
      state.cfg.entryTakerFee,
      state.cfg.exitTakerFee,
    );

    if (net > 0 && !pos.armedBreakeven) {
      const next = { ...pos, armedBreakeven: true };
      state.positions = state.positions.map((p) => (p.id === pos.id ? next : p));
      Object.assign(pos, next);
    }

    if (pos.side === "LONG" && C.bid >= pos.targetPx && net > 0) {
      closePosition(state, pos, C.bid, "TARGET", now);
      continue;
    }
    if (pos.side === "SHORT" && C.ask <= pos.targetPx && net > 0) {
      closePosition(state, pos, C.ask, "TARGET", now);
      continue;
    }
    if (pos.side === "LONG" && C.bid <= pos.stopPx) {
      closePosition(state, pos, C.bid, "STOP", now);
      continue;
    }
    if (pos.side === "SHORT" && C.ask >= pos.stopPx) {
      closePosition(state, pos, C.ask, "STOP", now);
      continue;
    }
    if (now >= pos.timeoutTs && net > 0) {
      closePosition(state, pos, mark, "TIMEOUT", now);
    }
  }

  if (maybeSessionKill(state, now)) {
    maybeFlushHour(state, now);
    return state;
  }

  if (state.positions.length < state.cfg.slotCount) {
    for (const symbol of state.universe) {
      if (state.positions.some((p) => p.symbol === symbol)) continue;
      const pair = state.pairs[symbol];
      const C = state.lag[symbol];
      if (!pair || !C || !pair.eligible) continue;

      let side: Side | null = null;
      let div = 0;
      let px = 0;
      let tobQty = 0;
      if (pair.longDiv > pair.hurdle && pair.longDiv >= pair.shortDiv) {
        side = "LONG";
        div = pair.longDiv;
        px = C.ask;
        tobQty = C.askQty;
      } else if (pair.shortDiv > pair.hurdle) {
        side = "SHORT";
        div = pair.shortDiv;
        px = C.bid;
        tobQty = C.bidQty;
      }
      if (!side || px <= 0) continue;

      const sized = sizeOrder(state.cfg, symbol, px, tobQty, bankroll, usdtInr);
      if (sized.qty <= 0) continue;

      const fillFrac = 0.86 + Math.random() * 0.14;
      const filledQty = roundQty(sized.qty * fillFrac, minQty(symbol));
      if (filledQty < minQty(symbol)) continue;

      const slip = Math.min(state.cfg.maxSlippagePct, 0.00015 + Math.random() * 0.0002);
      const fillPx = side === "LONG" ? px * (1 + slip) : px * (1 - slip);
      const halfSpread = Math.max(0, (C.ask - C.bid) / 2);
      const expectedExit = side === "LONG" ? pair.leadMid - halfSpread : pair.leadMid + halfSpread;
      if (
        netUsdt(
          side,
          fillPx,
          expectedExit,
          filledQty,
          state.cfg.entryTakerFee,
          state.cfg.exitTakerFee,
        ) <= 0
      ) {
        continue;
      }
      const vol = state.vol[symbol] ?? 0.0004;
      const spreadFrac = fillPx > 0 ? (C.ask - C.bid) / fillPx : 0;
      const stopPct = Math.max(state.cfg.minStopPct, state.cfg.volStopMult * vol, spreadFrac * 3);
      const target = pair.leadMid;
      const stopPx = side === "LONG" ? fillPx * (1 - stopPct) : fillPx * (1 + stopPct);
      const latencyMs = 7 + Math.random() * 18;

      const pos: Position = {
        id: uid("pos"),
        symbol,
        side,
        qty: filledQty,
        entryPx: fillPx,
        entryTs: now,
        targetPx: target,
        stopPx,
        timeoutTs: now + state.cfg.holdTimeoutSec * 1000,
        expectedSpread: div,
        notionalUsdt: filledQty * fillPx,
        notionalInr: filledQty * fillPx * usdtInr,
        filledQty,
        requestedQty: sized.qty,
        leverage: state.cfg.leverage,
        paper: true,
        status: "OPEN",
        latencyMs,
      };
      state.positions = [pos, ...state.positions];
      const base = symbol.replace("USDT", "");
      pushAlert(
        state,
        "ENTRY",
        `${side} ${base}`,
        `Fill ${fmtPx(fillPx)} · ${filledQty}${filledQty < sized.qty ? ` (partial of ${sized.qty})` : ""} · notional ₹${pos.notionalInr.toFixed(0)} · exp spread ${(div * 100).toFixed(3)}% · tgt ${fmtPx(target)} / stop ${fmtPx(stopPx)} · PAPER`,
        now,
      );
    }
  }

  maybeFlushHour(state, now);
  return state;
}

export function sessionStats(state: EngineState) {
  const trades = state.trades;
  const wins = trades.filter((t) => t.netUsdt > 0).length;
  const losses = trades.filter((t) => t.netUsdt <= 0).length;
  const n = trades.length;
  const lockedMargin = state.positions.reduce((s, p) => s + p.notionalInr / p.leverage, 0);
  const unrealized = markUnrealizedInr(state);
  const sessionPnl = state.realizedNetInr + unrealized;
  const lossUsed = Math.max(0, -sessionPnl);
  const walletInr = state.cfg.startingCapitalInr + state.realizedNetInr + unrealized;
  const allocatedInr = tradingEquity(state.cfg, 0);
  return {
    trades: n,
    wins,
    losses,
    winRate: n ? (wins / n) * 100 : 0,
    avgHold: n ? trades.reduce((s, t) => s + t.holdSec, 0) / n : 0,
    avgLatency: n ? trades.reduce((s, t) => s + t.latencyMs, 0) / n : 0,
    freeInr: Math.max(0, state.equityInr - lockedMargin),
    lockedMargin,
    unrealized,
    markEquity: state.equityInr + unrealized,
    walletInr,
    allocatedInr,
    sessionPnl,
    lossUsed,
    lossRemaining: Math.max(0, state.cfg.maxSessionLossInr - lossUsed),
    hours: state.sessionStart ? (state.lastTick - state.sessionStart) / 3_600_000 : 0,
  };
}
