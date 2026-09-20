"""Runtime configuration. Values come from environment / .env — never hard-code keys."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _float(name: str, default: float) -> float:
    raw = os.getenv(name)
    return default if raw is None or raw == "" else float(raw)


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return default if raw is None or raw == "" else int(raw)


DEFAULT_CANDIDATES = (
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "BNBUSDT",
    "ADAUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "SUIUSDT",
    "DOTUSDT",
    "LTCUSDT",
    "NEARUSDT",
    "APTUSDT",
    "ARBUSDT",
    "UNIUSDT",
    "ATOMUSDT",
    "FILUSDT",
)

# Conservative CoinSwitch-style contract lots. Live bot overwrites from instrument_info.
MIN_QTY = {
    "BTCUSDT": 0.001,
    "ETHUSDT": 0.001,
    "SOLUSDT": 0.01,
    "BNBUSDT": 0.01,
    "XRPUSDT": 1.0,
    "DOGEUSDT": 1.0,
    "ADAUSDT": 1.0,
    "AVAXUSDT": 0.1,
    "LINKUSDT": 0.1,
    "DOTUSDT": 0.1,
    "LTCUSDT": 0.01,
    "SUIUSDT": 1.0,
    "NEARUSDT": 0.1,
    "APTUSDT": 0.01,
    "ARBUSDT": 1.0,
    "UNIUSDT": 0.1,
    "ATOMUSDT": 0.1,
    "FILUSDT": 0.1,
}


@dataclass(slots=True)
class Config:
    paper_trading: bool = True
    confirm_live: str = ""
    coinswitch_api_key: str = ""
    coinswitch_secret_key: str = ""
    coinswitch_base_url: str = "https://coinswitch.co"
    telegram_token: str = ""
    telegram_chat_id: str = ""
    starting_capital_inr: float = 10000.0
    slot_count: int = 10
    leverage: int = 10
    entry_taker_fee: float = 0.00065
    exit_taker_fee: float = 0.00065
    slippage_buffer: float = 0.0005
    max_tob_pct: float = 0.25
    max_slippage_pct: float = 0.001
    hold_timeout_sec: float = 45.0
    min_stop_pct: float = 0.0015
    vol_stop_mult: float = 2.2
    allow_synthetic_lag: bool = False
    synthetic_lag_ms: int = 220
    sqlite_path: str = "lagforge.db"
    log_level: str = "INFO"
    candidates: tuple[str, ...] = field(default_factory=lambda: DEFAULT_CANDIDATES)
    rest_rate: float = 15 / 60  # 15 authenticated REST calls / minute

    @property
    def hurdle(self) -> float:
        return self.entry_taker_fee + self.exit_taker_fee + self.slippage_buffer

    @property
    def live_enabled(self) -> bool:
        return (
            not self.paper_trading
            and self.confirm_live.strip().upper() == "YES"
            and bool(self.coinswitch_api_key and self.coinswitch_secret_key)
        )


def load_config() -> Config:
    paper = _bool("PAPER_TRADING", True)
    cfg = Config(
        paper_trading=paper,
        confirm_live=os.getenv("CONFIRM_LIVE", ""),
        coinswitch_api_key=os.getenv("COINSWITCH_API_KEY", ""),
        coinswitch_secret_key=os.getenv("COINSWITCH_SECRET_KEY", ""),
        coinswitch_base_url=os.getenv("COINSWITCH_BASE_URL", "https://coinswitch.co").rstrip("/"),
        telegram_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
        telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
        starting_capital_inr=_float("STARTING_CAPITAL_INR", 10000),
        slot_count=_int("SLOT_COUNT", 10),
        leverage=_int("LEVERAGE", 10),
        entry_taker_fee=_float("ENTRY_TAKER_FEE", 0.00065),
        exit_taker_fee=_float("EXIT_TAKER_FEE", 0.00065),
        slippage_buffer=_float("SLIPPAGE_BUFFER", 0.0005),
        max_tob_pct=_float("MAX_TOB_PCT", 0.25),
        max_slippage_pct=_float("MAX_SLIPPAGE_PCT", 0.001),
        hold_timeout_sec=_float("HOLD_TIMEOUT_SEC", 45),
        min_stop_pct=_float("MIN_STOP_PCT", 0.0015),
        vol_stop_mult=_float("VOL_STOP_MULT", 2.2),
        allow_synthetic_lag=_bool("ALLOW_SYNTHETIC_LAG", False),
        synthetic_lag_ms=_int("SYNTHETIC_LAG_MS", 220),
        sqlite_path=os.getenv("SQLITE_PATH", "lagforge.db"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )
    return cfg
