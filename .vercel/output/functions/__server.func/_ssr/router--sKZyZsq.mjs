import { i as __toESM } from "../_runtime.mjs";
import { L as require_react, _ as useRouter, f as createRouter, g as createRootRoute, h as createFileRoute, l as Scripts, m as lazyRouteComponent, p as Outlet, u as HeadContent, v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as TriangleAlert } from "../_libs/lucide-react.mjs";
import { a as union, i as string, n as number, r as object, t as literal } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router--sKZyZsq.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return FALLBACK_MESSAGE;
}
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: errorMessage(error)
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
var ConnectorTokenReadySchema = EnvelopeSchema.extend({ type: literal("connector-token-ready") });
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Origin of the Grok embedder framing this page, or null when the page runs
* top-level (download/export, local `npm run dev`, deployed sites) or under a
* non-Grok parent. Client-only; null during SSR.
*/
function resolveCurrentEmbedderOrigin() {
	if (typeof window === "undefined") return null;
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	return resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	const parentOrigin = resolveCurrentEmbedderOrigin();
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onHello = (data) => {
		if (!HelloSchema.safeParse(data).success) return;
		announce();
	};
	const onNavigate = (data) => {
		const parsed = NavigateSchema.safeParse(data);
		if (!parsed.success) return;
		navigate(parsed.data.path);
		queueMicrotask(reportLocation);
	};
	const onHistory = (data) => {
		const parsed = HistorySchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
		window.history.go(parsed.data.delta);
	};
	const onConnectorTokenReady = (data) => {
		if (!ConnectorTokenReadySchema.safeParse(data).success) return;
		window.dispatchEvent(new Event(CONNECTOR_TOKEN_READY_EVENT));
	};
	const hostMessageHandlers = /* @__PURE__ */ new Map([
		["hello", onHello],
		["navigate", onNavigate],
		["history", onHistory],
		["connector-token-ready", onConnectorTokenReady]
	]);
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		hostMessageHandlers.get(envelope.data.type)?.(event.data);
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var styles_default = "/assets/styles-DQSRBHVn.css";
var APP_NAME = "LAGFORGE";
var Route$3 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "description",
				content: "Lead-lag latency desk: Binance Futures to CoinSwitch PRO. Paper-trading calibration with ₹10,000 slots."
			},
			{
				name: "theme-color",
				content: "#09090b"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		className: "antialiased",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", {
			className: "bg-bg text-fg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
			]
		})]
	})
});
var $$splitComponentImporter = () => import("./routes-DpLwhkzU.mjs");
var Route$2 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
async function rtt(url, ms = 4e3) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), ms);
	const t0 = Date.now();
	try {
		const res = await fetch(url, {
			method: "GET",
			cache: "no-store",
			signal: ctrl.signal
		});
		await res.arrayBuffer();
		if (!res.ok && res.status >= 500) return null;
		return Date.now() - t0;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}
