from __future__ import annotations

from config import MIN_QTY, Config
from models import Book, Position
from signal_engine import Signal


def round_qty(qty: float, step: float) -> float:
    if step <= 0:
        return qty
    n = int(qty / step + 1e-12)
    q = n * step
    decimals = 0 if step >= 1 else min(8, len(str(step).split(".")[-1]))
    return round(q, decimals)


def min_qty(symbol: str, overrides: dict[str, float] | None = None) -> float:
    if overrides and symbol in overrides:
        return overrides[symbol]
    return MIN_QTY.get(symbol, 0.01)


class PortfolioManager:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.equity_inr = cfg.allocated_seed()
        self.realized_net_inr = 0.0
        self.realized_gross_usdt = 0.0
        self.realized_fees_usdt = 0.0
        self.positions: dict[str, Position] = {}
        self.lot_overrides: dict[str, float] = {}

    def slot_inr(self) -> float:
        return self.equity_inr / max(1, self.cfg.slot_count)

    def slot_usdt(self, usdt_inr: float) -> float:
        return self.slot_inr() / max(usdt_inr, 1e-9)

    def locked(self, symbol: str) -> bool:
        return symbol in self.positions

    def free_inr(self) -> float:
        used = sum(p.entry_px * p.qty / p.leverage * self._usdt_inr_hint for p in self.positions.values())
        return max(0.0, self.equity_inr - used)

    _usdt_inr_hint: float = 96.0

    def size(
        self,
        signal: Signal,
        lag: Book,
        usdt_inr: float,
    ) -> tuple[float, str | None]:
        self._usdt_inr_hint = usdt_inr
        lot = min_qty(signal.symbol, self.lot_overrides)
        max_notional = self.slot_usdt(usdt_inr) * self.cfg.leverage
        if lot * signal.lag_px > max_notional * 0.95:
            return 0.0, "min lot exceeds slot notional"
        qty = max_notional / signal.lag_px
        cap = signal.lag_qty * self.cfg.max_tob_pct
        if qty > cap:
            qty = cap
        qty = round_qty(qty, lot)
        if qty < lot:
            return 0.0, "rounded below lot"
        return qty, None

    def on_fill(self, pos: Position) -> None:
        self.positions[pos.symbol] = pos

    def on_close(self, symbol: str, gross_usdt: float, fees_usdt: float, usdt_inr: float) -> None:
        self.positions.pop(symbol, None)
        net = gross_usdt - fees_usdt
        self.realized_gross_usdt += gross_usdt
        self.realized_fees_usdt += fees_usdt
        self.realized_net_inr += net * usdt_inr
        self.equity_inr = self.cfg.allocated_seed() + self.realized_net_inr
        self._usdt_inr_hint = usdt_inr

    def screen(self, quote_vol: dict[str, float], books: dict[str, Book], usdt_inr: float) -> list[str]:
        ranked: list[tuple[float, str]] = []
        max_notional = self.slot_usdt(usdt_inr) * self.cfg.leverage
        for symbol in self.cfg.candidates:
            book = books.get(symbol)
            if book is None or book.spread_bps > 12:
                continue
            lot = min_qty(symbol, self.lot_overrides)
            if lot * book.ask > max_notional * 0.95:
                continue
            ranked.append((quote_vol.get(symbol, 0.0), symbol))
        ranked.sort(reverse=True)
        return [s for _, s in ranked[: self.cfg.slot_count]]
