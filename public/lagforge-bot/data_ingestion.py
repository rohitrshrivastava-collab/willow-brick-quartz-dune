"""WebSocket-first market data. REST is not used on the trigger path."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable

import aiohttp
import socketio
import websockets

from config import Config
from models import Book, Books
from venues import dcx_pair

log = logging.getLogger("lagforge.ingest")

BINANCE_FUTURES_WS = "wss://fstream.binance.com/stream"
BINANCE_SPOT_WS = "wss://data-stream.binance.vision/stream"
BINANCE_VISION_BOOK = "https://data-api.binance.vision/api/v3/ticker/24hr"
FX_URL = "https://open.er-api.com/v6/latest/USD"

CS_WS = "wss://ws.coinswitch.co"
CS_PATH = "/pro/realtime-rates-socket/futures/exchange_2"
CS_NS = "/exchange_2"

DCX_WS = "wss://stream.coindcx.com"


def _book(symbol: str, bid: float, ask: float, bq: float, aq: float, ts: int) -> Book | None:
    if bid <= 0 or ask <= 0 or ask < bid:
        return None
    return Book(symbol=symbol.upper(), bid=bid, ask=ask, bid_qty=bq, ask_qty=aq, ts_ms=ts)


class DataIngestion:
    def __init__(self, cfg: Config, books: Books, on_lead: Callable[[], None] | None = None) -> None:
        self.cfg = cfg
        self.books = books
        self.on_lead = on_lead
        self._stop = asyncio.Event()
        self._delay: list[tuple[int, dict[str, Book]]] = []

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        tasks = [
            asyncio.create_task(self._binance_loop(), name="binance-ws"),
            asyncio.create_task(
                self._coindcx_loop() if self.cfg.lag_venue == "COINDCX" else self._coinswitch_loop(),
                name="lag-ws",
            ),
            asyncio.create_task(self._fx_loop(), name="fx"),
            asyncio.create_task(self._vol_loop(), name="vol"),
        ]
        if self.cfg.paper_trading and self.cfg.allow_synthetic_lag:
            tasks.append(asyncio.create_task(self._synthetic_lag(), name="synth-lag"))
        try:
            await asyncio.gather(*tasks)
        finally:
            for t in tasks:
                t.cancel()

    async def _fx_loop(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(FX_URL, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                        data = await resp.json()
                        rate = float(data.get("rates", {}).get("INR") or 0)
                        if rate > 0:
                            self.books.usdt_inr = rate
                            self.books.fx_ts_ms = int(time.time() * 1000)
                            log.info("USDT/INR %.4f", rate)
                            backoff = 1.0
            except Exception as exc:
                log.warning("fx feed: %s", exc)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=min(60.0 * backoff, 300))
            except asyncio.TimeoutError:
                backoff = min(backoff * 1.5, 5)

    async def _vol_loop(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                url = BINANCE_VISION_BOOK
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        data = await resp.json()
                        if isinstance(data, list):
                            for row in data:
                                sym = str(row.get("symbol", ""))
                                if sym in self.cfg.candidates:
                                    self.books.quote_vol[sym] = float(row.get("quoteVolume") or 0)
                            backoff = 1.0
            except Exception as exc:
                log.warning("24h volume: %s", exc)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=min(30.0 * backoff, 120))
            except asyncio.TimeoutError:
                backoff = min(backoff * 1.4, 4)

    async def _binance_loop(self) -> None:
        streams = "/".join(f"{s.lower()}@bookTicker" for s in self.cfg.candidates)
        urls = [
            f"{BINANCE_FUTURES_WS}?streams={streams}",
            f"{BINANCE_SPOT_WS}?streams={streams}",
        ]
        backoff = 1.0
        while not self._stop.is_set():
            connected = False
            for url in urls:
                try:
                    await self._binance_once(url)
                    connected = True
                    backoff = 1.0
                    break
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    log.warning("binance %s: %s", url.split("/")[2], exc)
            if not connected:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    async def _binance_once(self, url: str) -> None:
        log.info("binance connecting %s", url)
        async with websockets.connect(url, ping_interval=15, ping_timeout=10, close_timeout=5) as ws:
            log.info("binance socket up")
            while not self._stop.is_set():
                raw = await asyncio.wait_for(ws.recv(), timeout=20)
                msg = json.loads(raw)
                data = msg.get("data", msg)
                symbol = str(data.get("s") or "")
                bid = float(data.get("b") or 0)
                ask = float(data.get("a") or 0)
                bq = float(data.get("B") or 0)
                aq = float(data.get("A") or 0)
                ts = int(data.get("E") or time.time() * 1000)
                book = _book(symbol, bid, ask, bq, aq, ts)
                if book is None:
                    continue
                self.books.lead[book.symbol] = book
                if self.on_lead:
                    self.on_lead()

    async def _coinswitch_loop(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            sio = socketio.AsyncClient(logger=False, engineio_logger=False)
            try:

                @sio.on("FETCH_ORDER_BOOK_CS_PRO", namespace=CS_NS)
                async def on_book(payload):  # type: ignore[no-untyped-def]
                    body = payload.get("data", payload) if isinstance(payload, dict) else {}
                    symbol = str(body.get("symbol") or "").upper()
                    bids = body.get("bids") or []
                    asks = body.get("asks") or []
                    if not symbol or not bids or not asks:
                        return
                    bid = float(bids[0][0])
                    bq = float(bids[0][1])
                    ask = float(asks[0][0])
                    aq = float(asks[0][1])
                    ts = int(body.get("timestamp") or time.time() * 1000)
                    book = _book(symbol, bid, ask, bq, aq, ts)
                    if book:
                        self.books.lag[book.symbol] = book

                await sio.connect(
                    CS_WS,
                    namespaces=[CS_NS],
                    transports=["websocket"],
                    socketio_path=CS_PATH,
                    wait_timeout=20,
                )
                log.info("coinswitch socket up")
                backoff = 1.0
                for symbol in self.cfg.candidates:
                    await sio.emit(
                        "FETCH_ORDER_BOOK_CS_PRO",
                        {"event": "subscribe", "pair": symbol},
                        namespace=CS_NS,
                    )
                while not self._stop.is_set():
                    await asyncio.sleep(1)
                    if not sio.connected:
                        raise ConnectionError("coinswitch disconnected")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("coinswitch ws: %s", exc)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
            finally:
                try:
                    await sio.disconnect()
                except Exception:
                    pass

    async def _synthetic_lag(self) -> None:
        """Paper-only fallback: replay Binance books after SYNTHETIC_LAG_MS."""
        log.warning("synthetic lag enabled — not a real lag-venue book")
        while not self._stop.is_set():
            now = int(time.time() * 1000)
            snapshot = {s: b for s, b in self.books.lead.items()}
            if snapshot:
                self._delay.append((now, snapshot))
            cut = now - self.cfg.synthetic_lag_ms
            released = None
            while self._delay and self._delay[0][0] <= cut:
                _, released = self._delay.pop(0)
            if released:
                for symbol, book in released.items():
                    self.books.lag[symbol] = book
            await asyncio.sleep(0.05)

    async def _coindcx_loop(self) -> None:
        backoff = 1.0
        channels = [f"{dcx_pair(s)}@orderbook@50-futures" for s in self.cfg.candidates]
        while not self._stop.is_set():
            try:
                log.info("coindcx connecting %s", DCX_WS)
                async with websockets.connect(
                    DCX_WS, ping_interval=15, ping_timeout=10, close_timeout=5
                ) as ws:
                    for ch in channels:
                        await ws.send(json.dumps({"channelName": ch}))
                    log.info("coindcx socket up (%s pairs)", len(channels))
                    backoff = 1.0
                    while not self._stop.is_set():
                        raw = await asyncio.wait_for(ws.recv(), timeout=20)
                        self._on_dcx_msg(raw)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("coindcx ws: %s", exc)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    def _on_dcx_msg(self, raw: str | bytes) -> None:
        try:
            msg = json.loads(raw)
        except Exception:
            return
        body = msg.get("data", msg) if isinstance(msg, dict) else {}
        if not isinstance(body, dict):
            return
        channel = str(body.get("channel") or body.get("channelName") or msg.get("channel") or "")
        pair = str(body.get("pair") or body.get("instrument") or "")
        if not pair and "@" in channel:
            pair = channel.split("@", 1)[0]
        if not pair:
            return
        symbol = pair.upper().removeprefix("B-").replace("_", "")
        if not symbol.endswith("USDT"):
            symbol = symbol + "USDT"
        bids = body.get("bids") or body.get("b") or []
        asks = body.get("asks") or body.get("a") or []
        if not bids or not asks:
            return
        def _lvl(row: object) -> tuple[float, float]:
            if isinstance(row, dict):
                return float(row.get("price") or row.get("p") or 0), float(row.get("quantity") or row.get("q") or 0)
            return float(row[0]), float(row[1])  # type: ignore[index]
        try:
            bid, bq = _lvl(bids[0])
            ask, aq = _lvl(asks[0])
        except Exception:
            return
        ts = int(body.get("ts") or body.get("timestamp") or time.time() * 1000)
        book = _book(symbol, bid, ask, bq, aq, ts)
        if book:
            self.books.lag[book.symbol] = book

