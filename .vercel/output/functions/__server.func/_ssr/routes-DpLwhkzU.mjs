import { i as __toESM } from "../_runtime.mjs";
import { L as require_react, v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Play, c as GitBranch, d as ChartColumn, f as Bell, i as RotateCcw, l as Gauge, n as Settings2, o as Pause, p as Activity, r as ScrollText, s as Layers, u as CodeXml } from "../_libs/lucide-react.mjs";
import { a as roundQty, i as minQty, n as DEFAULT_CONFIG, r as hurdlePct } from "./router--sKZyZsq.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DpLwhkzU.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none", {
	variants: {
		variant: {
			primary: "bg-fg text-bg hover:bg-fg/90",
			accent: "bg-accent text-accent-fg hover:bg-accent/90",
			ghost: "bg-transparent text-fg hover:bg-elevated",
			outline: "bg-transparent text-fg shadow-[var(--shadow-border)] hover:bg-elevated",
			danger: "bg-short text-fg hover:bg-short/90"
		},
		size: {
			sm: "h-9 px-3 text-xs rounded-sm",
			md: "h-11 px-4 text-sm rounded-md",
			lg: "h-12 px-5 text-sm rounded-md",
			icon: "size-11 rounded-md"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "md"
	}
});
function Button({ className, variant, size, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
function Spark({ values, className = "", positive = true }) {
	if (values.length < 2) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		className,
		viewBox: "0 0 80 24",
		"aria-hidden": true
	});
	const min = Math.min(...values);
	const span = Math.max(...values) - min || 1;
	const d = values.map((v, i) => {
		const x = i / (values.length - 1) * 80;
		const y = 22 - (v - min) / span * 20;
		return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
	}).join(" ");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		className,
		viewBox: "0 0 80 24",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d,
			fill: "none",
			stroke: positive ? "currentColor" : "currentColor",
			strokeWidth: "1.4",
			vectorEffect: "non-scaling-stroke"
		})
	});
}
function uid(prefix) {
	return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}
