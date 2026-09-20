from __future__ import annotations

from dataclasses import dataclass

from config import Config
from models import Book, Side


@dataclass(slots=True)
class Signal:
    symbol: str
    side: Side
    divergence: float
    lead_mid: float
    lag_px: float
    lag_qty: float


def evaluate(cfg: Config, lead: Book, lag: Book) -> Signal | None:
    """Top-of-book only. LONG vs lag ask, SHORT vs lag bid. Never LTP."""
    if lag.ask <= 0 or lag.bid <= 0:
        return None
    lead_mid = lead.mid
    long_div = (lead_mid - lag.ask) / lag.ask
    short_div = (lag.bid - lead_mid) / lag.bid
    hurdle = cfg.hurdle
    if long_div > hurdle and long_div >= short_div and lag.ask_qty > 0:
        return Signal(lead.symbol, "LONG", long_div, lead_mid, lag.ask, lag.ask_qty)
    if short_div > hurdle and lag.bid_qty > 0:
        return Signal(lead.symbol, "SHORT", short_div, lead_mid, lag.bid, lag.bid_qty)
    return None
