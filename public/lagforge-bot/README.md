# LAGFORGE

Lead-lag latency bot: **Binance Futures (lead)** → **CoinSwitch PRO Crypto Futures (lag)**.

Paper trading is the default. Do not enable live orders until you have 72 hours of tape showing that gross divergence still beats fees after slippage.

This is trading software, not advice. ₹10,000 at 10× is enough to destroy the account. Run paper first.

## What it does

- Watches Binance bookTicker over WebSocket (never REST polling for signals).
- Watches CoinSwitch PRO futures order book over Socket.IO.
- Converts slot size with a live USDT/INR rate (equity is INR; contracts are USDT-margined).
- Splits equity equally across 10 coin slots. One open position per coin.
- Enters LONG if Binance mid > CoinSwitch best ask by more than entry fee + exit fee + slippage buffer.
- Enters SHORT if Binance mid < CoinSwitch best bid by the same hurdle.
- Caps size to a fraction of top-of-book. Resizes exits to the filled quantity.
- Exits on target (lag catches the Binance mid recorded at entry), a volatility stop, or timeout. Timeout (default 45s) **never closes a losing trade** — it only flattens if net PnL after fees is green. Once a trade is green, the stop ratchets to scratch so a giveback cannot turn a winner into a timeout loss.
- Recovers open slots from SQLite after a crash.
- Telegram on every fill and every hour.

## Local (VS Code / Windows / macOS / Linux)

Python 3.11+.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate
pip install -r requirements.txt
cp env.example .env
```

Edit `.env`:

- Leave `PAPER_TRADING=true`.
- Add Telegram token + chat id for alerts.
- CoinSwitch keys are optional in paper mode (needed only for live orders).
- If CoinSwitch WS is blocked on your network, set `ALLOW_SYNTHETIC_LAG=true` so paper still runs against a delayed Binance book. Turn that off for the real 72-hour calibration.

```bash
python latency_bench.py
python main.py
```

You want CoinSwitch RTT in the low tens of milliseconds from Mumbai. If Binance futures WS is geo-blocked, the bot falls back to Binance’s public spot stream.

## AWS EC2 (ap-south-1 Mumbai)

1. Ubuntu 22.04 LTS, t3.small or better, same region as CoinSwitch.
2. Open outbound 443. No inbound except your SSH.
3. Install Python 3.11, clone/copy this folder, create venv, copy `.env`.
4. `python latency_bench.py` — confirm CoinSwitch and Binance pings.
5. Run paper under systemd:

```bash
sudo cp deploy/lagforge.service /etc/systemd/system/lagforge.service
sudo systemctl daemon-reload
sudo systemctl enable --now lagforge
journalctl -u lagforge -f
```

Edit the unit’s `WorkingDirectory` and `EnvironmentFile` to match the account path.

## Going live (after 72h paper)

Only if net edge survived fees across Asia / London / US hours:

```
PAPER_TRADING=false
CONFIRM_LIVE=YES
```

Both are required. Keys stay in `.env` on the box — never in git, never in a web form.

Live orders hit `POST /trade/api/v2/futures/order` with Ed25519 headers. CoinSwitch futures are USDT-margined; INR is how we size and report.

## Notes on ₹10,000 / 10 slots

At ~₹96/USDT a ₹1,000 slot with 10× is ~$104 notional. BTC’s 0.001 lot can fit if the book is liquid enough; the screener still drops any coin whose min contract exceeds slot notional and fills the 10 slots from the most liquid names that fit.

## Files

| File | Module |
| --- | --- |
| `data_ingestion.py` | DataIngestion |
| `signal_engine.py` | SignalEngine |
| `portfolio.py` | PortfolioManager |
| `order_executor.py` | OrderExecutor |
| `risk_manager.py` | RiskManager |
| `telegram_reporter.py` | TelegramReporter |
| `persistence.py` | SQLite crash recovery |
| `latency_bench.py` | RTT probe |
| `rate_limit.py` | Token bucket |
