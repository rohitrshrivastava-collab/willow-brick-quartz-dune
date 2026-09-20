from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Side = Literal["LONG", "SHORT"]
ExitReason = Literal["TARGET", "TIMEOUT", "STOP", "SCRATCH", "MANUAL"]


@dataclass(slots=True)
class Book:
    symbol: str
    bid: float
    ask: float
    bid_qty: float
    ask_qty: float
    ts_ms: int

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2.0

    @property
    def spread_bps(self) -> float:
        if self.ask <= 0:
            return 0.0
        return (self.ask - self.bid) / self.ask * 1e4


@dataclass(slots=True)
class Position:
    id: str
    symbol: str
    side: Side
    qty: float
    requested_qty: float
    entry_px: float
    entry_ts_ms: int
    target_px: float
    stop_px: float
    timeout_ts_ms: int
    expected_spread: float
    leverage: int
    order_id: str
    latency_ms: float
    paper: bool
    armed_breakeven: bool = False


@dataclass(slots=True)
class Trade:
    id: str
    symbol: str
    side: Side
    qty: float
    entry_px: float
    exit_px: float
    entry_ts_ms: int
    exit_ts_ms: int
    hold_sec: float
    gross_usdt: float
    fees_usdt: float
    net_usdt: float
    net_inr: float
    reason: ExitReason
    latency_ms: float
    paper: bool


@dataclass
class Books:
    lead: dict[str, Book] = field(default_factory=dict)
    lag: dict[str, Book] = field(default_factory=dict)
    quote_vol: dict[str, float] = field(default_factory=dict)
    usdt_inr: float = 96.0
    fx_ts_ms: int = 0
