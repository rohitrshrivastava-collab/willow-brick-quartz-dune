from __future__ import annotations

import logging
import time
import urllib.parse
import uuid
from typing import Any

import aiohttp
from cryptography.hazmat.primitives.asymmetric import ed25519

from config import Config
from models import Book, Side
from rate_limit import TokenBucket

log = logging.getLogger("lagforge.exec")


class OrderExecutor:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.bucket = TokenBucket(cfg.rest_rate, burst=4)
        self._session: aiohttp.ClientSession | None = None

    async def open(self) -> None:
        self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8))

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None

    def _sign(self, method: str, path: str, params: dict[str, Any] | None = None) -> tuple[dict[str, str], str]:
        method = method.upper()
        if params:
            sep = "&" if "?" in path else "?"
            path = path + sep + urllib.parse.urlencode(params)
        decoded = urllib.parse.unquote_plus(path)
        epoch = str(int(time.time() * 1000))
        message = method + decoded + epoch
        secret = ed25519.Ed25519PrivateKey.from_private_bytes(bytes.fromhex(self.cfg.coinswitch_secret_key))
        signature = secret.sign(message.encode("utf-8")).hex()
        headers = {
            "Content-Type": "application/json",
            "X-AUTH-APIKEY": self.cfg.coinswitch_api_key,
            "X-AUTH-SIGNATURE": signature,
            "X-AUTH-EPOCH": epoch,
        }
        return headers, decoded

    async def place(
        self,
        *,
        symbol: str,
        side: Side,
        qty: float,
        lag: Book,
        reduce_only: bool = False,
    ) -> tuple[float, float, str]:
        """Return (filled_qty, avg_px, order_id)."""
        tob_px = lag.ask if side == "LONG" else lag.bid
        if self.cfg.paper_trading or not self.cfg.live_enabled:
            slip = min(self.cfg.max_slippage_pct, 0.0002)
            fill_px = tob_px * (1 + slip) if side == "LONG" else tob_px * (1 - slip)
            fill_qty = qty
            return fill_qty, fill_px, f"PAPER-{uuid.uuid4().hex[:12]}"

        await self.bucket.acquire()
        assert self._session is not None
        if reduce_only:
            cs_side = "SELL" if side == "LONG" else "BUY"
        else:
            cs_side = "BUY" if side == "LONG" else "SELL"
        body = {
            "exchange": "EXCHANGE_2",
            "symbol": symbol,
            "side": cs_side,
            "order_type": "MARKET",
            "quantity": qty,
            "reduce_only": reduce_only,
            "client_order_id": str(uuid.uuid4()),
        }
        headers, path = self._sign("POST", "/trade/api/v2/futures/order")
        url = self.cfg.coinswitch_base_url + path
        t0 = time.perf_counter()
        async with self._session.post(url, json=body, headers=headers) as resp:
            data = await resp.json(content_type=None)
            if resp.status >= 400:
                raise RuntimeError(f"order rejected {resp.status} {data}")
        payload = data.get("data", data)
        order_id = str(payload.get("order_id") or payload.get("orderId") or "")
        filled = float(payload.get("exec_quantity") or payload.get("qty") or 0)
        avg = float(payload.get("avg_execution_price") or payload.get("price") or tob_px)
        status = str(payload.get("status") or "")
        if status in {"RAISED", "NEW", "PARTIAL", "PARTIALLY_EXECUTED"} and order_id:
            filled, avg = await self._poll_fill(order_id, filled, avg, tob_px)
        if filled <= 0:
            raise RuntimeError(f"zero fill {payload}")
        log.info("live fill %s %s qty=%s px=%s dt=%.1fms", side, symbol, filled, avg, (time.perf_counter() - t0) * 1000)
        return filled, avg, order_id

    async def _poll_fill(self, order_id: str, filled: float, avg: float, fallback_px: float) -> tuple[float, float]:
        assert self._session is not None
        for _ in range(8):
            await self.bucket.acquire()
            headers, path = self._sign(
                "GET",
                "/trade/api/v2/futures/order",
                {"order_id": order_id, "exchange": "EXCHANGE_2"},
            )
            url = self.cfg.coinswitch_base_url + path
            async with self._session.get(url, headers=headers) as resp:
                data = await resp.json(content_type=None)
            payload = data.get("data", data)
            status = str(payload.get("status") or "")
            filled = float(payload.get("exec_quantity") or filled)
            avg = float(payload.get("avg_execution_price") or avg or fallback_px)
            if status in {"EXECUTED", "FILLED", "PARTIALLY_EXECUTED", "CANCELLED", "REJECTED"}:
                return filled, avg if avg else fallback_px
            await asyncio_sleep()
        return filled, avg if avg else fallback_px


async def asyncio_sleep() -> None:
    import asyncio

    await asyncio.sleep(0.15)


def mark_px(side: Side, lag: Book) -> float:
    return lag.bid if side == "LONG" else lag.ask
