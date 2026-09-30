import {
  Activity,
  BarChart3,
  Bell,
  Code2,
  Copy,
  ExternalLink,
  Gauge,
  GitBranch,
  KeyRound,
  Layers,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Settings2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spark } from "@/components/spark";
import { netUsdt, sessionStats } from "@/lib/engine/core";
import { hurdlePct, minQty, venueLabel, venueShort, VENUE_PROFILE } from "@/lib/engine/config";
import { PYTHON_FILES } from "@/lib/engine/python-files";
import { useDesk } from "@/lib/engine/store";
import type { AppView, LagVenue } from "@/lib/engine/types";
import { ago, base, clsDelta, hhmmss, inr, pct, px } from "@/lib/format";
import { cn } from "@/lib/cn";

const REPO_PAGE = "https://github.com/rohitrshrivastava-collab/lagforge-bot";
const REPO_CLONE = `${REPO_PAGE}.git`;
const REPO_ZIP = `${REPO_PAGE}/archive/refs/heads/main.zip`;

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
  const liveIntent = useDesk((s) => s.liveIntent);
  const setLiveIntent = useDesk((s) => s.setLiveIntent);
  const keysSaved = useDesk((s) => s.keysSaved);
  const confirmLive = useDesk((s) => s.confirmLive);
  const liveNotice = useDesk((s) => s.liveNotice);
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
                Binance → {venueLabel(engine.cfg.lagVenue)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VenueToggle compact />
              <div className="flex rounded-sm shadow-[var(--shadow-border)]">
                <button
                  type="button"
                  onClick={() => setLiveIntent(false)}
                  className={cn(
                    "h-8 px-3 text-xxs font-medium uppercase tracking-wider",
                    !liveIntent ? "bg-accent text-accent-fg" : "text-muted",
                  )}
                >
                  Paper
                </button>
                <button
                  type="button"
                  onClick={() => setLiveIntent(true)}
                  className={cn(
                    "h-8 px-3 text-xxs font-medium uppercase tracking-wider",
                    liveIntent ? "bg-short text-fg" : "text-muted",
                  )}
                >
                  Live
                </button>
              </div>
              <Pill>{venueShort(engine.cfg.lagVenue)}</Pill>
              <Pill tone={engine.halted ? "short" : status === "running" ? "long" : "muted"}>
                {engine.halted
                  ? "MAX LOSS"
                  : status === "running"
                    ? liveIntent
                      ? "LIVE ARM"
                      : "LOOP ON"
                    : status === "paused"
                      ? "PAUSED"
                      : liveIntent
                        ? "LIVE READY"
                        : "ARMED"}
              </Pill>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Stat
              label={`${venueShort(engine.cfg.lagVenue)} ${liveIntent ? "wallet" : "paper wallet"}`}
              value={inr(stats.walletInr, 0)}
            />
            <Stat label={`Allocated ${engine.cfg.allocPct}%`} value={inr(stats.allocatedInr, 0)} />
            <Stat
              label="Session net"
              value={inr(stats.sessionPnl)}
              tone={stats.sessionPnl}
            />
            <Stat
              label="Loss remaining"
              value={engine.cfg.maxSessionLossInr > 0 ? inr(stats.lossRemaining, 0) : "off"}
              tone={engine.halted ? -1 : stats.lossRemaining}
            />
            <Stat label="Open slots" value={`${engine.positions.length}/${engine.cfg.slotCount}`} />
            <Stat label="USDT/INR" value={engine.usdtInr.toFixed(3)} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {status === "running" ? (
              <Button variant="outline" onClick={stop}>
                <Pause className="size-4" /> Pause
              </Button>
            ) : (
              <Button
                variant="accent"
                onClick={start}
                disabled={
                  (engine.halted &&
                    engine.cfg.maxSessionLossInr > 0 &&
                    stats.lossUsed >= engine.cfg.maxSessionLossInr) ||
                  (liveIntent && (!keysSaved || !confirmLive))
                }
              >
                <Play className="size-4" /> {startLabel(engine.halted, stats.lossUsed, engine.cfg.maxSessionLossInr, liveIntent, keysSaved, confirmLive)}
              </Button>
            )}
            <Button variant="ghost" onClick={resetSession}>
              <RotateCcw className="size-4" /> Reset
            </Button>
            <p className="min-w-0 basis-full text-xs text-pretty text-muted sm:basis-auto">
              ₹{engine.cfg.startingCapitalInr.toLocaleString("en-IN")} wallet · {engine.cfg.allocPct}% in
              play · {engine.cfg.slotCount} slots · {engine.cfg.leverage}× · hurdle {pct(hurdle)} ·{" "}
              {venueShort(engine.cfg.lagVenue)} · {liveIntent ? "LIVE-ARM" : "PAPER"}
            </p>
          </div>
          {engine.halted ? (
            <div className="rounded-md bg-short/15 px-3 py-3 text-sm text-pretty">
              <p className="font-medium text-short">Session max loss hit. Trading is stopped.</p>
              <p className="mt-1 text-muted">
                Open slots were flattened. Raise the max-loss cap or reset the session before starting
                the loop again.
              </p>
            </div>
          ) : null}
          {liveNotice ? (
            <div className="rounded-md bg-warn/15 px-3 py-3 text-sm text-pretty text-muted">{liveNotice}</div>
          ) : null}
          {liveIntent ? (
            <div className="rounded-md bg-short/15 px-3 py-3 text-sm text-pretty">
              <p className="font-medium text-short">Live-armed — every control on this desk is live.</p>
              <p className="mt-1 text-muted">
                CS/DCX, wallet, allocation, max-loss, start/pause, blotter, and keys all work here.
                Fills in this hosted preview stay simulated against the Binance tape. The same desk
                opened by python main.py on your PC is what sends real {venueLabel(engine.cfg.lagVenue)}{" "}
                market orders after keys + YES.
              </p>
            </div>
          ) : (
            <div className="rounded-md bg-elevated px-3 py-3 text-sm text-pretty text-muted">
              Paper mode. Loop, venue, allocation, and max-loss are fully armed. Switch to Live, save
              keys, type YES, then start for the live-armed rehearsal.
            </div>
          )}
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
  tone?: "muted" | "accent" | "long" | "short";
}) {
  const map = {
    muted: "text-muted shadow-[var(--shadow-border)]",
    accent: "text-accent-fg bg-accent",
    long: "text-long shadow-[var(--shadow-border)]",
    short: "text-short shadow-[var(--shadow-border)]",
  };
  return (
    <span className={cn("rounded-sm px-2 py-1 text-xxs font-medium uppercase tracking-wider", map[tone])}>
      {children}
    </span>
  );
}

function CopyCloneButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(REPO_CLONE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-11 items-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg"
    >
      <Copy className="size-4" />
      {copied ? "Copied" : "Copy GitHub clone URL"}
    </button>
  );
}

function DownloadPackButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/bot-zip", { cache: "no-store" });
      if (!res.ok) throw new Error("pack missing");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lagforge-bot.zip";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote("If Quick Heal blocks this preview, skip this button. Use GitHub instead.");
    } catch {
      setNote("This preview blocked the save. Open GitHub and clone or download the zip there.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="inline-flex h-11 items-center rounded-md px-4 text-sm text-muted shadow-[var(--shadow-border)] disabled:opacity-60"
      >
        {busy ? "Preparing zip…" : "Last resort: zip from this preview"}
      </button>
      {note ? <p className="text-xs text-pretty text-muted">{note}</p> : null}
    </div>
  );
}

function startLabel(
  halted: boolean,
  lossUsed: number,
  cap: number,
  live: boolean,
  keysSaved: boolean,
  confirmLive: boolean,
) {
  if (halted && cap > 0 && lossUsed >= cap) return "Halted — raise cap or reset";
  if (live && !keysSaved) return "Save keys to arm live";
  if (live && !confirmLive) return "Type YES to arm live";
  if (live) return "Start live-armed loop";
  return "Start paper loop";
}

