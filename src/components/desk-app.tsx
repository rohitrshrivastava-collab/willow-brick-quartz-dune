import {
  Activity,
  BarChart3,
  Bell,
  Code2,
  Gauge,
  GitBranch,
  Layers,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Settings2,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Spark } from "@/components/spark";
import { netUsdt, sessionStats } from "@/lib/engine/core";
import { hurdlePct, minQty } from "@/lib/engine/config";
import { PYTHON_FILES } from "@/lib/engine/python-files";
import { useDesk } from "@/lib/engine/store";
import type { AppView } from "@/lib/engine/types";
import { ago, base, clsDelta, hhmmss, inr, pct, px } from "@/lib/format";
import { cn } from "@/lib/cn";

const NAV: { id: AppView; label: string; icon: typeof Activity }[] = [
  { id: "desk", label: "Desk", icon: Activity },
  { id: "universe", label: "Universe", icon: Layers },
  { id: "blotter", label: "Blotter", icon: ScrollText },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "architecture", label: "Architecture", icon: GitBranch },
  { id: "config", label: "Config", icon: Settings2 },
  { id: "source", label: "Python", icon: Code2 },
  { id: "latency", label: "Latency", icon: Gauge },
];

export function DeskApp() {
  const view = useDesk((s) => s.view);
  const setView = useDesk((s) => s.setView);
  const engine = useDesk((s) => s.engine);
  const feed = useDesk((s) => s.feed);
  const start = useDesk((s) => s.start);
  const stop = useDesk((s) => s.stop);
  const resetSession = useDesk((s) => s.resetSession);
  const status = engine.status;
  const pollMs = engine.cfg.pollMs;

  useEffect(() => {
    useDesk.getState().setHydrated();
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    let cancelled = false;
    const poll = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch("/api/market", { cache: "no-store" });
        const snap = await res.json();
        if (cancelled) return;
        useDesk.getState().ingest(snap);
        useDesk.getState().notePoll(true, snap.error ?? null, performance.now() - t0);
      } catch (err) {
        if (cancelled) return;
        useDesk.getState().notePoll(false, err instanceof Error ? err.message : "feed error", performance.now() - t0);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status, pollMs]);

  const stats = sessionStats(engine);
  const hurdle = hurdlePct(engine.cfg);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-desk flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h1 className="font-sans text-xl font-medium tracking-tight text-balance">LAGFORGE</h1>
              <p className="text-xxs uppercase tracking-[0.18em] text-muted">
                Binance → CoinSwitch PRO
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">PAPER</Pill>
              <Pill>{engine.venue.split(" ")[0] || "FEED"}</Pill>
              <Pill tone={status === "running" ? "long" : "muted"}>
                {status === "running" ? "LIVE LOOP" : status === "paused" ? "PAUSED" : "ARMED"}
              </Pill>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Mark equity" value={inr(stats.markEquity, 0)} />
            <Stat
              label="Session net"
              value={inr(engine.realizedNetInr)}
              tone={engine.realizedNetInr}
            />
            <Stat label="Free margin" value={inr(stats.freeInr, 0)} />
            <Stat label="Open slots" value={`${engine.positions.length}/${engine.cfg.slotCount}`} />
            <Stat label="Win rate" value={`${stats.winRate.toFixed(0)}% · ${stats.trades} tr`} />
            <Stat label="USDT/INR" value={engine.usdtInr.toFixed(3)} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {status === "running" ? (
              <Button variant="outline" onClick={stop}>
                <Pause className="size-4" /> Pause
              </Button>
            ) : (
              <Button variant="accent" onClick={start}>
                <Play className="size-4" /> Start paper loop
              </Button>
            )}
            <Button variant="ghost" onClick={resetSession}>
              <RotateCcw className="size-4" /> Reset
            </Button>
            <p className="min-w-0 basis-full text-xs text-pretty text-muted sm:basis-auto">
              ₹{engine.cfg.startingCapitalInr.toLocaleString("en-IN")} · {engine.cfg.slotCount} slots ·{" "}
              {engine.cfg.leverage}× · hurdle {pct(hurdle)} · lag {engine.cfg.lagMs}ms
            </p>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-desk gap-1 overflow-x-auto px-3 py-2 sm:px-6">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-colors duration-150",
                  active ? "bg-elevated text-fg" : "text-muted hover:bg-surface hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto w-full min-w-0 max-w-desk px-4 py-5 sm:px-6 sm:py-6">
        {view === "desk" && <DeskView />}
        {view === "universe" && <UniverseView />}
        {view === "blotter" && <BlotterView />}
        {view === "alerts" && <AlertsView />}
        {view === "reports" && <ReportsView />}
        {view === "architecture" && <ArchitectureView />}
        {view === "config" && <ConfigView />}
        {view === "source" && <SourceView />}
        {view === "latency" && <LatencyView />}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-desk flex-col gap-1 px-4 py-3 text-xxs text-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
          <span>
            Feed {feed.lastOk ? "ok" : "down"} · {feed.lastMs.toFixed(0)}ms · polls {feed.polls}
            {feed.lastError ? ` · ${feed.lastError}` : ""}
          </span>
          <span>
            Calibration {stats.hours.toFixed(2)} / {engine.cfg.calibrationHours}h · avg hold{" "}
            {stats.avgHold.toFixed(1)}s · avg exec {stats.avgLatency.toFixed(1)}ms
          </span>
        </div>
      </footer>
    </div>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "long";
}) {
  const map = {
    muted: "text-muted shadow-[var(--shadow-border)]",
    accent: "text-accent-fg bg-accent",
    long: "text-long shadow-[var(--shadow-border)]",
  };
  return (
    <span className={cn("rounded-sm px-2 py-1 text-xxs font-medium uppercase tracking-wider", map[tone])}>
      {children}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
      <p className="text-xxs uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("mt-1 font-mono text-sm tabular", tone !== undefined ? clsDelta(tone) : "text-fg")}>
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  kicker,
  children,
  className,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5", className)}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        {kicker ? <p className="text-xxs uppercase tracking-wider text-muted">{kicker}</p> : null}
      </header>
      {children}
    </section>
  );
}

