"""LAGFORGE — Binance lead / CoinSwitch PRO lag. Paper by default."""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time
import uuid
from logging.handlers import RotatingFileHandler

from config import load_config
from data_ingestion import DataIngestion
from models import Books, Position, Trade
from order_executor import OrderExecutor, mark_px
from persistence import Store
from portfolio import PortfolioManager
from risk_manager import RiskManager
from signal_engine import evaluate
from telegram_reporter import TelegramReporter

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
        self.universe: list[str] = []
        self.hour_index = 0
        self.hour_start = time.time()
        self.mode = "PAPER" if not self.cfg.live_enabled else "LIVE"

    def _kick(self) -> None:
        self._event.set()

    async def recover(self) -> None:
        await self.store.open()
        equity = await self.store.get_kv("equity_inr", self.cfg.starting_capital_inr)
        self.portfolio.equity_inr = float(equity)
        self.portfolio.realized_net_inr = float(await self.store.get_kv("realized_net_inr", 0.0))
        recovered = await self.store.load_positions()
        for pos in recovered:
            self.portfolio.positions[pos.symbol] = pos
            log.warning("recovered %s %s qty=%s", pos.side, pos.symbol, pos.qty)
        if recovered:
            await self.tg.send(f"LAGFORGE recovered {len(recovered)} open slot(s). Resuming exits.")

    async def start(self) -> None:
        setup_logging(self.cfg.log_level)
        log.info(
            "LAGFORGE start mode=%s capital=₹%.0f slots=%s lev=%sx hurdle=%.4f%%",
            self.mode,
            self.cfg.starting_capital_inr,
            self.cfg.slot_count,
            self.cfg.leverage,
            self.cfg.hurdle * 100,
        )
        if self.cfg.paper_trading:
            log.info("PAPER_TRADING=true — no live orders")
        elif not self.cfg.live_enabled:
            log.error("Live requested but CONFIRM_LIVE!=YES or keys missing. Staying paper.")
            self.cfg.paper_trading = True
            self.mode = "PAPER"

        await self.recover()
        await self.exec.open()
        await self.tg.open()
        await self.tg.send(
            f"LAGFORGE armed {self.mode}\n₹{self.cfg.starting_capital_inr:.0f} / {self.cfg.slot_count} slots / {self.cfg.leverage}x"
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
        hour_task = asyncio.create_task(self._hour_loop(stop))
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

    async def _open(self, side, symbol, qty, divergence, target, lag, now) -> None:  # type: ignore[no-untyped-def]
        t0 = time.perf_counter()
        try:
            filled, px, order_id = await self.exec.place(symbol=symbol, side=side, qty=qty, lag=lag)
        except Exception as exc:
            log.exception("entry failed %s %s: %s", side, symbol, exc)
            return
        if filled <= 0:
            return
        tgt, stop, timeout = self.risk.levels(symbol, side, px, target)
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


def main() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(Engine().start())


if __name__ == "__main__":
    main()
