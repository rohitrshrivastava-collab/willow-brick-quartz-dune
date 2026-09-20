from __future__ import annotations

import time

from config import Config
from models import Book, Position, Side


def scratch_px(side: Side, entry: float, entry_fee: float, exit_fee: float) -> float:
    if side == "LONG":
        return (entry * (1 + entry_fee)) / max(1e-12, 1 - exit_fee)
    return (entry * (1 - entry_fee)) / (1 + exit_fee)


def net_usdt(side: Side, entry: float, exit_px: float, qty: float, entry_fee: float, exit_fee: float) -> float:
    gross = (exit_px - entry) * qty if side == "LONG" else (entry - exit_px) * qty
    return gross - (entry * qty * entry_fee + exit_px * qty * exit_fee)


class RiskManager:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.vol: dict[str, float] = {}
        self._last: dict[str, tuple[float, int]] = {}

    def observe_lead(self, symbol: str, mid: float, ts_ms: int) -> None:
        prev = self._last.get(symbol)
        if prev and ts_ms > prev[1] and prev[0] > 0:
            ret = abs(mid / prev[0] - 1.0)
            dt = max((ts_ms - prev[1]) / 1000.0, 0.2)
            inst = ret / (dt ** 0.5)
            prev_v = self.vol.get(symbol, inst)
            self.vol[symbol] = prev_v * 0.94 + inst * 0.06
        self._last[symbol] = (mid, ts_ms)

    def stop_pct(self, symbol: str) -> float:
        vol = self.vol.get(symbol, 0.0004)
        return max(self.cfg.min_stop_pct, self.cfg.vol_stop_mult * vol)

    def levels(self, symbol: str, side: Side, fill_px: float, target: float) -> tuple[float, float, int]:
        sp = self.stop_pct(symbol)
        stop = fill_px * (1 - sp) if side == "LONG" else fill_px * (1 + sp)
        timeout = int(time.time() * 1000 + self.cfg.hold_timeout_sec * 1000)
        return target, stop, timeout

    def should_exit(self, pos: Position, lag: Book, now_ms: int) -> str | None:
        mark = lag.bid if pos.side == "LONG" else lag.ask
        net = net_usdt(
            pos.side,
            pos.entry_px,
            mark,
            pos.qty,
            self.cfg.entry_taker_fee,
            self.cfg.exit_taker_fee,
        )
        scratch = scratch_px(pos.side, pos.entry_px, self.cfg.entry_taker_fee, self.cfg.exit_taker_fee)

        if net >= 0:
            pos.armed_breakeven = True
            if pos.side == "LONG":
                pos.stop_px = max(pos.stop_px, scratch)
            else:
                pos.stop_px = min(pos.stop_px, scratch)

        if pos.side == "LONG":
            if lag.bid >= pos.target_px:
                return "TARGET"
            if lag.bid <= pos.stop_px:
                return "SCRATCH" if pos.armed_breakeven else "STOP"
        else:
            if lag.ask <= pos.target_px:
                return "TARGET"
            if lag.ask >= pos.stop_px:
                return "SCRATCH" if pos.armed_breakeven else "STOP"

        if now_ms >= pos.timeout_ts_ms and net >= 0:
            return "TIMEOUT"
        return None