function DeskView() {
  const engine = useDesk((s) => s.engine);
  const stats = sessionStats(engine);
  const open = engine.positions;
  const recent = engine.trades.slice(0, 8);
  const alerts = engine.alerts.slice(0, 6);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel title="Open positions" kicker={`${open.length} locked`} className="lg:col-span-3">
        {open.length === 0 ? (
          <Empty text={engine.status === "running" ? "Waiting for a net-spread print above hurdle." : "Start the paper loop to arm the ten slots."} />
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((p) => {
              const pair = engine.pairs[p.symbol];
              const mark = p.side === "LONG" ? pair?.lag?.bid : pair?.lag?.ask;
              const u =
                mark !== undefined
                  ? p.side === "LONG"
                    ? (mark - p.entryPx) * p.qty * engine.usdtInr
                    : (p.entryPx - mark) * p.qty * engine.usdtInr
                  : 0;
              const net =
                mark !== undefined
                  ? netUsdt(
                      p.side,
                      p.entryPx,
                      mark,
                      p.filledQty,
                      engine.cfg.entryTakerFee,
                      engine.cfg.exitTakerFee,
                    )
                  : 0;
              const remain = Math.max(0, (p.timeoutTs - engine.lastTick) / 1000);
              const timeoutLabel =
                remain > 0
                  ? `${remain.toFixed(0)}s${p.armedBreakeven ? " · BE" : ""}`
                  : net >= 0
                    ? "flatten green"
                    : "hold, no timeout loss";
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-2 gap-2 rounded-md bg-elevated px-3 py-3 sm:grid-cols-6"
                >
                  <Cell label="Slot" value={`${p.side} ${base(p.symbol)}`} />
                  <Cell label="Fill" value={px(p.entryPx)} />
                  <Cell label="Target / stop" value={`${px(p.targetPx)} · ${px(p.stopPx)}`} />
                  <Cell label="Qty" value={`${p.filledQty}${p.filledQty < p.requestedQty ? " part" : ""}`} />
                  <Cell label="Unreal" value={inr(u)} tone={u} />
                  <Cell label="Timeout" value={timeoutLabel} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Calibration" kicker="72-hour gate" className="lg:col-span-2">
        <div className="h-2 overflow-hidden rounded-full bg-inset">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.min(100, (stats.hours / engine.cfg.calibrationHours) * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-pretty text-muted">
          {stats.hours.toFixed(2)} hours of paper tape. Do not go live until gross lead-lag covers
          fees across Asia, London, and US sessions.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xxs uppercase tracking-wider text-muted">Gross USDT</dt>
            <dd className="font-mono tabular">{usdtPad(engine.realizedGrossUsdt)}</dd>
          </div>
          <div>
            <dt className="text-xxs uppercase tracking-wider text-muted">Fees USDT</dt>
            <dd className="font-mono tabular">{usdtPad(engine.realizedFeesUsdt)}</dd>
          </div>
          <div>
            <dt className="text-xxs uppercase tracking-wider text-muted">Slot size</dt>
            <dd className="font-mono tabular">{inr(engine.equityInr / engine.cfg.slotCount, 0)}</dd>
          </div>
          <div>
            <dt className="text-xxs uppercase tracking-wider text-muted">Hurdle</dt>
            <dd className="font-mono tabular">{pct(hurdlePct(engine.cfg))}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Lead / lag tape" kicker="top of book" className="lg:col-span-3">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xxs uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="pb-2 font-medium">Coin</th>
                <th className="pb-2 font-medium">Binance mid</th>
                <th className="pb-2 font-medium">CS bid / ask</th>
                <th className="pb-2 font-medium">Long Δ</th>
                <th className="pb-2 font-medium">Short Δ</th>
                <th className="pb-2 font-medium">Slot</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular">
              {(engine.universe.length ? engine.universe : engine.cfg.candidateSymbols.slice(0, 10)).map(
                (sym) => {
                  const p = engine.pairs[sym];
                  return (
                    <tr key={sym} className="border-b border-border/80">
                      <td className="py-2.5 font-sans text-sm">{base(sym)}</td>
                      <td className="py-2.5">{p ? px(p.leadMid) : "—"}</td>
                      <td className="py-2.5">
                        {p?.lag ? `${px(p.lag.bid)} / ${px(p.lag.ask)}` : "buffering"}
                      </td>
                      <td className={cn("py-2.5", p && p.longDiv > p.hurdle ? "text-long" : "text-muted")}>
                        {p ? pct(p.longDiv) : "—"}
                      </td>
                      <td className={cn("py-2.5", p && p.shortDiv > p.hurdle ? "text-short" : "text-muted")}>
                        {p ? pct(p.shortDiv) : "—"}
                      </td>
                      <td className="py-2.5 text-muted">{p?.skipReason ?? (p?.eligible ? "open" : "—")}</td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Telegram feed" kicker="local" className="lg:col-span-2">
        {alerts.length === 0 ? (
          <Empty text="Entries, exits, and hourly summaries land here." />
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => (
              <li key={a.id} className="border-l-2 border-accent pl-3">
                <p className="text-xxs uppercase tracking-wider text-muted">
                  {a.kind} · {hhmmss(a.ts)}
                </p>
                <p className="text-sm">{a.title}</p>
                <p className="text-xs text-pretty text-muted">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent fills" kicker={`${recent.length} shown`} className="lg:col-span-5">
        {recent.length === 0 ? (
          <Empty text="No paper fills yet. Alts with jumpy books clear the hurdle more often than BTC." />
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xxs uppercase tracking-wider text-muted">
                <tr className="border-b border-border">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Slot</th>
                  <th className="pb-2 font-medium">Entry → exit</th>
                  <th className="pb-2 font-medium">Hold</th>
                  <th className="pb-2 font-medium">Net</th>
                  <th className="pb-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs tabular">
                {recent.map((t) => (
                  <tr key={t.id} className="border-b border-border/80">
                    <td className="py-2.5">{hhmmss(t.exitTs)}</td>
                    <td className="py-2.5 font-sans text-sm">
                      {t.side} {base(t.symbol)}
                    </td>
                    <td className="py-2.5">
                      {px(t.entryPx)} → {px(t.exitPx)}
                    </td>
                    <td className="py-2.5">{t.holdSec.toFixed(1)}s</td>
                    <td className={cn("py-2.5", clsDelta(t.netInr))}>{inr(t.netInr)}</td>
                    <td className="py-2.5 text-muted">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function UniverseView() {
  const engine = useDesk((s) => s.engine);
  const slot = engine.equityInr / engine.cfg.slotCount;
  const slotUsdt = slot / engine.usdtInr;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {engine.cfg.candidateSymbols.map((sym) => {
        const p = engine.pairs[sym];
        const L = engine.lead[sym];
        const active = engine.universe.includes(sym);
        const lot = minQty(sym);
        const minNotional = lot * (L?.ask ?? 0);
        const spark = engine.lastSpreadHist[sym] ?? [];
        return (
          <article key={sym} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">{base(sym)}</h3>
                <p className="text-xxs uppercase tracking-wider text-muted">
                  {active ? "top-10 slot" : "screened out"} · lot {lot}
                </p>
              </div>
              <Spark values={spark} className={cn("h-8 w-20", p && Math.max(p.longDiv, p.shortDiv) > p.hurdle ? "text-accent" : "text-faint")} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Row k="Lead mid" v={L ? px(L.last || p?.leadMid || 0) : "—"} />
              <Row k="24h quote" v={L ? `${(L.quoteVolume24h / 1e6).toFixed(0)}m` : "—"} />
              <Row k="Long Δ" v={p ? pct(p.longDiv) : "—"} />
              <Row k="Short Δ" v={p ? pct(p.shortDiv) : "—"} />
              <Row k="Min notional" v={minNotional ? `${minNotional.toFixed(2)} USDT` : "—"} />
              <Row k="Slot notional" v={`${(slotUsdt * engine.cfg.leverage).toFixed(2)} USDT`} />
            </dl>
            <p className="mt-3 text-xxs text-muted">
              {minNotional > slotUsdt * engine.cfg.leverage
                ? "Fails min lot vs ₹ slot — skipped."
                : p?.skipReason ?? (active ? "Eligible for one concurrent position." : "Waiting for tape.")}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function BlotterView() {
  const trades = useDesk((s) => s.engine.trades);
  if (!trades.length) {
    return (
      <Panel title="Trade blotter">
        <Empty text="Closed paper trades appear here with fees, hold time, and exit reason." />
      </Panel>
    );
  }
  return (
    <Panel title="Trade blotter" kicker={`${trades.length} recovered`}>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xxs uppercase tracking-wider text-muted">
            <tr className="border-b border-border">
              <th className="pb-2 font-medium">Exit</th>
              <th className="pb-2 font-medium">Side</th>
              <th className="pb-2 font-medium">Qty</th>
              <th className="pb-2 font-medium">Entry</th>
              <th className="pb-2 font-medium">Exit px</th>
              <th className="pb-2 font-medium">Gross</th>
              <th className="pb-2 font-medium">Fees</th>
              <th className="pb-2 font-medium">Net INR</th>
              <th className="pb-2 font-medium">Hold</th>
              <th className="pb-2 font-medium">ms</th>
              <th className="pb-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs tabular">
            {trades.map((t) => (
              <tr key={t.id} className="border-b border-border/80">
                <td className="py-2.5">{hhmmss(t.exitTs)}</td>
                <td className="py-2.5 font-sans">
                  {t.side} {base(t.symbol)}
                </td>
                <td className="py-2.5">{t.qty}</td>
                <td className="py-2.5">{px(t.entryPx)}</td>
                <td className="py-2.5">{px(t.exitPx)}</td>
                <td className={clsDelta(t.grossUsdt)}>{t.grossUsdt.toFixed(4)}</td>
                <td className="py-2.5 text-muted">{t.feesUsdt.toFixed(4)}</td>
                <td className={clsDelta(t.netInr)}>{inr(t.netInr)}</td>
                <td className="py-2.5">{t.holdSec.toFixed(1)}s</td>
                <td className="py-2.5">{t.latencyMs.toFixed(1)}</td>
                <td className="py-2.5 text-muted">{t.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function AlertsView() {
  const alerts = useDesk((s) => s.engine.alerts);
  return (
    <Panel title="Execution alerts" kicker="mirrors Telegram payload">
      {alerts.length === 0 ? (
        <Empty text="The Python bot posts the same payload to Telegram. This desk keeps a local copy." />
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-md bg-elevated px-4 py-3">
              <p className="text-xxs uppercase tracking-wider text-muted">
                {a.kind} · {hhmmss(a.ts)} · {ago(a.ts)}
              </p>
              <p className="mt-1 text-sm font-medium">{a.title}</p>
              <p className="mt-1 text-sm text-pretty text-muted">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ReportsView() {
  const engine = useDesk((s) => s.engine);
  const stats = sessionStats(engine);
  const hourSoFar = engine.hourBucket.trades;
  const wins = hourSoFar.filter((t) => t.netUsdt > 0).length;
  return (
    <div className="grid gap-4">
      <Panel title="Current hour (in progress)" kicker="flushes on the hour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Trades" value={`${hourSoFar.length}`} />
          <Stat label="Wins" value={`${wins}`} />
          <Stat
            label="Net"
            value={inr(hourSoFar.reduce((s, t) => s + t.netInr, 0))}
            tone={hourSoFar.reduce((s, t) => s + t.netInr, 0)}
          />
          <Stat label="Session hours" value={stats.hours.toFixed(2)} />
        </div>
      </Panel>
      <Panel title="Hourly archive" kicker="same body as Telegram /1h">
        {engine.reports.length === 0 ? (
          <Empty text="A sealed hour report is written every 60 minutes of runtime." />
        ) : (
          <ul className="flex flex-col gap-2">
            {engine.reports.map((r) => (
              <li key={r.id} className="rounded-md bg-elevated px-4 py-3 text-sm">
                <p className="text-xxs uppercase tracking-wider text-muted">
                  Hour {r.hourIndex} · {hhmmss(r.ts)}
                </p>
                <p className="mt-1 font-mono text-xs tabular text-pretty">
                  {r.trades} tr · W/L {r.wins}/{r.losses} · WR {r.winRate.toFixed(0)}% · gross{" "}
                  {r.grossUsdt.toFixed(4)} · fees {r.feesUsdt.toFixed(4)} · net {inr(r.netInr)} · equity{" "}
                  {inr(r.equityInr, 0)} · hold {r.avgHoldSec.toFixed(1)}s · exec {r.avgLatencyMs.toFixed(1)}ms
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ArchitectureView() {
  const mods = [
    {
      name: "DataIngestion",
      body: "Persistent WebSockets only for prices. Binance futures bookTicker is the lead. CoinSwitch PRO Socket.IO order-book snapshots are the lag. REST is banned from the trigger path.",
    },
    {
      name: "SignalEngine",
      body: "Compares Binance mid to CoinSwitch best ask (long) and best bid (short). Fires only when gross divergence clears entry taker + exit fee + slippage buffer. Never uses LTP.",
    },
    {
      name: "PortfolioManager",
      body: "₹10,000 start. Equal weight: available equity / 10. One locked slot per coin until fully closed. Lot-size gate rejects coins whose min contract exceeds slot notional × leverage.",
    },
    {
      name: "OrderExecutor",
      body: "Sizes to ≤25% of top-of-book. Tracks partial fills and resizes the exit to filled qty. Token-bucket 15/min. Paper fills against live TOB; live uses Ed25519-signed CoinSwitch futures orders.",
    },
    {
      name: "RiskManager",
      body: "Target = Binance mid at entry. Timeout (45s) flattens only if the close is net-green after fees — it will not realize a timeout loss. Once the trade is green, the stop ratchets to scratch so a giveback cannot turn a winner red. Hard vol stop still cuts violent reversals.",
    },
    {
      name: "TelegramReporter",
      body: "Immediate entry/exit cards and a 1-hour PnL tape: trades, win rate, gross vs net, free margin, average hold, average signal-to-fill latency.",
    },
  ];
  return (
    <div className="grid gap-4">
      <Panel title="Lead-lag path" kicker="ap-south-1">
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            "Binance bookTicker WS",
            "Hurdle + depth gate",
            "CoinSwitch futures / HFT order",
            "Partial fill tracker",
            "Target / stop / profit-only timeout",
            "SQLite + Telegram",
          ].map((step, i) => (
            <li key={step} className="rounded-md bg-elevated px-3 py-3 text-sm">
              <span className="font-mono text-xxs text-accent">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-1">{step}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-pretty text-muted">
          CoinSwitch PRO perpetual futures are USDT-margined. INR is the capital and reporting currency.
          USDT/INR is a live FX tape used to size slots and publish ₹ PnL — not a hardcoded multiplier.
          If a venue quoted INR, the same FX book would translate the Binance USDT mid before the hurdle.
        </p>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2">
        {mods.map((m) => (
          <article key={m.name} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <h3 className="font-mono text-xs uppercase tracking-wider text-accent">{m.name}</h3>
            <p className="mt-2 text-sm text-pretty text-muted">{m.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ConfigView() {
  const cfg = useDesk((s) => s.engine.cfg);
  const patch = useDesk((s) => s.patchConfig);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Paper desk parameters" kicker="always paper in this preview">
        <div className="grid gap-3">
          <Field
            label="Starting capital (INR)"
            value={cfg.startingCapitalInr}
            onChange={(v) => patch({ startingCapitalInr: v })}
          />
          <Field label="Slot count" value={cfg.slotCount} onChange={(v) => patch({ slotCount: v })} />
          <Field label="Leverage" value={cfg.leverage} onChange={(v) => patch({ leverage: v })} />
          <Field
            label="Hold timeout (sec)"
            value={cfg.holdTimeoutSec}
            onChange={(v) => patch({ holdTimeoutSec: v })}
          />
          <p className="text-xs text-pretty text-muted">
            Timeout never closes a loser. After 45s it only flattens if net PnL after fees is
            positive. Green trades ratchet the stop to scratch so a giveback cannot print a timeout
            loss.
          </p>
          <Field label="Lag buffer (ms)" value={cfg.lagMs} onChange={(v) => patch({ lagMs: v })} />
          <Field
            label="Slippage buffer (bps)"
            value={Math.round(cfg.slippageBuffer * 1e4)}
            onChange={(v) => patch({ slippageBuffer: v / 1e4 })}
          />
          <Field
            label="Max top-of-book %"
            value={Math.round(cfg.maxTobPct * 100)}
            onChange={(v) => patch({ maxTobPct: v / 100 })}
          />
        </div>
        <p className="mt-4 text-xs text-pretty text-muted">
          Live keys never enter this desk. Put them in env vars on the machine that runs the Python
          bot. PAPER_TRADING stays true until you also set CONFIRM_LIVE=YES.
        </p>
      </Panel>
      <Panel title="Local & EC2 runbook">
        <ol className="flex list-decimal flex-col gap-3 pl-4 text-sm text-pretty text-muted">
          <li>Download the Python pack from the Python tab (or /lagforge-bot.zip).</li>
          <li>Create a venv, pip install -r requirements.txt, copy env.example to .env.</li>
          <li>Run python latency_bench.py from the same region you will trade.</li>
          <li>python main.py with PAPER_TRADING=true for 72 hours.</li>
          <li>
            On EC2 Ubuntu in ap-south-1, install the systemd unit, keep paper on, then flip live only
            after the tape beats fees.
          </li>
        </ol>
      </Panel>
    </div>
  );
}

function SourceView() {
  return (
    <div className="grid gap-4">
      <Panel title="Production Python pack" kicker="VS Code + EC2">
        <p className="text-sm text-pretty text-muted">
          Same modules as this desk: WebSocket lead/lag, equal-weight ₹ slots, hurdle gate, partial
          fills, timeout, vol stop, SQLite recovery, Telegram. Paper by default.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/lagforge-bot.zip"
            className="inline-flex h-11 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg"
          >
            Download lagforge-bot.zip
          </a>
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {PYTHON_FILES.map((f) => (
            <li key={f.path}>
              <a
                href={`/lagforge-bot/${f.path}`}
                className="flex h-11 items-center justify-between rounded-md bg-elevated px-3 text-sm"
              >
                <span>{f.label}</span>
                <span className="font-mono text-xxs text-muted">{f.path}</span>
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function LatencyView() {
  const samples = useDesk((s) => s.latency);
  const push = useDesk((s) => s.pushLatency);
  async function run() {
    const res = await fetch("/api/latency", { cache: "no-store" });
    const data = await res.json();
    push({
      ts: data.ts,
      binanceMs: data.binanceMs,
      coinswitchMs: data.coinswitchMs,
      fxMs: data.fxMs,
    });
  }
  useEffect(() => {
    if (samples.length === 0) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const last = samples[0];
  return (
    <div className="grid gap-4">
      <Panel title="Round-trip probe" kicker="this hosted desk">
        <p className="text-sm text-pretty text-muted">
          Numbers here are from the preview host, not Mumbai. Ship latency_bench.py to the EC2 box
          (or your laptop) for the real path to api.binance.com and coinswitch.co.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="accent" onClick={() => void run()}>
            Run probe
          </Button>
        </div>
        {last ? (
          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Binance public" value={ms(last.binanceMs)} />
            <Stat label="CoinSwitch time" value={ms(last.coinswitchMs)} />
            <Stat label="FX USD/INR" value={ms(last.fxMs)} />
          </dl>
        ) : null}
      </Panel>
      <Panel title="History">
        {samples.length === 0 ? (
          <Empty text="No samples yet." />
        ) : (
          <ul className="font-mono text-xs tabular">
            {samples.map((s) => (
              <li key={s.ts} className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border py-2">
                <span className="text-muted">{hhmmss(s.ts)}</span>
                <span>BN {ms(s.binanceMs)}</span>
                <span>CS {ms(s.coinswitchMs)}</span>
                <span>FX {ms(s.fxMs)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xxs uppercase tracking-wider text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 rounded-md bg-inset px-3 font-mono text-sm tabular text-fg shadow-[var(--shadow-border)]"
      />
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xxs uppercase tracking-wider text-muted">{k}</dt>
      <dd className="font-mono tabular">{v}</dd>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div>
      <p className="text-xxs uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("font-mono text-xs tabular", tone !== undefined ? clsDelta(tone) : "")}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-pretty text-muted">{text}</p>;
}

function usdtPad(n: number) {
  return n.toFixed(4);
}

function ms(n: number | null) {
  return n === null ? "timeout" : `${n.toFixed(0)} ms`;
}
