"""Fetch futures wallet on the selected lag venue. Never called from the web desk."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Any

import aiohttp

from config import Config

log = logging.getLogger("lagforge.wallet")


def _dcx_sign(secret: str, body: dict[str, Any]) -> tuple[str, str]:
    raw = json.dumps(body, separators=(",", ":"))
    sig = hmac.new(secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()
    return raw, sig


async def fetch_wallet_inr(cfg: Config, session: aiohttp.ClientSession, usdt_inr: float) -> float | None:
    """Return USDT-margined futures wallet converted to INR, or None on paper / error."""
    if cfg.paper_trading or not cfg.live_enabled:
        return cfg.starting_capital_inr
    try:
        if cfg.lag_venue == "COINDCX":
            usdt = await _dcx_usdt(cfg, session)
        else:
            usdt = await _cs_usdt(cfg, session)
    except Exception as exc:
        log.warning("wallet fetch failed: %s", exc)
        return None
    if usdt is None:
        return None
    return usdt * max(usdt_inr, 1e-9)


async def _dcx_usdt(cfg: Config, session: aiohttp.ClientSession) -> float | None:
    body = {"timestamp": int(time.time() * 1000)}
    raw, sig = _dcx_sign(cfg.coindcx_secret_key, body)
    headers = {
        "Content-Type": "application/json",
        "X-AUTH-APIKEY": cfg.coindcx_api_key,
        "X-AUTH-SIGNATURE": sig,
    }
    url = f"{cfg.coindcx_base_url}/exchange/v1/derivatives/futures/wallets"
    async with session.post(url, data=raw, headers=headers) as resp:
        data = await resp.json(content_type=None)
        if resp.status >= 400:
            raise RuntimeError(f"dcx wallet {resp.status} {data}")
    rows = data if isinstance(data, list) else data.get("data") or data.get("wallets") or []
    for row in rows:
        ccy = str(row.get("currency_short_name") or row.get("currency") or "").upper()
        if ccy == "USDT":
            bal = float(row.get("balance") or 0) + float(row.get("locked_balance") or 0)
            return bal
    return None


async def _cs_usdt(cfg: Config, session: aiohttp.ClientSession) -> float | None:
    """Best-effort CoinSwitch futures wallet. Signed the same way as orders."""
    from order_executor import OrderExecutor

    exec_ = OrderExecutor(cfg)
    headers, path = exec_._sign("GET", "/trade/api/v2/futures/wallet")
    url = cfg.coinswitch_base_url + path
    async with session.get(url, headers=headers) as resp:
        data = await resp.json(content_type=None)
        if resp.status >= 400:
            raise RuntimeError(f"cs wallet {resp.status} {data}")
    payload = data.get("data", data)
    if isinstance(payload, list):
        for row in payload:
            ccy = str(row.get("currency") or row.get("asset") or "").upper()
            if ccy in {"USDT", "USDT-FUTURES"}:
                return float(row.get("balance") or row.get("available") or 0)
        return None
    if isinstance(payload, dict):
        for key in ("available_balance", "balance", "wallet_balance"):
            if key in payload:
                return float(payload[key] or 0)
    return None
