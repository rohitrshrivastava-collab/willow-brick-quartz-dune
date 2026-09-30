"""LAGFORGE — Binance lead / CoinSwitch or CoinDCX lag. Paper by default."""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time
import uuid
from logging.handlers import RotatingFileHandler
from pathlib import Path

from config import load_config
from data_ingestion import DataIngestion
from envfile import upsert_env
from models import Books, Position, Trade
from order_executor import OrderExecutor, mark_px
from persistence import Store
from portfolio import PortfolioManager
from risk_manager import RiskManager, net_usdt
from signal_engine import evaluate
from telegram_reporter import TelegramReporter
from venues import normalize_venue
from venues import profile as venue_profile
from wallet import fetch_wallet_inr
from web_desk import run_web_desk

log = logging.getLogger("lagforge")


def setup_logging(level: str) -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    root.addHandler(sh)
    fh = RotatingFileHandler("lagforge.log", maxBytes=5_000_000, backupCount=3)
    fh.setFormatter(fmt)
    root.addHandler(fh)


class Engine:
    def __init__(self) -> None:
        self.cfg = load_config()
        self.books = Books()
        self.portfolio = PortfolioManager(self.cfg)
        self.risk = RiskManager(self.cfg)
        self.exec = OrderExecutor(self.cfg)
        self.tg = TelegramReporter(self.cfg)
        self.store = Store(self.cfg.sqlite_path)
        self.ingest = DataIngestion(self.cfg, self.books, on_lead=self._kick)
        self._event = asyncio.Event()
        self._busy = asyncio.Lock()
        self._ingest_task: asyncio.Task[None] | None = None
        self.universe: list[str] = []
        self.hour_index = 0
        self.hour_start = time.time()
        self.session_start = time.time()
        self.mode = "PAPER" if not self.cfg.live_enabled else "LIVE"
        self.halted = False
        self.loop_on = True
        self.wallet_inr = self.cfg.starting_capital_inr
        self.alerts: list[dict] = []
        self.trades: list[dict] = []
        self.reports: list[dict] = []
        self.desk_notice: str | None = None

    def _kick(self) -> None:
        self._event.set()

    async def recover(self) -> None:
        await self.store.open()
        equity = await self.store.get_kv("equity_inr", self.cfg.allocated_seed())
        self.portfolio.equity_inr = float(equity)
        self.portfolio.realized_net_inr = float(await self.store.get_kv("realized_net_inr", 0.0))
        recovered = await self.store.load_positions()
        for pos in recovered:
            self.portfolio.positions[pos.symbol] = pos
            log.warning("recovered %s %s qty=%s", pos.side, pos.symbol, pos.qty)
        self.trades = await self.store.load_trades(120)
        if recovered:
            await self.tg.send(f"LAGFORGE recovered {len(recovered)} open slot(s). Resuming exits.")
            self._alert("WARN", "Recovered open slots", f"{len(recovered)} position(s) restored from SQLite.")

    async def start(self) -> None:
        setup_logging(self.cfg.log_level)
        log.info(
            "LAGFORGE start mode=%s venue=%s capital=₹%.0f alloc=%.0f%% maxloss=₹%.0f slots=%s lev=%sx hurdle=%.4f%%",
            self.mode,
            self.cfg.lag_venue,
            self.cfg.starting_capital_inr,
            self.cfg.alloc_pct,
            self.cfg.max_session_loss_inr,
            self.cfg.slot_count,
            self.cfg.leverage,
            self.cfg.hurdle * 100,
        )
        if self.cfg.paper_trading:
            log.info("PAPER_TRADING=true — no live orders")
        elif not self.cfg.live_enabled:
            log.error("Live requested but CONFIRM_LIVE!=YES or keys missing for %s. Staying paper.", self.cfg.lag_venue)
            self.cfg.paper_trading = True
            self.mode = "PAPER"

        await self.recover()
        await self.exec.open()
        await self.tg.open()
        await self.tg.send(
            f"LAGFORGE armed {self.mode} {self.cfg.lag_venue}\n"
            f"wallet ₹{self.cfg.starting_capital_inr:.0f} · {self.cfg.alloc_pct:.0f}% in play · "
            f"{self.cfg.slot_count} slots / {self.cfg.leverage}x · max loss ₹{self.cfg.max_session_loss_inr:.0f}"
        )

        stop = asyncio.Event()

        def _stop(*_args: object) -> None:
            stop.set()
            self.ingest.stop()
            self._event.set()

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _stop)
            except NotImplementedError:
                signal.signal(sig, lambda *_: _stop())

        ingest_task = asyncio.create_task(self.ingest.run())
        self._ingest_task = ingest_task
        hour_task = asyncio.create_task(self._hour_loop(stop))
        wallet_task = asyncio.create_task(self._wallet_loop(stop))
        desk_task = asyncio.create_task(run_web_desk(self, stop))
        try:
            while not stop.is_set():
                try:
                    await asyncio.wait_for(self._event.wait(), timeout=0.25)
                except asyncio.TimeoutError:
                    pass
                self._event.clear()
                await self.tick()
        finally:
            self.ingest.stop()
            hour_task.cancel()
            wallet_task.cancel()
            desk_task.cancel()
            ingest_task.cancel()
            await self.exec.close()
            await self.tg.close()
            await self.store.close()
            log.info("LAGFORGE stopped")

    async def _hour_loop(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            await asyncio.sleep(1)
            if time.time() - self.hour_start >= 3600:
                self.hour_index += 1
                await self.tg.hourly(
                    self.hour_index,
                    self.portfolio.equity_inr,
                    self.portfolio.free_inr(),
                )
                self.hour_start = time.time()

    async def _wallet_loop(self, stop: asyncio.Event) -> None:
        await asyncio.sleep(2)
        while not stop.is_set():
            try:
                session = self.exec._session
                if session is not None:
                    bal = await fetch_wallet_inr(self.cfg, session, self.books.usdt_inr)
                    if bal is not None and bal > 0:
                        self.wallet_inr = bal
                        if self.cfg.live_enabled:
                            self.cfg.starting_capital_inr = bal
                            self.portfolio.equity_inr = self.cfg.allocated_seed() + self.portfolio.realized_net_inr
                        log.info("%s wallet ₹%.2f (alloc ₹%.2f)", self.cfg.lag_venue, bal, self.cfg.allocated_seed())
            except Exception as exc:
                log.warning("wallet loop: %s", exc)
            try:
                await asyncio.wait_for(stop.wait(), timeout=30)
            except asyncio.TimeoutError:
                pass

    def _unrealized_inr(self) -> float:
        total = 0.0
        usdt_inr = self.books.usdt_inr
        for pos in self.portfolio.positions.values():
            lag = self.books.lag.get(pos.symbol)
            if lag is None:
                continue
            mark = mark_px(pos.side, lag)
            total += net_usdt(
                pos.side,
                pos.entry_px,
                mark,
                pos.qty,
                self.cfg.entry_taker_fee,
                self.cfg.exit_taker_fee,
            ) * usdt_inr
        return total

    async def tick(self) -> None:
        async with self._busy:
            now = int(time.time() * 1000)
            usdt_inr = self.books.usdt_inr
            self.universe = self.portfolio.screen(self.books.quote_vol, self.books.lead, usdt_inr) or self.universe

            for symbol, lead in list(self.books.lead.items()):
                self.risk.observe_lead(symbol, lead.mid, lead.ts_ms)

            for pos in list(self.portfolio.positions.values()):
                lag = self.books.lag.get(pos.symbol)
                if lag is None:
                    continue
                prev_stop = pos.stop_px
                prev_armed = pos.armed_breakeven
                reason = self.risk.should_exit(pos, lag, now)
                if pos.stop_px != prev_stop or pos.armed_breakeven != prev_armed:
                    await self.store.upsert_position(pos)
                if reason:
                    await self._close(pos, lag, reason, now)

            if self.halted:
                return

            if self.risk.session_should_halt(self.portfolio.realized_net_inr, self._unrealized_inr()):
                await self._halt_max_loss(now)
                return

            if not self.loop_on:
                return

            if len(self.portfolio.positions) >= self.cfg.slot_count:
                return

            for symbol in self.universe:
                if self.portfolio.locked(symbol):
                    continue
                lead = self.books.lead.get(symbol)
                lag = self.books.lag.get(symbol)
                if lead is None or lag is None:
                    continue
                sig = evaluate(self.cfg, lead, lag)
                if sig is None:
                    continue
                qty, why = self.portfolio.size(sig, lag, usdt_inr)
                if qty <= 0:
                    log.debug("skip %s %s", symbol, why)
                    continue
                await self._open(sig.side, symbol, qty, sig.divergence, sig.lead_mid, lag, now)

    async def _halt_max_loss(self, now: int) -> None:
        self.halted = True
        log.error(
            "MAX SESSION LOSS hit realized=₹%.2f cap=₹%.2f — flattening and stopping entries",
            self.portfolio.realized_net_inr,
            self.cfg.max_session_loss_inr,
        )
        for pos in list(self.portfolio.positions.values()):
            lag = self.books.lag.get(pos.symbol)
            if lag is None:
                continue
            await self._close(pos, lag, "KILL", now)
        await self.tg.send(
            f"LAGFORGE HALTED max session loss\n"
            f"realized ₹{self.portfolio.realized_net_inr:.2f} · cap ₹{self.cfg.max_session_loss_inr:.0f} · {self.cfg.lag_venue}"
        )
        self.loop_on = False
        self._alert(
            "WARN",
            "Session max loss hit — loop stopped",
            f"Realized ₹{self.portfolio.realized_net_inr:.2f} · cap ₹{self.cfg.max_session_loss_inr:.0f}",
        )

    async def _open(self, side, symbol, qty, divergence, target, lag, now) -> None:  # type: ignore[no-untyped-def]
        t0 = time.perf_counter()
        try:
            filled, px, order_id = await self.exec.place(symbol=symbol, side=side, qty=qty, lag=lag)
        except Exception as exc:
            log.exception("entry failed %s %s: %s", side, symbol, exc)
            return
        if filled <= 0:
            return
        tgt, stop, timeout = self.risk.levels(symbol, side, px, target, lag)
        pos = Position(
            id=uuid.uuid4().hex,
            symbol=symbol,
            side=side,
            qty=filled,
            requested_qty=qty,
            entry_px=px,
            entry_ts_ms=now,
            target_px=tgt,
            stop_px=stop,
            timeout_ts_ms=timeout,
            expected_spread=divergence,
            leverage=self.cfg.leverage,
            order_id=order_id,
            latency_ms=(time.perf_counter() - t0) * 1000,
            paper=not self.cfg.live_enabled,
        )
        self.portfolio.on_fill(pos)
        await self.store.upsert_position(pos)
        await self.store.put_kv("equity_inr", self.portfolio.equity_inr)
        notional_inr = filled * px * self.books.usdt_inr
        await self.tg.entry(pos, notional_inr, self.mode)
        self._alert(
            "ENTRY",
            f"{side} {symbol.replace('USDT', '')}",
            f"Fill {px} · {filled} · ₹{notional_inr:.0f} · {self.mode}",
        )

    async def _close(self, pos: Position, lag, reason: str, now: int) -> None:  # type: ignore[no-untyped-def]
        try:
            filled, px, _oid = await self.exec.place(
                symbol=pos.symbol,
                side=pos.side,
                qty=pos.qty,
                lag=lag,
                reduce_only=True,
            )
        except Exception as exc:
            log.exception("exit failed %s: %s", pos.symbol, exc)
            px = mark_px(pos.side, lag)
            filled = pos.qty
        qty = filled if filled > 0 else pos.qty
        if pos.side == "LONG":
            gross = (px - pos.entry_px) * qty
        else:
            gross = (pos.entry_px - px) * qty
        fees = pos.entry_px * qty * self.cfg.entry_taker_fee + px * qty * self.cfg.exit_taker_fee
        net = gross - fees
        usdt_inr = self.books.usdt_inr
        trade = Trade(
            id=uuid.uuid4().hex,
            symbol=pos.symbol,
            side=pos.side,
            qty=qty,
            entry_px=pos.entry_px,
            exit_px=px,
            entry_ts_ms=pos.entry_ts_ms,
            exit_ts_ms=now,
            hold_sec=(now - pos.entry_ts_ms) / 1000.0,
            gross_usdt=gross,
            fees_usdt=fees,
            net_usdt=net,
            net_inr=net * usdt_inr,
            reason=reason,  # type: ignore[arg-type]
            latency_ms=pos.latency_ms,
            paper=pos.paper,
        )
        self.portfolio.on_close(pos.symbol, gross, fees, usdt_inr)
        await self.store.delete_position(pos.id)
        await self.store.insert_trade(trade.__dict__)
        await self.store.put_kv("equity_inr", self.portfolio.equity_inr)
        await self.store.put_kv("realized_net_inr", self.portfolio.realized_net_inr)
        await self.tg.exit_trade(trade, self.mode)
        self.trades = [trade.__dict__, *self.trades][:120]
        self._alert(
            "EXIT",
            f"{pos.side} {pos.symbol.replace('USDT', '')} {reason}",
            f"Net ₹{trade.net_inr:.2f} · hold {trade.hold_sec:.1f}s · {self.mode}",
        )

    def _alert(self, kind: str, title: str, body: str) -> None:
        self.alerts = [
            {"id": uuid.uuid4().hex, "ts": int(time.time() * 1000), "kind": kind, "title": title, "body": body},
            *self.alerts,
        ][:80]

    def snapshot(self) -> dict:
        cfg = self.cfg
        unreal = self._unrealized_inr()
        session_pnl = self.portfolio.realized_net_inr + unreal
        loss_used = max(0.0, -session_pnl)
        wallet = self.wallet_inr if self.cfg.live_enabled else (cfg.starting_capital_inr + self.portfolio.realized_net_inr + unreal)
        allocated = cfg.allocated_seed()
        usdt_inr = self.books.usdt_inr
        positions = []
        for pos in self.portfolio.positions.values():
            lag = self.books.lag.get(pos.symbol)
            mark = mark_px(pos.side, lag) if lag else pos.entry_px
            net = 0.0
            if lag:
                net = net_usdt(pos.side, pos.entry_px, mark, pos.qty, cfg.entry_taker_fee, cfg.exit_taker_fee) * usdt_inr
            remain = max(0.0, (pos.timeout_ts_ms - time.time() * 1000) / 1000.0)
            positions.append(
                {
                    "id": pos.id,
                    "symbol": pos.symbol,
                    "side": pos.side,
                    "qty": pos.qty,
                    "entryPx": pos.entry_px,
                    "targetPx": pos.target_px,
                    "stopPx": pos.stop_px,
                    "unrealInr": net,
                    "timeoutRemain": remain,
                    "paper": pos.paper,
                    "latencyMs": pos.latency_ms,
                }
            )
        pairs = []
        watch = list(dict.fromkeys([*(self.universe or cfg.candidates[:10]), *[p.symbol for p in self.portfolio.positions.values()]]))
        hurdle = cfg.hurdle
        for symbol in watch:
            lead = self.books.lead.get(symbol)
            lag = self.books.lag.get(symbol)
            long_div = short_div = 0.0
            skip = None
            if lead and lag and lag.ask > 0 and lag.bid > 0:
                long_div = (lead.mid - lag.ask) / lag.ask
                short_div = (lag.bid - lead.mid) / lag.bid
            elif not lag:
                skip = "awaiting lag book"
            locked = symbol in self.portfolio.positions
            pairs.append(
                {
                    "symbol": symbol,
                    "leadMid": lead.mid if lead else 0,
                    "lagBid": lag.bid if lag else 0,
                    "lagAsk": lag.ask if lag else 0,
                    "longDiv": long_div,
                    "shortDiv": short_div,
                    "hurdle": hurdle,
                    "skip": "slot locked" if locked else skip,
                }
            )
        n = len(self.trades)
        wins = sum(1 for t in self.trades if float(t.get("net_usdt") or 0) > 0)
        return {
            "ok": True,
            "host": "python-engine",
            "ts": int(time.time() * 1000),
            "mode": self.mode,
            "loopOn": self.loop_on and not self.halted,
            "halted": self.halted,
            "venue": cfg.lag_venue,
            "venueLabel": venue_profile(cfg.lag_venue).label,
            "keysPresent": cfg.venue_keys_ok,
            "confirmLive": cfg.confirm_live.strip().upper() == "YES",
            "liveEnabled": cfg.live_enabled,
            "notice": self.desk_notice,
            "walletInr": wallet,
            "allocatedInr": allocated,
            "equityInr": self.portfolio.equity_inr,
            "realizedNetInr": self.portfolio.realized_net_inr,
            "sessionPnl": session_pnl,
            "unrealized": unreal,
            "lossUsed": loss_used,
            "lossRemaining": max(0.0, cfg.max_session_loss_inr - loss_used) if cfg.max_session_loss_inr > 0 else 0,
            "usdtInr": usdt_inr,
            "hurdle": hurdle,
            "openSlots": len(positions),
            "slotCount": cfg.slot_count,
            "cfg": {
                "startingCapitalInr": cfg.starting_capital_inr,
                "allocPct": cfg.alloc_pct,
                "maxSessionLossInr": cfg.max_session_loss_inr,
                "slotCount": cfg.slot_count,
                "leverage": cfg.leverage,
                "holdTimeoutSec": cfg.hold_timeout_sec,
                "lagVenue": cfg.lag_venue,
                "paperTrading": cfg.paper_trading,
            },
            "positions": positions,
            "pairs": pairs,
            "trades": self.trades[:80],
            "alerts": self.alerts[:40],
            "reports": self.reports[:24],
            "stats": {
                "trades": n,
                "wins": wins,
                "winRate": (wins / n * 100) if n else 0,
                "hours": (time.time() - self.session_start) / 3600.0,
            },
        }

    async def apply_control(self, body: dict) -> dict:
        action = str(body.get("action") or "")
        if action == "start":
            if self.halted:
                cap = self.cfg.max_session_loss_inr
                used = max(0.0, -(self.portfolio.realized_net_inr + self._unrealized_inr()))
                if cap > 0 and used >= cap:
                    return {"ok": False, "error": "Max loss still hit. Raise the cap or reset."}
                self.halted = False
            self.loop_on = True
            self.desk_notice = None
            return {"ok": True, "state": self.snapshot()}
        if action == "pause":
            self.loop_on = False
            return {"ok": True, "state": self.snapshot()}
        if action == "reset":
            if self.cfg.live_enabled and self.portfolio.positions:
                return {"ok": False, "error": "Live reset refused while slots are open. Flatten first."}
            self.portfolio.positions.clear()
            self.portfolio.realized_net_inr = 0.0
            self.portfolio.realized_gross_usdt = 0.0
            self.portfolio.realized_fees_usdt = 0.0
            self.portfolio.equity_inr = self.cfg.allocated_seed()
            self.trades = []
            self.alerts = []
            self.reports = []
            self.halted = False
            self.loop_on = False
            self.session_start = time.time()
            self._alert("INFO", "Session reset", "Paper tape cleared. Start the loop to arm slots.")
            return {"ok": True, "state": self.snapshot()}
        if action == "patch":
            self._patch_cfg(body)
            return {"ok": True, "state": self.snapshot()}
        if action == "set_venue":
            await self._set_venue(str(body.get("venue") or self.cfg.lag_venue))
            return {"ok": True, "state": self.snapshot()}
        if action == "save_keys":
            return await self._save_keys(body)
        if action == "set_mode":
            typed = str(body.get("confirm") or "").strip().upper()
            if typed == "YES":
                self.cfg.confirm_live = "YES"
                upsert_env(Path(self.cfg.env_path), {"CONFIRM_LIVE": "YES"})
            elif body.get("live") and typed:
                return {"ok": False, "error": "Type YES exactly to arm live."}
            return await self._set_mode(bool(body.get("live")))
        return {"ok": False, "error": f"unknown action {action}"}

    def _patch_cfg(self, body: dict) -> None:
        if "startingCapitalInr" in body:
            self.cfg.starting_capital_inr = max(0.0, float(body["startingCapitalInr"]))
        if "allocPct" in body:
            self.cfg.alloc_pct = min(100.0, max(1.0, float(body["allocPct"])))
        if "maxSessionLossInr" in body:
            self.cfg.max_session_loss_inr = max(0.0, float(body["maxSessionLossInr"]))
        if "slotCount" in body:
            self.cfg.slot_count = max(1, int(body["slotCount"]))
        if "leverage" in body:
            self.cfg.leverage = max(1, int(body["leverage"]))
        self.portfolio.equity_inr = self.cfg.allocated_seed() + self.portfolio.realized_net_inr
        upsert_env(
            Path(self.cfg.env_path),
            {
                "STARTING_CAPITAL_INR": str(int(self.cfg.starting_capital_inr)),
                "ALLOC_PCT": str(self.cfg.alloc_pct),
                "MAX_SESSION_LOSS_INR": str(self.cfg.max_session_loss_inr),
                "SLOT_COUNT": str(self.cfg.slot_count),
                "LEVERAGE": str(self.cfg.leverage),
            },
        )

    async def _set_venue(self, raw: str) -> None:
        venue = normalize_venue(raw)
        if venue == self.cfg.lag_venue:
            return
        vp = venue_profile(venue)
        self.cfg.lag_venue = venue
        self.cfg.entry_taker_fee = vp.entry_taker_fee
        self.cfg.exit_taker_fee = vp.exit_taker_fee
        upsert_env(Path(self.cfg.env_path), {"LAG_VENUE": venue})
        self.ingest.stop()
        if self._ingest_task:
            self._ingest_task.cancel()
        self.ingest = DataIngestion(self.cfg, self.books, on_lead=self._kick)
        self._ingest_task = asyncio.create_task(self.ingest.run())
        self._alert("INFO", f"Lag venue {vp.label}", "Fees and order path switched. Keys must match this venue for live.")

    async def _save_keys(self, body: dict) -> dict:
        venue = normalize_venue(str(body.get("venue") or self.cfg.lag_venue))
        api = str(body.get("apiKey") or "").strip()
        secret = str(body.get("secretKey") or "").strip()
        if not api or not secret:
            return {"ok": False, "error": "Both API key and secret are required."}
        values: dict[str, str] = {"LAG_VENUE": venue}
        if venue == "COINDCX":
            self.cfg.coindcx_api_key = api
            self.cfg.coindcx_secret_key = secret
            values["COINDCX_API_KEY"] = api
            values["COINDCX_SECRET_KEY"] = secret
        else:
            self.cfg.coinswitch_api_key = api
            self.cfg.coinswitch_secret_key = secret
            values["COINSWITCH_API_KEY"] = api
            values["COINSWITCH_SECRET_KEY"] = secret
        if venue != self.cfg.lag_venue:
            await self._set_venue(venue)
        upsert_env(Path(self.cfg.env_path), values)
        self._alert("INFO", "Keys saved to .env", f"{venue} credentials stored on this machine only.")
        return {"ok": True, "state": self.snapshot()}

    async def _set_mode(self, live: bool) -> dict:
        if not live:
            self.cfg.paper_trading = True
            self.mode = "PAPER"
            upsert_env(Path(self.cfg.env_path), {"PAPER_TRADING": "true"})
            self._alert("INFO", "Paper mode", "No live orders. Fills stay simulated.")
            return {"ok": True, "state": self.snapshot()}
        confirm = self.cfg.confirm_live.strip().upper() == "YES"
        if not self.cfg.venue_keys_ok:
            self.desk_notice = f"Save {self.cfg.lag_venue} API + secret on this desk first."
            return {"ok": False, "error": self.desk_notice, "state": self.snapshot()}
        if not confirm:
            self.desk_notice = "Type YES in Confirm live, then save. This writes CONFIRM_LIVE=YES to .env."
            return {"ok": False, "error": self.desk_notice, "state": self.snapshot()}
        self.cfg.paper_trading = False
        self.mode = "LIVE"
        upsert_env(
            Path(self.cfg.env_path),
            {"PAPER_TRADING": "false", "CONFIRM_LIVE": "YES", "LAG_VENUE": self.cfg.lag_venue},
        )
        self._alert("WARN", "LIVE armed", f"{self.cfg.lag_venue} market orders will go to the exchange.")
        await self.tg.send(f"LAGFORGE LIVE armed on {self.cfg.lag_venue}")
        return {"ok": True, "state": self.snapshot()}


def main() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(Engine().start())


if __name__ == "__main__":
    main()