function ModePanel() {
  const liveIntent = useDesk((s) => s.liveIntent);
  const setLiveIntent = useDesk((s) => s.setLiveIntent);
  const venue = useDesk((s) => s.engine.cfg.lagVenue);
  return (
    <div className="mb-4 rounded-md bg-elevated px-3 py-3">
      <p className="text-xxs uppercase tracking-wider text-muted">Execution mode</p>
      <div className="mt-2 flex rounded-sm shadow-[var(--shadow-border)]">
        <button
          type="button"
          onClick={() => setLiveIntent(false)}
          className={cn(
            "h-10 flex-1 px-3 text-sm",
            !liveIntent ? "bg-accent text-accent-fg" : "text-muted",
          )}
        >
          Paper
        </button>
        <button
          type="button"
          onClick={() => setLiveIntent(true)}
          className={cn(
            "h-10 flex-1 px-3 text-sm",
            liveIntent ? "bg-short text-fg" : "text-muted",
          )}
        >
          Live
        </button>
      </div>
      <p className="mt-2 text-xs text-pretty text-muted">
        {liveIntent
          ? "Live-armed uses every control on this desk. Fills in this hosted preview stay simulated. python main.py on your PC is the copy that can send exchange orders."
          : `Paper fills against the live Binance tape with a lagged ${venueLabel(venue)} book. No orders leave this desk.`}
      </p>
    </div>
  );
}

function VenueToggle({ compact = false }: { compact?: boolean }) {
  const venue = useDesk((s) => s.engine.cfg.lagVenue);
  const setLagVenue = useDesk((s) => s.setLagVenue);
  const options: LagVenue[] = ["COINSWITCH", "COINDCX"];
  return (
    <div className={cn("flex rounded-sm shadow-[var(--shadow-border)]", compact ? "" : "w-full")}>
      {options.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setLagVenue(id)}
          className={cn(
            compact
              ? "h-8 px-3 text-xxs font-medium uppercase tracking-wider"
              : "h-11 flex-1 px-3 text-sm",
            venue === id ? "bg-accent text-accent-fg" : "text-muted",
          )}
        >
          {compact ? venueShort(id) : VENUE_PROFILE[id].label}
        </button>
      ))}
    </div>
  );
}

function KeysPanel() {
  const venue = useDesk((s) => s.engine.cfg.lagVenue);
  const liveIntent = useDesk((s) => s.liveIntent);
  const keysSaved = useDesk((s) => s.keysSaved);
  const confirmLive = useDesk((s) => s.confirmLive);
  const saveKeys = useDesk((s) => s.saveKeys);
  const setConfirmLive = useDesk((s) => s.setConfirmLive);
  const [api, setApi] = useState("");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function onSave() {
    if (!saveKeys(api, secret)) {
      setNote("Both API key and secret are required.");
      return;
    }
    const yes = confirm.trim().toUpperCase() === "YES";
    setConfirmLive(yes);
    setApi("");
    setSecret("");
    setNote(
      yes
        ? `Keys flagged for ${venueLabel(venue)}. Confirm live = YES. This tab does not store the secret and cannot send it to the exchange.`
        : `Keys flagged for ${venueLabel(venue)}. Type YES and save again to arm live.`,
    );
  }

  return (
    <div className="rounded-md bg-elevated px-3 py-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted" />
        <p className="text-xxs uppercase tracking-wider text-muted">
          {venueLabel(venue)} API + secret
        </p>
      </div>
      <p className="mt-2 text-sm text-pretty text-muted">
        Paste keys to arm Live on this desk. This hosted preview never writes them to disk and never
        posts them. On your PC, the same fields in python main.py save into local .env.
      </p>
      <div className="mt-3 grid gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xxs uppercase tracking-wider text-muted">API key</span>
          <input
            type="password"
            autoComplete="off"
            value={api}
            placeholder={keysSaved ? "saved — paste to replace" : "paste API key"}
            onChange={(e) => setApi(e.target.value)}
            className="h-11 w-full rounded-md bg-inset px-3 font-mono text-sm text-fg shadow-[var(--shadow-border)]"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xxs uppercase tracking-wider text-muted">Secret key</span>
          <input
            type="password"
            autoComplete="off"
            value={secret}
            placeholder={keysSaved ? "saved — paste to replace" : "paste secret"}
            onChange={(e) => setSecret(e.target.value)}
            className="h-11 w-full rounded-md bg-inset px-3 font-mono text-sm text-fg shadow-[var(--shadow-border)]"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xxs uppercase tracking-wider text-muted">Confirm live (type YES)</span>
          <input
            type="text"
            autoComplete="off"
            value={confirm}
            placeholder={confirmLive ? "YES is set" : "YES"}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 w-full rounded-md bg-inset px-3 font-mono text-sm text-fg shadow-[var(--shadow-border)]"
          />
        </label>
        <button
          type="button"
          onClick={onSave}
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Save keys
        </button>
      </div>
      <p className="mt-3 text-xs text-pretty text-muted">
        Keys flagged: {keysSaved ? "yes" : "no"} · CONFIRM_LIVE: {confirmLive ? "YES" : "not set"}
        {liveIntent ? " · Live switch is on" : ""}
      </p>
      {note ? <p className="mt-2 text-xs text-pretty text-muted">{note}</p> : null}
    </div>
  );
}

