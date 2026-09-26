"""Lag-venue profiles. Lead is always Binance USDT-M futures."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

LagVenue = Literal["COINSWITCH", "COINDCX"]


@dataclass(frozen=True, slots=True)
class VenueProfile:
    id: LagVenue
    label: str
    entry_taker_fee: float
    exit_taker_fee: float
    extra_lag_spread_bps: float


# CoinSwitch PRO futures taker 0.065%. CoinDCX USDT-M Regular 0.05% + 18% GST.
PROFILES: dict[str, VenueProfile] = {
    "COINSWITCH": VenueProfile("COINSWITCH", "CoinSwitch PRO", 0.00065, 0.00065, 4.0),
    "COINDCX": VenueProfile("COINDCX", "CoinDCX", 0.00059, 0.00059, 5.0),
}


def normalize_venue(raw: str) -> LagVenue:
    v = (raw or "COINSWITCH").strip().upper().replace(" ", "")
    if v in {"DCX", "COINDCX", "COIN-DCX"}:
        return "COINDCX"
    return "COINSWITCH"


def profile(venue: str) -> VenueProfile:
    return PROFILES[normalize_venue(venue)]


def dcx_pair(symbol: str) -> str:
    """BTCUSDT -> B-BTC_USDT"""
    base = symbol.upper().replace("USDT", "")
    return f"B-{base}_USDT"


def from_dcx_pair(pair: str) -> str:
    p = pair.upper().removeprefix("B-").replace("_", "")
    if p.endswith("USDT"):
        return p
    return p + "USDT"
