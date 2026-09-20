from __future__ import annotations

import logging
from typing import Any

import aiohttp

from config import Config
from models import Position, Trade

log = logging.getLogger("lagforge.tg")


class TelegramReporter:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._session: aiohttp.ClientSession | None = None
        self.hour_trades: list[Trade] = []

    async def open(self) -> None:
        self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8))

    async def close(self) -> None:
        if self._session:
            await self._session.close()

    @property
    def enabled(self) -> bool:
        return bool(self.cfg.telegram_token and self.cfg.telegram_chat_id)

    async def send(self, text: str) -> None:
        log.info("TG %s", text.replace("\n", " | "))
        if not self.enabled or not self._session:
            return
        url = f"https://api.telegram.org/bot{self.cfg.telegram_token}/sendMessage"
        try:
            async with self._session.post(
                url,
                json={
                    "chat_id": self.cfg.telegram_chat_id,
                    "text": text,
                    "disable_web_page_preview": True,
                },
            ) as resp:
                if resp.status >= 400:
                    log.warning("telegram %s %s", resp.status, await resp.text())
        except Exception as exc:
            log.warning("telegram: %s", exc)

    async def entry(self, pos: Position, notional_inr: float, mode: str) -> None:
        partial = " PARTIAL" if pos.qty < pos.requested_qty - 1e-12 else ""
        await self.send(
            "\n".join(
                [
                    f"LAGFORGE ENTRY {pos.side} {pos.symbol}{partial}",
                    f"Fill {pos.entry_px}  qty {pos.qty}  (req {pos.requested_qty})",
                    f"Size ₹{notional_inr:.0f}  ·  {pos.leverage}x",
                    f"Spread {pos.expected_spread * 100:.3f}%  tgt {pos.target_px}  stop {pos.stop_px}",
                    f"Exec {pos.latency_ms:.1f}ms  ·  {mode}",
                ]
            )
        )

    async def exit_trade(self, trade: Trade, mode: str) -> None:
        self.hour_trades.append(trade)
        sign = "+" if trade.net_inr >= 0 else ""
        await self.send(
            "\n".join(
                [
                    f"LAGFORGE EXIT {trade.side} {trade.symbol} {trade.reason}",
                    f"{trade.entry_px} → {trade.exit_px}  qty {trade.qty}",
                    f"Net {sign}₹{trade.net_inr:.2f}  ({sign}{trade.net_usdt:.4f} USDT)",
                    f"Gross {trade.gross_usdt:.4f}  fees {trade.fees_usdt:.4f}",
                    f"Hold {trade.hold_sec:.1f}s  ·  {mode}",
                ]
            )
        )

    async def hourly(
        self,
        hour_index: int,
        equity_inr: float,
        free_inr: float,
        extra: dict[str, Any] | None = None,
    ) -> None:
        trades = self.hour_trades
        self.hour_trades = []
        n = len(trades)
        wins = sum(1 for t in trades if t.net_usdt > 0)
        losses = n - wins
        gross = sum(t.gross_usdt for t in trades)
        fees = sum(t.fees_usdt for t in trades)
        net = sum(t.net_usdt for t in trades)
        net_inr = sum(t.net_inr for t in trades)
        hold = sum(t.hold_sec for t in trades) / n if n else 0.0
        lat = sum(t.latency_ms for t in trades) / n if n else 0.0
        wr = (wins / n * 100) if n else 0.0
        await self.send(
            "\n".join(
                [
                    f"LAGFORGE HOUR {hour_index}",
                    f"Trades {n}  W/L {wins}/{losses}  WR {wr:.0f}%",
                    f"Gross {gross:.4f} USDT  fees {fees:.4f}  net {net:.4f} USDT",
                    f"Net ₹{net_inr:.2f}  equity ₹{equity_inr:.0f}  free ₹{free_inr:.0f}",
                    f"Avg hold {hold:.1f}s  avg exec {lat:.1f}ms",
                    *( [str(extra)] if extra else [] ),
                ]
            )
        )