function CapitalPanel() {
  const cfg = useDesk((s) => s.engine.cfg);
  const patch = useDesk((s) => s.patchConfig);
  const stats = sessionStats(useDesk((s) => s.engine));
  const halted = useDesk((s) => s.engine.halted);

  return (
    <Panel
      title="Capital & session risk"
      kicker={venueLabel(cfg.lagVenue)}
      className="lg:col-span-5"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <div>
            <p className="mb-2 text-xxs uppercase tracking-wider text-muted">Lag exchange</p>
            <VenueToggle />
            <p className="mt-2 text-xs text-pretty text-muted">
              Lead stays Binance. Fees and the live order path switch with this toggle. CoinSwitch
              taker 0.065%. CoinDCX USDT-M taker 0.05% + GST.
            </p>
          </div>
          <div className="rounded-md bg-elevated px-3 py-3">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-muted" />
              <p className="text-xxs uppercase tracking-wider text-muted">
                {venueShort(cfg.lagVenue)} wallet
              </p>
            </div>
            <p className="mt-2 font-mono text-2xl tabular">{inr(stats.walletInr, 0)}</p>
            <p className="mt-1 text-xs text-pretty text-muted">
              Wallet = seed plus this session's marked PnL. Allocation % sizes the ten slots from
              this number. A live {venueLabel(cfg.lagVenue)} futures balance is fetched by python
              main.py after keys — not by this hosted preview.
            </p>
          </div>
        </div>
        <div className="grid gap-3">
          <Field
            label="Paper wallet seed (INR)"
            value={cfg.startingCapitalInr}
            onChange={(v) => patch({ startingCapitalInr: v })}
          />
          <Field
            label="% of wallet allocated to trade"
            value={cfg.allocPct}
            onChange={(v) => patch({ allocPct: v })}
            suffix="%"
          />
          <div className="flex flex-wrap gap-2">
            {[25, 50, 75, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => patch({ allocPct: n })}
                className={cn(
                  "h-9 min-w-11 rounded-sm px-3 text-xs",
                  cfg.allocPct === n ? "bg-accent text-accent-fg" : "text-muted shadow-[var(--shadow-border)]",
                )}
              >
                {n}%
              </button>
            ))}
          </div>
          <p className="text-xs text-pretty text-muted">
            Slots size from {inr(stats.allocatedInr, 0)} ({cfg.allocPct}% of the seed). The rest of
            the wallet stays idle.
          </p>
          <Field
            label="Max session loss (INR) — halt if hit"
            value={cfg.maxSessionLossInr}
            onChange={(v) => patch({ maxSessionLossInr: v })}
          />
          <p className={cn("text-xs text-pretty", halted ? "text-short" : "text-muted")}>
            {halted
              ? "Cap reached. Loop is stopped and open slots were flattened."
              : cfg.maxSessionLossInr > 0
                ? `${inr(stats.lossUsed, 0)} used · ${inr(stats.lossRemaining, 0)} left. At the cap the loop stops immediately.`
                : "Set a rupee amount. 0 turns the kill switch off."}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <KeysPanel />
      </div>
    </Panel>
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
  const liveIntent = useDesk((s) => s.liveIntent);
  const stats = sessionStats(engine);
  const open = engine.positions;
  const recent = engine.trades.slice(0, 8);
  const alerts = engine.alerts.slice(0, 6);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <CapitalPanel />
      <Panel title="Open positions" kicker={`${open.length} locked`} className="lg:col-span-3">
        {open.length === 0 ? (
          <Empty text={engine.status === "running" ? "Waiting for a net-spread print above hurdle." : "Start the loop to arm the ten slots."} />
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((p) => {
              const pair = engine.pairs[p.symbol];
              const mark = p.side === "LONG" ? pair?.lag?.bid : pair?.lag?.ask;
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
                  ? `${remain.toFixed(0)}s`
                  : net > 0
                    ? "flatten green"
                    : "hold, no timeout loss";
              const netInr = net * engine.usdtInr;
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-2 gap-2 rounded-md bg-elevated px-3 py-3 sm:grid-cols-6"
                >
                  <Cell label="Slot" value={`${p.side} ${base(p.symbol)}`} />
                  <Cell label="Fill" value={px(p.entryPx)} />
                  <Cell label="Target / stop" value={`${px(p.targetPx)} · ${px(p.stopPx)}`} />
                  <Cell label="Qty" value={`${p.filledQty}${p.filledQty < p.requestedQty ? " part" : ""}`} />
                  <Cell label="Unreal" value={inr(netInr)} tone={netInr} />
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
                <th className="pb-2 font-medium">{venueShort(engine.cfg.lagVenue)} bid / ask</th>
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
          <Empty text="No fills yet. Alts with jumpy books clear the hurdle more often than BTC." />
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
                    <td className="py-2.5 text-muted">
                      {t.reason}
                      {liveIntent ? " · LIVE-ARM" : " · PAPER"}
                    </td>
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
  const liveIntent = useDesk((s) => s.liveIntent);
  if (!trades.length) {
    return (
      <Panel title="Trade blotter">
        <Empty text="Closed trades appear here with fees, hold time, and exit reason." />
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
                <td className="py-2.5 text-muted">
                  {t.reason}
                  {liveIntent ? " · LIVE-ARM" : " · PAPER"}
                </td>
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
      body: "Persistent WebSockets only for prices. Binance futures bookTicker is the lead. CoinSwitch PRO or CoinDCX futures order-book is the lag, picked on the desk. REST is banned from the trigger path.",
    },
    {
      name: "SignalEngine",
      body: "Compares Binance mid to the lag venue best ask (long) and best bid (short). Fires only when expected catch-up (lead mid minus the lag spread) is still net-green after that venue's fees. Never uses LTP.",
    },
    {
      name: "PortfolioManager",
      body: "Paper wallet seed (default ₹10,000). Only the allocation % is tradable: that slice / 10 slots. One locked slot per coin until fully closed. Lot-size gate rejects coins whose min contract exceeds slot notional × leverage.",
    },
    {
      name: "OrderExecutor",
      body: "Sizes to ≤25% of top-of-book. Tracks partial fills and resizes the exit to filled qty. Token-bucket 15/min. Paper fills against live TOB; live uses CoinSwitch Ed25519 or CoinDCX HMAC futures orders.",
    },
    {
      name: "RiskManager",
      body: "Target = Binance mid at entry, taken only if the close is net-green after fees. Timeout (45s) is profit-only. The vol stop is the only per-trade loss exit. A session max-loss cap flattens everything and halts the loop.",
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
            "CoinSwitch or CoinDCX futures order",
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
          CoinSwitch PRO and CoinDCX perpetual futures are USDT-margined. INR is the capital and
          reporting currency. Pick the lag venue on the desk. USDT/INR is a live FX tape used to
          size slots and publish ₹ PnL — not a hardcoded multiplier.
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
  const liveIntent = useDesk((s) => s.liveIntent);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Desk parameters" kicker={liveIntent ? "live-armed" : "paper"}>
        <ModePanel />
        <div className="mb-4">
          <p className="mb-2 text-xxs uppercase tracking-wider text-muted">Lag exchange</p>
          <VenueToggle />
        </div>
        <div className="grid gap-3">
          <Field
            label="Starting capital / wallet seed (INR)"
            value={cfg.startingCapitalInr}
            onChange={(v) => patch({ startingCapitalInr: v })}
          />
          <Field
            label="% of wallet allocated to trade"
            value={cfg.allocPct}
            onChange={(v) => patch({ allocPct: v })}
            suffix="%"
          />
          <Field
            label="Max session loss (INR)"
            value={cfg.maxSessionLossInr}
            onChange={(v) => patch({ maxSessionLossInr: v })}
          />
          <p className="text-xs text-pretty text-muted">
            If marked session loss reaches this amount, every open slot is flattened and the loop
            stops. 0 disables the kill switch.
          </p>
          <Field label="Slot count" value={cfg.slotCount} onChange={(v) => patch({ slotCount: v })} />
          <Field label="Leverage" value={cfg.leverage} onChange={(v) => patch({ leverage: v })} />
          <Field
            label="Hold timeout (sec)"
            value={cfg.holdTimeoutSec}
            onChange={(v) => patch({ holdTimeoutSec: v })}
          />
          <p className="text-xs text-pretty text-muted">
            Timeout never closes a loser. After 45s it only flattens if net PnL after fees is
            positive. Target is also skipped unless the fill would be green. The vol stop is the only
            path that can still print a loss.
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
          Keys pasted here only arm the Live switch on this preview. They are not stored and not sent
          to CoinSwitch or CoinDCX. For reusable keys, run python main.py — that desk writes .env on
          your machine.
        </p>
        <div className="mt-4">
          <KeysPanel />
        </div>
      </Panel>
      <Panel title="Local & EC2 runbook">
        <ol className="flex list-decimal flex-col gap-3 pl-4 text-sm text-pretty text-muted">
          <li>
            Skip this preview for the engine. Sign into GitHub as rohitrshrivastava-collab, then clone{" "}
            <span className="font-mono text-xs text-fg">{REPO_CLONE}</span> in VS Code (Git: Clone).
          </li>
          <li>Create a venv, pip install -r requirements.txt, copy env.example to .env.</li>
          <li>Run python latency_bench.py from the same region you will trade.</li>
          <li>python main.py with PAPER_TRADING=true for 72 hours. The same visual desk opens on your PC and can go live later.</li>
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
      <Panel title="Get the engine from GitHub" kicker="skip this preview zip">
        <p className="text-sm text-pretty text-muted">
          Quick Heal flags this preview host (grok-sandbox.com) as a suspicious website. That is the
          antivirus, not the bot. Do not download from here. Clone from GitHub instead — github.com
          is a normal, trusted site.
        </p>
        <p className="mt-3 font-mono text-xs break-all text-fg">{REPO_CLONE}</p>
        <ol className="mt-4 flex list-decimal flex-col gap-2 pl-4 text-sm text-pretty text-muted">
          <li>Install Python 3.11+ (Windows: tick Add python.exe to PATH) and VS Code with the Microsoft Python extension. Install Git if VS Code asks.</li>
          <li>Sign into github.com as rohitrshrivastava-collab (the repo is private).</li>
          <li>In VS Code: Ctrl+Shift+P → Git: Clone → paste the URL above → open the folder.</li>
          <li>No Git? On the GitHub page click Code → Download ZIP, unzip, then File → Open Folder in VS Code.</li>
          <li>In the VS Code terminal: python -m venv .venv, activate it, pip install -r requirements.txt.</li>
          <li>Copy env.example to .env. Keep PAPER_TRADING=true. Add Telegram. Leave CoinSwitch keys empty for paper.</li>
          <li>python main.py — the same visual desk opens on your PC (Paper/Live, wallet, keys). Leave the terminal open. Ctrl+C stops it.</li>
          <li>EC2 ap-south-1 and CONFIRM_LIVE=YES only after a 72-hour paper tape that still beats fees.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyCloneButton />
          <a
            href={REPO_PAGE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-elevated px-4 text-sm"
          >
            <ExternalLink className="size-4" />
            Open GitHub
          </a>
          <a
            href={REPO_ZIP}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-md px-4 text-sm text-muted shadow-[var(--shadow-border)]"
          >
            GitHub zip (while signed in)
          </a>
        </div>
        <div className="mt-3">
          <DownloadPackButton />
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {PYTHON_FILES.map((f) => (
            <li key={f.path}>
              <a
                href={`${REPO_PAGE}/blob/main/${f.path}`}
                target="_blank"
                rel="noreferrer"
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
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xxs uppercase tracking-wider text-muted">{label}</span>
      <span className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 w-full rounded-md bg-inset px-3 font-mono text-sm tabular text-fg shadow-[var(--shadow-border)]"
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
            {suffix}
          </span>
        ) : null}
      </span>
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