var Route$1 = createFileRoute("/api/latency")({ server: { handlers: { GET: async () => {
	const [binanceMs, coinswitchMs, fxMs] = await Promise.all([
		rtt("https://data-api.binance.vision/api/v3/ping"),
		rtt("https://coinswitch.co/trade/api/v2/time"),
		rtt("https://open.er-api.com/v6/latest/USD")
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
			fx: "https://open.er-api.com/v6/latest/USD"
		}
	});
} } } });
/** Conservative CoinSwitch-style lot sizes for the paper desk. */
var MIN_QTY = {
	BTCUSDT: .001,
	ETHUSDT: .001,
	SOLUSDT: .01,
	BNBUSDT: .01,
	XRPUSDT: 1,
	DOGEUSDT: 1,
	ADAUSDT: 1,
	AVAXUSDT: .1,
	LINKUSDT: .1,
	DOTUSDT: .1,
	LTCUSDT: .01,
	SUIUSDT: 1,
	NEARUSDT: .1,
	APTUSDT: .01,
	ARBUSDT: 1,
	OPUSDT: 1,
	UNIUSDT: .1,
	ATOMUSDT: .1,
	FILUSDT: .1,
	PEPEUSDT: 1e5,
	SHIBUSDT: 1e4,
	WIFUSDT: 1
};
var CANDIDATE_SYMBOLS = [
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
	"FILUSDT"
];
var DEFAULT_CONFIG = {
	paperTrading: true,
	startingCapitalInr: 1e4,
	slotCount: 10,
	leverage: 10,
	entryTakerFee: 65e-5,
	exitTakerFee: 65e-5,
	slippageBuffer: 5e-4,
	maxTobPct: .25,
	holdTimeoutSec: 45,
	minStopPct: .0015,
	volStopMult: 2.2,
	lagMs: 220,
	extraLagSpreadBps: 4,
	maxSlippagePct: .001,
	pollMs: 400,
	calibrationHours: 72,
	candidateSymbols: [...CANDIDATE_SYMBOLS]
};
function hurdlePct(cfg) {
	return cfg.entryTakerFee + cfg.exitTakerFee + cfg.slippageBuffer;
}
function minQty(symbol) {
	return MIN_QTY[symbol] ?? .01;
}
function roundQty(qty, step) {
	if (step <= 0) return qty;
	const rounded = Math.floor(qty / step + 1e-12) * step;
	const decimals = step >= 1 ? 0 : Math.min(8, (step.toString().split(".")[1] ?? "").length);
	return Number(rounded.toFixed(decimals));
}
var SYMBOLS = [...CANDIDATE_SYMBOLS];
var FX_TTL_MS = 6e4;
var fxCache = null;
function symbolsParam(symbols) {
	return encodeURIComponent(JSON.stringify(symbols));
}
async function fetchJson(url, ms = 4500) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), ms);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			cache: "no-store"
		});
		if (!res.ok) throw new Error(`${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(t);
	}
}
async function loadFx() {
	const now = Date.now();
	if (fxCache && now - fxCache.ts < FX_TTL_MS) return {
		rate: fxCache.rate,
		source: fxCache.source
	};
	try {
		const data = await fetchJson("https://open.er-api.com/v6/latest/USD");
		const inr = data.rates?.INR;
		if (data.result === "success" && typeof inr === "number" && inr > 0) {
			fxCache = {
				rate: inr,
				source: "open.er-api USD/INR ≈ USDT/INR",
				ts: now
			};
			return {
				rate: inr,
				source: fxCache.source
			};
		}
	} catch {}
	if (fxCache) return {
		rate: fxCache.rate,
		source: `${fxCache.source} (stale)`
	};
	return {
		rate: 96,
		source: "fallback USDINR 96"
	};
}
async function loadBinance() {
	const q = symbolsParam(SYMBOLS);
	try {
		const [books, stats] = await Promise.all([fetchJson(`https://data-api.binance.vision/api/v3/ticker/bookTicker?symbols=${q}`), fetchJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${q}`)]);
		const statMap = new Map(stats.map((s) => [s.symbol, s]));
		const tickers = books.map((b) => {
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
				ts: Date.now()
			};
		}).filter((t) => t.bid > 0 && t.ask > 0);
		if (!tickers.length) return null;
		return {
			tickers,
			venue: "binance.vision spot book (lead proxy)"
		};
	} catch {
		return null;
	}
}
var seedPx = {
	BTCUSDT: 76300,
	ETHUSDT: 2440,
	SOLUSDT: 101,
	XRPUSDT: 2.18,
	DOGEUSDT: .128,
	BNBUSDT: 590,
	ADAUSDT: .62,
	AVAXUSDT: 28.4,
	LINKUSDT: 13.2,
	SUIUSDT: 2.55,
	DOTUSDT: 4.7,
	LTCUSDT: 78,
	NEARUSDT: 4.1,
	APTUSDT: 8.4,
	ARBUSDT: .38,
	UNIUSDT: 7.1,
	ATOMUSDT: 4.4,
	FILUSDT: 3.9
};
function synthetic() {
	const t = Date.now();
	return SYMBOLS.map((symbol, i) => {
		const base = seedPx[symbol] ?? 10;
		const wave = Math.sin(t / 900 + i) * 9e-4 + Math.sin(t / 2400 + i * .4) * .0016;
		const jump = Math.sin(t / 180 + i * 1.7) > .985 ? .0024 * Math.sign(Math.sin(t + i)) : 0;
		const px = base * (1 + wave + jump);
		const spread = px * (4e-5 + i % 5 * 1e-5);
		return {
			symbol,
			bid: px - spread / 2,
			ask: px + spread / 2,
			bidQty: 20 + i * 7 % 40,
			askQty: 18 + i * 5 % 35,
			last: px,
			quoteVolume24h: 8e6 * (18 - i),
			priceChangePct: wave * 100,
			ts: t
		};
	});
}
var Route = createFileRoute("/api/market")({ server: { handlers: { GET: async () => {
	const fx = await loadFx();
	const live = await loadBinance();
	const body = live ? {
		ok: true,
		ts: Date.now(),
		venue: live.venue,
		usdtInr: fx.rate,
		fxSource: fx.source,
		tickers: live.tickers
	} : {
		ok: true,
		ts: Date.now(),
		venue: "synthetic replay (Binance public feed unreachable)",
		usdtInr: fx.rate,
		fxSource: fx.source,
		tickers: synthetic(),
		error: "lead feed fallback"
	};
	return Response.json(body, { headers: { "cache-control": "no-store" } });
} } } });
var rootRouteChildren = {
	IndexRoute: Route$2.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$3
	}),
	ApiLatencyRoute: Route$1.update({
		id: "/api/latency",
		path: "/api/latency",
		getParentRoute: () => Route$3
	}),
	ApiMarketRoute: Route.update({
		id: "/api/market",
		path: "/api/market",
		getParentRoute: () => Route$3
	})
};
var routeTree = Route$3._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { roundQty as a, minQty as i, DEFAULT_CONFIG as n, hurdlePct as r, router_exports as t };