function mid(b) {
	return (b.bid + b.ask) / 2;
}
/** Lowest LONG exit / highest SHORT exit that is net-flat after round-trip taker fees. */
function scratchPx(side, entry, entryFee, exitFee) {
	if (side === "LONG") return entry * (1 + entryFee) / Math.max(1e-9, 1 - exitFee);
	return entry * (1 - entryFee) / (1 + exitFee);
}
function netUsdt(side, entry, exit, qty, entryFee, exitFee) {
	return (side === "LONG" ? (exit - entry) * qty : (entry - exit) * qty) - (entry * qty * entryFee + exit * qty * exitFee);
}
function pushAlert(state, kind, title, body, ts) {
	state.alerts = [{
		id: uid("al"),
		ts,
		kind,
		title,
		body
	}, ...state.alerts].slice(0, 200);
}
function createEngineState(cfg, now = Date.now()) {
	return {
		cfg,
		status: "idle",
		sessionStart: null,
		lastTick: now,
		usdtInr: 96,
		fxSource: "seed",
		venue: "binance",
		equityInr: cfg.startingCapitalInr,
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
		hourBucket: {
			start: now,
			trades: []
		},
		ticks: 0,
		lastSpreadHist: {}
	};
}
function screenUniverse(tickers, cfg, usdtInr, equityInr) {
	const maxNotional = equityInr / cfg.slotCount / Math.max(usdtInr, 1e-9) * cfg.leverage;
	return tickers.filter((t) => cfg.candidateSymbols.includes(t.symbol)).filter((t) => t.bid > 0 && t.ask > 0 && t.ask >= t.bid).map((t) => {
		return {
			t,
			minNotional: minQty(t.symbol) * t.ask,
			spreadBps: (t.ask - t.bid) / t.ask * 1e4
		};
	}).filter((x) => x.minNotional <= maxNotional * .95 && x.spreadBps < 12).sort((a, b) => b.t.quoteVolume24h - a.t.quoteVolume24h).slice(0, cfg.slotCount).map((x) => x.t.symbol);
}
function applyLagSpread(book, extraBps) {
	const midPx = mid(book);
	const half = extraBps / 2 / 1e4 * midPx;
	return {
		...book,
		bid: Math.max(0, book.bid - half),
		ask: book.ask + half
	};
}
function sizeOrder(cfg, symbol, px, tobQty, equityInr, usdtInr) {
	const lot = minQty(symbol);
	let qty = equityInr / cfg.slotCount / usdtInr * cfg.leverage / px;
	const cap = tobQty * cfg.maxTobPct;
	if (qty > cap) qty = cap;
	qty = roundQty(qty, lot);
	if (qty < lot) return {
		qty: 0,
		notionalUsdt: 0,
		notionalInr: 0,
		reason: `lot ${lot} exceeds slot notional`
	};
	if (tobQty <= 0) return {
		qty: 0,
		notionalUsdt: 0,
		notionalInr: 0,
		reason: "empty top of book"
	};
	const filledNotional = qty * px;
	return {
		qty,
		notionalUsdt: filledNotional,
		notionalInr: filledNotional * usdtInr,
		reason: null
	};
}
function closePosition(state, pos, exitPx, reason, ts) {
	const qty = pos.filledQty;
	const gross = pos.side === "LONG" ? (exitPx - pos.entryPx) * qty : (pos.entryPx - exitPx) * qty;
	(pos.entryPx * qty + exitPx * qty) * (state.cfg.entryTakerFee + state.cfg.exitTakerFee) * .5 * 2;
	const feeAmt = pos.entryPx * qty * state.cfg.entryTakerFee + exitPx * qty * state.cfg.exitTakerFee;
	const net = gross - feeAmt;
	const netInr = net * state.usdtInr;
	const trade = {
		id: uid("tr"),
		symbol: pos.symbol,
		side: pos.side,
		qty,
		entryPx: pos.entryPx,
		exitPx,
		entryTs: pos.entryTs,
		exitTs: ts,
		holdSec: (ts - pos.entryTs) / 1e3,
		grossUsdt: gross,
		feesUsdt: feeAmt,
		netUsdt: net,
		netInr,
		reason,
		latencyMs: pos.latencyMs,
		paper: true
	};
	state.trades = [trade, ...state.trades].slice(0, 500);
	state.hourBucket.trades.push(trade);
	state.positions = state.positions.filter((p) => p.id !== pos.id);
	state.realizedNetInr += netInr;
	state.realizedGrossUsdt += gross;
	state.realizedFeesUsdt += feeAmt;
	state.equityInr = state.cfg.startingCapitalInr + state.realizedNetInr;
	const sign = net >= 0 ? "+" : "";
	pushAlert(state, "EXIT", `${pos.side} ${pos.symbol.replace("USDT", "")} ${reason}`, `Fill ${fmtPx(exitPx)} · qty ${qty} · net ${sign}₹${netInr.toFixed(2)} (${sign}${net.toFixed(4)} USDT) · hold ${trade.holdSec.toFixed(1)}s · PAPER`, ts);
}
function fmtPx(px) {
	if (px >= 1e3) return px.toFixed(2);
	if (px >= 10) return px.toFixed(3);
	if (px >= 1) return px.toFixed(4);
	return px.toPrecision(4);
}
function maybeFlushHour(state, ts) {
	if (!state.sessionStart) return;
	if (ts - state.hourBucket.start < 36e5) return;
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
	const report = {
		id: uid("hr"),
		ts,
		hourIndex: state.hourCursor + 1,
		trades,
		wins,
		losses,
		winRate: trades ? wins / trades * 100 : 0,
		grossUsdt: gross,
		feesUsdt: fees,
		netUsdt: net,
		netInr: net * state.usdtInr,
		equityInr: state.equityInr,
		freeInr: Math.max(0, state.equityInr - locked),
		avgHoldSec: avgHold,
		avgLatencyMs: avgLat
	};
	state.reports = [report, ...state.reports].slice(0, 96);
	state.hourCursor += 1;
	state.hourBucket = {
		start: ts,
		trades: []
	};
	pushAlert(state, "HOUR", `Hour ${report.hourIndex} summary`, `Trades ${trades} · W/L ${wins}/${losses} · WR ${report.winRate.toFixed(0)}% · net ₹${report.netInr.toFixed(2)} · equity ₹${state.equityInr.toFixed(0)} · avg hold ${avgHold.toFixed(1)}s · avg exec ${avgLat.toFixed(1)}ms`, ts);
}
function ingestSnapshot(state, tickers, usdtInr, fxSource, venue, now) {
	if (state.status !== "running") return {
		...state,
		lastTick: now
	};
	state.lastTick = now;
	state.usdtInr = usdtInr;
	state.fxSource = fxSource;
	state.venue = venue;
	state.ticks += 1;
	const lead = { ...state.lead };
	for (const t of tickers) lead[t.symbol] = t;
	state.lead = lead;
	const nextUniverse = screenUniverse(tickers, state.cfg, usdtInr, state.equityInr);
	if (nextUniverse.length) state.universe = nextUniverse;
	state.delayBuf.push({
		t: now,
		books: Object.fromEntries(tickers.map((t) => [t.symbol, t]))
	});
	const lagCut = now - state.cfg.lagMs;
	let released = null;
	while (state.delayBuf.length && state.delayBuf[0].t <= lagCut) released = state.delayBuf.shift().books;
	if (released) {
		const lagged = { ...state.lag };
		for (const [sym, book] of Object.entries(released)) lagged[sym] = applyLagSpread(book, state.cfg.extraLagSpreadBps);
		state.lag = lagged;
	}
	const hurdle = hurdlePct(state.cfg);
	const pairs = {};
	const watch = /* @__PURE__ */ new Set([...state.universe, ...state.positions.map((p) => p.symbol)]);
	for (const symbol of watch) {
		const L = state.lead[symbol];
		const C = state.lag[symbol];
		if (L) {
			const prev = state.lastMids[symbol];
			const m = mid(L);
			if (prev && now > prev.t) {
				const ret = Math.abs(m / prev.px - 1);
				const dt = (now - prev.t) / 1e3;
				const inst = dt > 0 ? ret / Math.sqrt(Math.max(dt, .2)) : ret;
				state.vol[symbol] = (state.vol[symbol] ?? 0) * .94 + inst * .06;
			}
			state.lastMids[symbol] = {
				px: m,
				t: now
			};
		}
		const lot = minQty(symbol);
		const locked = state.positions.some((p) => p.symbol === symbol);
		if (!L || !C) {
			pairs[symbol] = {
				symbol,
				lead: L ?? null,
				lag: C ?? null,
				leadMid: L ? mid(L) : 0,
				lagSpreadBps: C ? (C.ask - C.bid) / C.ask * 1e4 : 0,
				longDiv: 0,
				shortDiv: 0,
				hurdle,
				eligible: false,
				skipReason: !C ? "awaiting lag book" : "no lead",
				minQty: lot,
				slotLocked: locked,
				volEwma: state.vol[symbol] ?? 0
			};
			continue;
		}
		const leadMid = mid(L);
		const longDiv = (leadMid - C.ask) / C.ask;
		const shortDiv = (C.bid - leadMid) / C.bid;
		const slotUsdt = state.equityInr / state.cfg.slotCount / usdtInr;
		const minNotional = lot * C.ask;
		let skip = null;
		if (minNotional > slotUsdt * state.cfg.leverage) skip = "min lot > slot";
		else if (C.askQty <= 0 || C.bidQty <= 0) skip = "thin book";
		pairs[symbol] = {
			symbol,
			lead: L,
			lag: C,
			leadMid,
			lagSpreadBps: (C.ask - C.bid) / C.ask * 1e4,
			longDiv,
			shortDiv,
			hurdle,
			eligible: !skip && !locked,
			skipReason: locked ? "slot locked" : skip,
			minQty: lot,
			slotLocked: locked,
			volEwma: state.vol[symbol] ?? 0
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
		const net = netUsdt(pos.side, pos.entryPx, mark, pos.filledQty, state.cfg.entryTakerFee, state.cfg.exitTakerFee);
		const scratch = scratchPx(pos.side, pos.entryPx, state.cfg.entryTakerFee, state.cfg.exitTakerFee);
		if (net >= 0) {
			const tightened = pos.side === "LONG" ? Math.max(pos.stopPx, scratch) : Math.min(pos.stopPx, scratch);
			if (!pos.armedBreakeven || tightened !== pos.stopPx) {
				const next = {
					...pos,
					armedBreakeven: true,
					stopPx: tightened
				};
				state.positions = state.positions.map((p) => p.id === pos.id ? next : p);
				Object.assign(pos, next);
			}
		}
		if (pos.side === "LONG" && C.bid >= pos.targetPx) {
			closePosition(state, pos, C.bid, "TARGET", now);
			continue;
		}
		if (pos.side === "SHORT" && C.ask <= pos.targetPx) {
			closePosition(state, pos, C.ask, "TARGET", now);
			continue;
		}
		if (pos.side === "LONG" && C.bid <= pos.stopPx) {
			closePosition(state, pos, C.bid, pos.armedBreakeven ? "SCRATCH" : "STOP", now);
			continue;
		}
		if (pos.side === "SHORT" && C.ask >= pos.stopPx) {
			closePosition(state, pos, C.ask, pos.armedBreakeven ? "SCRATCH" : "STOP", now);
			continue;
		}
		if (now >= pos.timeoutTs && net >= 0) closePosition(state, pos, mark, "TIMEOUT", now);
	}
	if (state.positions.length < state.cfg.slotCount) for (const symbol of state.universe) {
		if (state.positions.some((p) => p.symbol === symbol)) continue;
		const pair = state.pairs[symbol];
		const C = state.lag[symbol];
		if (!pair || !C || !pair.eligible) continue;
		let side = null;
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
		const sized = sizeOrder(state.cfg, symbol, px, tobQty, state.equityInr, usdtInr);
		if (sized.qty <= 0) continue;
		const fillFrac = .86 + Math.random() * .14;
		const filledQty = roundQty(sized.qty * fillFrac, minQty(symbol));
		if (filledQty < minQty(symbol)) continue;
		const slip = Math.min(state.cfg.maxSlippagePct, 15e-5 + Math.random() * 2e-4);
		const fillPx = side === "LONG" ? px * (1 + slip) : px * (1 - slip);
		const vol = state.vol[symbol] ?? 4e-4;
		const stopPct = Math.max(state.cfg.minStopPct, state.cfg.volStopMult * vol);
		const target = pair.leadMid;
		const stopPx = side === "LONG" ? fillPx * (1 - stopPct) : fillPx * (1 + stopPct);
		const latencyMs = 7 + Math.random() * 18;
		const pos = {
			id: uid("pos"),
			symbol,
			side,
			qty: filledQty,
			entryPx: fillPx,
			entryTs: now,
			targetPx: target,
			stopPx,
			timeoutTs: now + state.cfg.holdTimeoutSec * 1e3,
			expectedSpread: div,
			notionalUsdt: filledQty * fillPx,
			notionalInr: filledQty * fillPx * usdtInr,
			filledQty,
			requestedQty: sized.qty,
			leverage: state.cfg.leverage,
			paper: true,
			status: "OPEN",
			latencyMs
		};
		state.positions = [pos, ...state.positions];
		const base = symbol.replace("USDT", "");
		pushAlert(state, "ENTRY", `${side} ${base}`, `Fill ${fmtPx(fillPx)} · ${filledQty}${filledQty < sized.qty ? ` (partial of ${sized.qty})` : ""} · notional ₹${pos.notionalInr.toFixed(0)} · exp spread ${(div * 100).toFixed(3)}% · tgt ${fmtPx(target)} / stop ${fmtPx(stopPx)} · PAPER`, now);
	}
	maybeFlushHour(state, now);
	return state;
}
function sessionStats(state) {
	const trades = state.trades;
	const wins = trades.filter((t) => t.netUsdt > 0).length;
	const losses = trades.filter((t) => t.netUsdt <= 0).length;
	const n = trades.length;
	const lockedMargin = state.positions.reduce((s, p) => s + p.notionalInr / p.leverage, 0);
	const unrealized = state.positions.reduce((s, p) => {
		const C = state.lag[p.symbol];
		if (!C) return s;
		const mark = p.side === "LONG" ? C.bid : C.ask;
		return s + (p.side === "LONG" ? (mark - p.entryPx) * p.qty : (p.entryPx - mark) * p.qty) * state.usdtInr;
	}, 0);
	return {
		trades: n,
		wins,
		losses,
		winRate: n ? wins / n * 100 : 0,
		avgHold: n ? trades.reduce((s, t) => s + t.holdSec, 0) / n : 0,
		avgLatency: n ? trades.reduce((s, t) => s + t.latencyMs, 0) / n : 0,
		freeInr: Math.max(0, state.equityInr - lockedMargin),
		lockedMargin,
		unrealized,
		markEquity: state.equityInr + unrealized,
		hours: state.sessionStart ? (state.lastTick - state.sessionStart) / 36e5 : 0
	};
}
var PYTHON_FILES = [
	{
		path: "README.md",
		label: "Setup guide"
	},
	{
		path: "requirements.txt",
		label: "Dependencies"
	},
	{
		path: "env.example",
		label: "Environment template"
	},
	{
		path: "config.py",
		label: "Config"
	},
	{
		path: "main.py",
		label: "Entrypoint"
	},
	{
		path: "models.py",
		label: "Models"
	},
	{
		path: "data_ingestion.py",
		label: "DataIngestion"
	},
	{
		path: "signal_engine.py",
		label: "SignalEngine"
	},
	{
		path: "portfolio.py",
		label: "PortfolioManager"
	},
	{
		path: "order_executor.py",
		label: "OrderExecutor"
	},
	{
		path: "risk_manager.py",
		label: "RiskManager"
	},
	{
		path: "telegram_reporter.py",
		label: "TelegramReporter"
	},
	{
		path: "persistence.py",
		label: "SQLite recovery"
	},
	{
		path: "rate_limit.py",
		label: "Token bucket"
	},
	{
		path: "latency_bench.py",
		label: "Latency benchmark"
	},
	{
		path: "deploy/lagforge.service",
		label: "systemd unit"
	}
];
var useDesk = create()(persist((set, get) => ({
	view: "desk",
	hydrated: false,
	engine: createEngineState(DEFAULT_CONFIG),
	feed: {
		lastOk: false,
		lastError: null,
		lastMs: 0,
		polls: 0
	},
	latency: [],
	setView: (view) => set({ view }),
	setHydrated: () => set({ hydrated: true }),
	patchConfig: (partial) => set((s) => ({ engine: {
		...s.engine,
		cfg: {
			...s.engine.cfg,
			...partial,
			paperTrading: true
		}
	} })),
	start: () => set((s) => {
		const now = Date.now();
		return { engine: {
			...s.engine,
			status: "running",
			sessionStart: s.engine.sessionStart ?? now,
			hourBucket: s.engine.hourBucket.start === 0 ? {
				start: now,
				trades: []
			} : s.engine.hourBucket
		} };
	}),
	stop: () => set((s) => ({ engine: {
		...s.engine,
		status: s.engine.status === "idle" ? "idle" : "paused"
	} })),
	resetSession: () => set((s) => ({
		engine: createEngineState(s.engine.cfg),
		feed: {
			lastOk: false,
			lastError: null,
			lastMs: 0,
			polls: 0
		}
	})),
	ingest: (snap) => set((s) => {
		if (s.engine.status !== "running") return { engine: {
			...s.engine,
			usdtInr: snap.usdtInr || s.engine.usdtInr,
			fxSource: snap.fxSource,
			venue: snap.venue
		} };
		return { engine: ingestSnapshot({
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
				trades: [...s.engine.hourBucket.trades]
			}
		}, snap.tickers, snap.usdtInr, snap.fxSource, snap.venue, snap.ts) };
	}),
	notePoll: (ok, error, ms) => set((s) => ({ feed: {
		lastOk: ok,
		lastError: error,
		lastMs: ms,
		polls: s.feed.polls + 1
	} })),
	pushLatency: (sample) => set((s) => ({ latency: [sample, ...s.latency].slice(0, 40) }))
}), {
	name: "lagforge-desk-v2",
	partialize: (s) => ({
		engine: {
			...s.engine,
			status: s.engine.status === "running" ? "paused" : s.engine.status,
			delayBuf: []
		},
		view: s.view
	}),
	onRehydrateStorage: () => (state) => {
		state?.setHydrated();
	}
}));
function inr(n, digits = 2) {
	return `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	})}`;
}
function px(n) {
	if (!Number.isFinite(n) || n === 0) return "—";
	if (n >= 1e3) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
	if (n >= 10) return n.toFixed(3);
	if (n >= 1) return n.toFixed(4);
	return n.toPrecision(4);
}
function pct(n, digits = 3) {
	return `${n > 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
}
function base(symbol) {
	return symbol.replace(/USDT$/i, "");
}
function ago(ts, now = Date.now()) {
	const s = Math.max(0, Math.round((now - ts) / 1e3));
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
	return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
}
function hhmmss(ts) {
	return new Date(ts).toLocaleTimeString("en-IN", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
}
function clsDelta(n) {
	if (n > 0) return "text-long";
	if (n < 0) return "text-short";
	return "text-muted";
}
var NAV = [
	{
		id: "desk",
		label: "Desk",
		icon: Activity
	},
	{
		id: "universe",
		label: "Universe",
		icon: Layers
	},
	{
		id: "blotter",
		label: "Blotter",
		icon: ScrollText
	},
	{
		id: "alerts",
		label: "Alerts",
		icon: Bell
	},
	{
		id: "reports",
		label: "Reports",
		icon: ChartColumn
	},
	{
		id: "architecture",
		label: "Architecture",
		icon: GitBranch
	},
	{
		id: "config",
		label: "Config",
		icon: Settings2
	},
	{
		id: "source",
		label: "Python",
		icon: CodeXml
	},
	{
		id: "latency",
		label: "Latency",
		icon: Gauge
	}
];
function DeskApp() {
	const view = useDesk((s) => s.view);
	const setView = useDesk((s) => s.setView);
	const engine = useDesk((s) => s.engine);
	const feed = useDesk((s) => s.feed);
	const start = useDesk((s) => s.start);
	const stop = useDesk((s) => s.stop);
	const resetSession = useDesk((s) => s.resetSession);
	const status = engine.status;
	const pollMs = engine.cfg.pollMs;
	(0, import_react.useEffect)(() => {
		useDesk.getState().setHydrated();
	}, []);
	(0, import_react.useEffect)(() => {
		if (status !== "running") return;
		let cancelled = false;
		const poll = async () => {
			const t0 = performance.now();
			try {
				const snap = await (await fetch("/api/market", { cache: "no-store" })).json();
				if (cancelled) return;
				useDesk.getState().ingest(snap);
				useDesk.getState().notePoll(true, snap.error ?? null, performance.now() - t0);
			} catch (err) {
				if (cancelled) return;
				useDesk.getState().notePoll(false, err instanceof Error ? err.message : "feed error", performance.now() - t0);
			}
		};
		poll();
		const id = window.setInterval(() => void poll(), pollMs);
		return () => {
			cancelled = true;
			window.clearInterval(id);
		};
	}, [status, pollMs]);
	const stats = sessionStats(engine);
	const hurdle = hurdlePct(engine.cfg);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh overflow-x-hidden bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "border-b border-border",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex w-full max-w-desk flex-col gap-3 px-4 py-3 sm:px-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-baseline gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
									className: "font-sans text-xl font-medium tracking-tight text-balance",
									children: "LAGFORGE"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xxs uppercase tracking-[0.18em] text-muted",
									children: "Binance → CoinSwitch PRO"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pill, {
										tone: "accent",
										children: "PAPER"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pill, { children: engine.venue.split(" ")[0] || "FEED" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pill, {
										tone: status === "running" ? "long" : "muted",
										children: status === "running" ? "LIVE LOOP" : status === "paused" ? "PAUSED" : "ARMED"
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "Mark equity",
									value: inr(stats.markEquity, 0)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "Session net",
									value: inr(engine.realizedNetInr),
									tone: engine.realizedNetInr
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "Free margin",
									value: inr(stats.freeInr, 0)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "Open slots",
									value: `${engine.positions.length}/${engine.cfg.slotCount}`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "Win rate",
									value: `${stats.winRate.toFixed(0)}% · ${stats.trades} tr`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "USDT/INR",
									value: engine.usdtInr.toFixed(3)
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex min-w-0 flex-wrap items-center gap-2",
							children: [
								status === "running" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "outline",
									onClick: stop,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-4" }), " Pause"]
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "accent",
									onClick: start,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" }), " Start paper loop"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "ghost",
									onClick: resetSession,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "size-4" }), " Reset"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "min-w-0 basis-full text-xs text-pretty text-muted sm:basis-auto",
									children: [
										"₹",
										engine.cfg.startingCapitalInr.toLocaleString("en-IN"),
										" · ",
										engine.cfg.slotCount,
										" slots ·",
										" ",
										engine.cfg.leverage,
										"× · hurdle ",
										pct(hurdle),
										" · lag ",
										engine.cfg.lagMs,
										"ms"
									]
								})
							]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur-sm",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto flex w-full max-w-desk gap-1 overflow-x-auto px-3 py-2 sm:px-6",
					children: NAV.map((item) => {
						const Icon = item.icon;
						const active = view === item.id;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => setView(item.id),
							className: cn("flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-colors duration-150", active ? "bg-elevated text-fg" : "text-muted hover:bg-surface hover:text-fg"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4" }), item.label]
						}, item.id);
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "mx-auto w-full min-w-0 max-w-desk px-4 py-5 sm:px-6 sm:py-6",
				children: [
					view === "desk" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskView, {}),
					view === "universe" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UniverseView, {}),
					view === "blotter" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BlotterView, {}),
					view === "alerts" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertsView, {}),
					view === "reports" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReportsView, {}),
					view === "architecture" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArchitectureView, {}),
					view === "config" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfigView, {}),
					view === "source" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceView, {}),
					view === "latency" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LatencyView, {})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
				className: "border-t border-border",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex w-full max-w-desk flex-col gap-1 px-4 py-3 text-xxs text-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						"Feed ",
						feed.lastOk ? "ok" : "down",
						" · ",
						feed.lastMs.toFixed(0),
						"ms · polls ",
						feed.polls,
						feed.lastError ? ` · ${feed.lastError}` : ""
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						"Calibration ",
						stats.hours.toFixed(2),
						" / ",
						engine.cfg.calibrationHours,
						"h · avg hold",
						" ",
						stats.avgHold.toFixed(1),
						"s · avg exec ",
						stats.avgLatency.toFixed(1),
						"ms"
					] })]
				})
			})
		]
	});
}
function Pill({ children, tone = "muted" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("rounded-sm px-2 py-1 text-xxs font-medium uppercase tracking-wider", {
			muted: "text-muted shadow-[var(--shadow-border)]",
			accent: "text-accent-fg bg-accent",
			long: "text-long shadow-[var(--shadow-border)]"
		}[tone]),
		children
	});
}
function Stat({ label, value, tone }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xxs uppercase tracking-wider text-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: cn("mt-1 font-mono text-sm tabular", tone !== void 0 ? clsDelta(tone) : "text-fg"),
			children: value
		})]
	});
}
function Panel({ title, kicker, children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: cn("rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "mb-4 flex items-baseline justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium tracking-tight",
				children: title
			}), kicker ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xxs uppercase tracking-wider text-muted",
				children: kicker
			}) : null]
		}), children]
	});
}
function DeskView() {
	const engine = useDesk((s) => s.engine);
	const stats = sessionStats(engine);
	const open = engine.positions;
	const recent = engine.trades.slice(0, 8);
	const alerts = engine.alerts.slice(0, 6);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 lg:grid-cols-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Open positions",
				kicker: `${open.length} locked`,
				className: "lg:col-span-3",
				children: open.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { text: engine.status === "running" ? "Waiting for a net-spread print above hurdle." : "Start the paper loop to arm the ten slots." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-2",
					children: open.map((p) => {
						const pair = engine.pairs[p.symbol];
						const mark = p.side === "LONG" ? pair?.lag?.bid : pair?.lag?.ask;
						const u = mark !== void 0 ? p.side === "LONG" ? (mark - p.entryPx) * p.qty * engine.usdtInr : (p.entryPx - mark) * p.qty * engine.usdtInr : 0;
						const net = mark !== void 0 ? netUsdt(p.side, p.entryPx, mark, p.filledQty, engine.cfg.entryTakerFee, engine.cfg.exitTakerFee) : 0;
						const remain = Math.max(0, (p.timeoutTs - engine.lastTick) / 1e3);
						const timeoutLabel = remain > 0 ? `${remain.toFixed(0)}s${p.armedBreakeven ? " · BE" : ""}` : net >= 0 ? "flatten green" : "hold, no timeout loss";
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "grid grid-cols-2 gap-2 rounded-md bg-elevated px-3 py-3 sm:grid-cols-6",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
									label: "Slot",
									value: `${p.side} ${base(p.symbol)}`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
									label: "Fill",
									value: px(p.entryPx)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
									label: "Target / stop",
									value: `${px(p.targetPx)} · ${px(p.stopPx)}`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
									label: "Qty",
									value: `${p.filledQty}${p.filledQty < p.requestedQty ? " part" : ""}`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
									label: "Unreal",
									value: inr(u),
									tone: u
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
									label: "Timeout",
									value: timeoutLabel
								})
							]
						}, p.id);
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
				title: "Calibration",
				kicker: "72-hour gate",
				className: "lg:col-span-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-2 overflow-hidden rounded-full bg-inset",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-full bg-accent transition-[width] duration-300",
							style: { width: `${Math.min(100, stats.hours / engine.cfg.calibrationHours * 100)}%` }
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-sm text-pretty text-muted",
						children: [stats.hours.toFixed(2), " hours of paper tape. Do not go live until gross lead-lag covers fees across Asia, London, and US sessions."]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
						className: "mt-4 grid grid-cols-2 gap-3 text-sm",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-xxs uppercase tracking-wider text-muted",
								children: "Gross USDT"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
								className: "font-mono tabular",
								children: usdtPad(engine.realizedGrossUsdt)
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-xxs uppercase tracking-wider text-muted",
								children: "Fees USDT"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
								className: "font-mono tabular",
								children: usdtPad(engine.realizedFeesUsdt)
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-xxs uppercase tracking-wider text-muted",
								children: "Slot size"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
								className: "font-mono tabular",
								children: inr(engine.equityInr / engine.cfg.slotCount, 0)
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-xxs uppercase tracking-wider text-muted",
								children: "Hurdle"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
								className: "font-mono tabular",
								children: pct(hurdlePct(engine.cfg))
							})] })
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Lead / lag tape",
				kicker: "top of book",
				className: "lg:col-span-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto max-w-full",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full min-w-[640px] text-left text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "text-xxs uppercase tracking-wider text-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-b border-border",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Coin"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Binance mid"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "CS bid / ask"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Long Δ"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Short Δ"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Slot"
									})
								]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "font-mono text-xs tabular",
							children: (engine.universe.length ? engine.universe : engine.cfg.candidateSymbols.slice(0, 10)).map((sym) => {
								const p = engine.pairs[sym];
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-b border-border/80",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2.5 font-sans text-sm",
											children: base(sym)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2.5",
											children: p ? px(p.leadMid) : "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2.5",
											children: p?.lag ? `${px(p.lag.bid)} / ${px(p.lag.ask)}` : "buffering"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: cn("py-2.5", p && p.longDiv > p.hurdle ? "text-long" : "text-muted"),
											children: p ? pct(p.longDiv) : "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: cn("py-2.5", p && p.shortDiv > p.hurdle ? "text-short" : "text-muted"),
											children: p ? pct(p.shortDiv) : "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-2.5 text-muted",
											children: p?.skipReason ?? (p?.eligible ? "open" : "—")
										})
									]
								}, sym);
							})
						})]
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Telegram feed",
				kicker: "local",
				className: "lg:col-span-2",
				children: alerts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { text: "Entries, exits, and hourly summaries land here." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-3",
					children: alerts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "border-l-2 border-accent pl-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-xxs uppercase tracking-wider text-muted",
								children: [
									a.kind,
									" · ",
									hhmmss(a.ts)
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm",
								children: a.title
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs text-pretty text-muted",
								children: a.body
							})
						]
					}, a.id))
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Recent fills",
				kicker: `${recent.length} shown`,
				className: "lg:col-span-5",
				children: recent.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { text: "No paper fills yet. Alts with jumpy books clear the hurdle more often than BTC." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto max-w-full",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full min-w-[720px] text-left text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "text-xxs uppercase tracking-wider text-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-b border-border",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Time"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Slot"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Entry → exit"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Hold"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Net"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Reason"
									})
								]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "font-mono text-xs tabular",
							children: recent.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-b border-border/80",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-2.5",
										children: hhmmss(t.exitTs)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "py-2.5 font-sans text-sm",
										children: [
											t.side,
											" ",
											base(t.symbol)
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "py-2.5",
										children: [
											px(t.entryPx),
											" → ",
											px(t.exitPx)
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "py-2.5",
										children: [t.holdSec.toFixed(1), "s"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: cn("py-2.5", clsDelta(t.netInr)),
										children: inr(t.netInr)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-2.5 text-muted",
										children: t.reason
									})
								]
							}, t.id))
						})]
					})
				})
			})
		]
	});
}
function UniverseView() {
	const engine = useDesk((s) => s.engine);
	const slotUsdt = engine.equityInr / engine.cfg.slotCount / engine.usdtInr;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
		children: engine.cfg.candidateSymbols.map((sym) => {
			const p = engine.pairs[sym];
			const L = engine.lead[sym];
			const active = engine.universe.includes(sym);
			const lot = minQty(sym);
			const minNotional = lot * (L?.ask ?? 0);
			const spark = engine.lastSpreadHist[sym] ?? [];
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
				className: "rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start justify-between gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-sm font-medium",
							children: base(sym)
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xxs uppercase tracking-wider text-muted",
							children: [
								active ? "top-10 slot" : "screened out",
								" · lot ",
								lot
							]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spark, {
							values: spark,
							className: cn("h-8 w-20", p && Math.max(p.longDiv, p.shortDiv) > p.hurdle ? "text-accent" : "text-faint")
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
						className: "mt-3 grid grid-cols-2 gap-2 text-xs",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								k: "Lead mid",
								v: L ? px(L.last || p?.leadMid || 0) : "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								k: "24h quote",
								v: L ? `${(L.quoteVolume24h / 1e6).toFixed(0)}m` : "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								k: "Long Δ",
								v: p ? pct(p.longDiv) : "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								k: "Short Δ",
								v: p ? pct(p.shortDiv) : "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								k: "Min notional",
								v: minNotional ? `${minNotional.toFixed(2)} USDT` : "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								k: "Slot notional",
								v: `${(slotUsdt * engine.cfg.leverage).toFixed(2)} USDT`
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xxs text-muted",
						children: minNotional > slotUsdt * engine.cfg.leverage ? "Fails min lot vs ₹ slot — skipped." : p?.skipReason ?? (active ? "Eligible for one concurrent position." : "Waiting for tape.")
					})
				]
			}, sym);
		})
	});
}
function BlotterView() {
	const trades = useDesk((s) => s.engine.trades);
	if (!trades.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Trade blotter",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { text: "Closed paper trades appear here with fees, hold time, and exit reason." })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Trade blotter",
		kicker: `${trades.length} recovered`,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "max-w-full overflow-x-auto",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full min-w-[860px] text-left text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "text-xxs uppercase tracking-wider text-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "border-b border-border",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Exit"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Side"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Qty"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Entry"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Exit px"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Gross"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Fees"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Net INR"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Hold"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "ms"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "pb-2 font-medium",
								children: "Why"
							})
						]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
					className: "font-mono text-xs tabular",
					children: trades.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "border-b border-border/80",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "py-2.5",
								children: hhmmss(t.exitTs)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "py-2.5 font-sans",
								children: [
									t.side,
									" ",
									base(t.symbol)
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "py-2.5",
								children: t.qty
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "py-2.5",
								children: px(t.entryPx)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "py-2.5",
								children: px(t.exitPx)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: clsDelta(t.grossUsdt),
								children: t.grossUsdt.toFixed(4)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "py-2.5 text-muted",
								children: t.feesUsdt.toFixed(4)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: clsDelta(t.netInr),
								children: inr(t.netInr)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "py-2.5",
								children: [t.holdSec.toFixed(1), "s"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "py-2.5",
								children: t.latencyMs.toFixed(1)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "py-2.5 text-muted",
								children: t.reason
							})
						]
					}, t.id))
				})]
			})
		})
	});
}
function AlertsView() {
	const alerts = useDesk((s) => s.engine.alerts);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Execution alerts",
		kicker: "mirrors Telegram payload",
		children: alerts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { text: "The Python bot posts the same payload to Telegram. This desk keeps a local copy." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "flex flex-col gap-3",
			children: alerts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "rounded-md bg-elevated px-4 py-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xxs uppercase tracking-wider text-muted",
						children: [
							a.kind,
							" · ",
							hhmmss(a.ts),
							" · ",
							ago(a.ts)
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm font-medium",
						children: a.title
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-pretty text-muted",
						children: a.body
					})
				]
			}, a.id))
		})
	});
}
function ReportsView() {
	const engine = useDesk((s) => s.engine);
	const stats = sessionStats(engine);
	const hourSoFar = engine.hourBucket.trades;
	const wins = hourSoFar.filter((t) => t.netUsdt > 0).length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
			title: "Current hour (in progress)",
			kicker: "flushes on the hour",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-3 sm:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Trades",
						value: `${hourSoFar.length}`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Wins",
						value: `${wins}`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Net",
						value: inr(hourSoFar.reduce((s, t) => s + t.netInr, 0)),
						tone: hourSoFar.reduce((s, t) => s + t.netInr, 0)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Session hours",
						value: stats.hours.toFixed(2)
					})
				]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
			title: "Hourly archive",
			kicker: "same body as Telegram /1h",
			children: engine.reports.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { text: "A sealed hour report is written every 60 minutes of runtime." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col gap-2",
				children: engine.reports.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-md bg-elevated px-4 py-3 text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xxs uppercase tracking-wider text-muted",
						children: [
							"Hour ",
							r.hourIndex,
							" · ",
							hhmmss(r.ts)
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 font-mono text-xs tabular text-pretty",
						children: [
							r.trades,
							" tr · W/L ",
							r.wins,
							"/",
							r.losses,
							" · WR ",
							r.winRate.toFixed(0),
							"% · gross",
							" ",
							r.grossUsdt.toFixed(4),
							" · fees ",
							r.feesUsdt.toFixed(4),
							" · net ",
							inr(r.netInr),
							" · equity",
							" ",
							inr(r.equityInr, 0),
							" · hold ",
							r.avgHoldSec.toFixed(1),
							"s · exec ",
							r.avgLatencyMs.toFixed(1),
							"ms"
						]
					})]
				}, r.id))
			})
		})]
	});
}
function ArchitectureView() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
			title: "Lead-lag path",
			kicker: "ap-south-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "grid gap-2 sm:grid-cols-3",
				children: [
					"Binance bookTicker WS",
					"Hurdle + depth gate",
					"CoinSwitch futures / HFT order",
					"Partial fill tracker",
					"Target / stop / profit-only timeout",
					"SQLite + Telegram"
				].map((step, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-md bg-elevated px-3 py-3 text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-xxs text-accent",
						children: String(i + 1).padStart(2, "0")
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1",
						children: step
					})]
				}, step))
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 text-sm text-pretty text-muted",
				children: "CoinSwitch PRO perpetual futures are USDT-margined. INR is the capital and reporting currency. USDT/INR is a live FX tape used to size slots and publish ₹ PnL — not a hardcoded multiplier. If a venue quoted INR, the same FX book would translate the Binance USDT mid before the hurdle."
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid gap-3 md:grid-cols-2",
			children: [
				{
					name: "DataIngestion",
					body: "Persistent WebSockets only for prices. Binance futures bookTicker is the lead. CoinSwitch PRO Socket.IO order-book snapshots are the lag. REST is banned from the trigger path."
				},
				{
					name: "SignalEngine",
					body: "Compares Binance mid to CoinSwitch best ask (long) and best bid (short). Fires only when gross divergence clears entry taker + exit fee + slippage buffer. Never uses LTP."
				},
				{
					name: "PortfolioManager",
					body: "₹10,000 start. Equal weight: available equity / 10. One locked slot per coin until fully closed. Lot-size gate rejects coins whose min contract exceeds slot notional × leverage."
				},
				{
					name: "OrderExecutor",
					body: "Sizes to ≤25% of top-of-book. Tracks partial fills and resizes the exit to filled qty. Token-bucket 15/min. Paper fills against live TOB; live uses Ed25519-signed CoinSwitch futures orders."
				},
				{
					name: "RiskManager",
					body: "Target = Binance mid at entry. Timeout (45s) flattens only if the close is net-green after fees — it will not realize a timeout loss. Once the trade is green, the stop ratchets to scratch so a giveback cannot turn a winner red. Hard vol stop still cuts violent reversals."
				},
				{
					name: "TelegramReporter",
					body: "Immediate entry/exit cards and a 1-hour PnL tape: trades, win rate, gross vs net, free margin, average hold, average signal-to-fill latency."
				}
			].map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
				className: "rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-mono text-xs uppercase tracking-wider text-accent",
					children: m.name
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-pretty text-muted",
					children: m.body
				})]
			}, m.name))
		})]
	});
}
function ConfigView() {
	const cfg = useDesk((s) => s.engine.cfg);
	const patch = useDesk((s) => s.patchConfig);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 lg:grid-cols-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
			title: "Paper desk parameters",
			kicker: "always paper in this preview",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Starting capital (INR)",
						value: cfg.startingCapitalInr,
						onChange: (v) => patch({ startingCapitalInr: v })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Slot count",
						value: cfg.slotCount,
						onChange: (v) => patch({ slotCount: v })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Leverage",
						value: cfg.leverage,
						onChange: (v) => patch({ leverage: v })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Hold timeout (sec)",
						value: cfg.holdTimeoutSec,
						onChange: (v) => patch({ holdTimeoutSec: v })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-pretty text-muted",
						children: "Timeout never closes a loser. After 45s it only flattens if net PnL after fees is positive. Green trades ratchet the stop to scratch so a giveback cannot print a timeout loss."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Lag buffer (ms)",
						value: cfg.lagMs,
						onChange: (v) => patch({ lagMs: v })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Slippage buffer (bps)",
						value: Math.round(cfg.slippageBuffer * 1e4),
						onChange: (v) => patch({ slippageBuffer: v / 1e4 })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Max top-of-book %",
						value: Math.round(cfg.maxTobPct * 100),
						onChange: (v) => patch({ maxTobPct: v / 100 })
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 text-xs text-pretty text-muted",
				children: "Live keys never enter this desk. Put them in env vars on the machine that runs the Python bot. PAPER_TRADING stays true until you also set CONFIRM_LIVE=YES."
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
			title: "Local & EC2 runbook",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
				className: "flex list-decimal flex-col gap-3 pl-4 text-sm text-pretty text-muted",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Download the Python pack from the Python tab (or /lagforge-bot.zip)." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Create a venv, pip install -r requirements.txt, copy env.example to .env." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Run python latency_bench.py from the same region you will trade." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "python main.py with PAPER_TRADING=true for 72 hours." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "On EC2 Ubuntu in ap-south-1, install the systemd unit, keep paper on, then flip live only after the tape beats fees." })
				]
			})
		})]
	});
}
function SourceView() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
			title: "Production Python pack",
			kicker: "VS Code + EC2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-pretty text-muted",
					children: "Same modules as this desk: WebSocket lead/lag, equal-weight ₹ slots, hurdle gate, partial fills, timeout, vol stop, SQLite recovery, Telegram. Paper by default."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 flex flex-wrap gap-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/lagforge-bot.zip",
						className: "inline-flex h-11 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg",
						children: "Download lagforge-bot.zip"
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-5 grid gap-2 sm:grid-cols-2",
					children: PYTHON_FILES.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: `/lagforge-bot/${f.path}`,
						className: "flex h-11 items-center justify-between rounded-md bg-elevated px-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: f.label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-xxs text-muted",
							children: f.path
						})]
					}) }, f.path))
				})
			]
		})
	});
}
function LatencyView() {
	const samples = useDesk((s) => s.latency);
	const push = useDesk((s) => s.pushLatency);
	async function run() {
		const data = await (await fetch("/api/latency", { cache: "no-store" })).json();
		push({
			ts: data.ts,
			binanceMs: data.binanceMs,
			coinswitchMs: data.coinswitchMs,
			fxMs: data.fxMs
		});
	}
	(0, import_react.useEffect)(() => {
		if (samples.length === 0) run();
	}, []);
	const last = samples[0];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
			title: "Round-trip probe",
			kicker: "this hosted desk",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-pretty text-muted",
					children: "Numbers here are from the preview host, not Mumbai. Ship latency_bench.py to the EC2 box (or your laptop) for the real path to api.binance.com and coinswitch.co."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 flex flex-wrap gap-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "accent",
						onClick: () => void run(),
						children: "Run probe"
					})
				}),
				last ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
					className: "mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Binance public",
							value: ms(last.binanceMs)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "CoinSwitch time",
							value: ms(last.coinswitchMs)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "FX USD/INR",
							value: ms(last.fxMs)
						})
					]
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
			title: "History",
			children: samples.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { text: "No samples yet." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "font-mono text-xs tabular",
				children: samples.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex flex-wrap gap-x-4 gap-y-1 border-b border-border py-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted",
							children: hhmmss(s.ts)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["BN ", ms(s.binanceMs)] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["CS ", ms(s.coinswitchMs)] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["FX ", ms(s.fxMs)] })
					]
				}, s.ts))
			})
		})]
	});
}
function Field({ label, value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "grid gap-1 text-sm",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xxs uppercase tracking-wider text-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type: "number",
			value,
			onChange: (e) => onChange(Number(e.target.value)),
			className: "h-11 rounded-md bg-inset px-3 font-mono text-sm tabular text-fg shadow-[var(--shadow-border)]"
		})]
	});
}
function Row({ k, v }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
		className: "text-xxs uppercase tracking-wider text-muted",
		children: k
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
		className: "font-mono tabular",
		children: v
	})] });
}
function Cell({ label, value, tone }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-xxs uppercase tracking-wider text-muted",
		children: label
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: cn("font-mono text-xs tabular", tone !== void 0 ? clsDelta(tone) : ""),
		children: value
	})] });
}
function Empty({ text }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-sm text-pretty text-muted",
		children: text
	});
}
function usdtPad(n) {
	return n.toFixed(4);
}
function ms(n) {
	return n === null ? "timeout" : `${n.toFixed(0)} ms`;
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskApp, {});
}
//#endregion
export { Home as component };
