# LAGFORGE

Lead-lag engine: **Binance Futures (lead)** → **CoinSwitch PRO or CoinDCX Crypto Futures (lag)**.

This repo is the trading engine. It is **not** the visual desk in the Grok preview. The desk stays paper. Live orders run from this folder in VS Code (or later on a Mumbai EC2 box). Status while it runs: terminal + Telegram.

Do **not** paste API keys into the web desk or into chat. They go only in a local `.env`.

Paper is the default. Do not enable live until you have 72 hours of tape showing that gross divergence still beats fees after slippage. ₹10,000 at 10× can wipe the account.

---

## Get the code (skip the Grok zip)

The Grok preview host (`*.grok-sandbox.com`) is often blocked by antivirus (Quick Heal Browsing Protection). That popup is about the preview website, not this repo. **Do not download from the preview.** Use GitHub.

1. Install [Python 3.11+](https://www.python.org/downloads/) (Windows: tick **Add python.exe to PATH**) and [VS Code](https://code.visualstudio.com/) with the Microsoft **Python** extension.
2. Sign into [github.com](https://github.com) as **rohitrshrivastava-collab** (this repo is private).
3. In VS Code: **Ctrl+Shift+P** (Mac: **Cmd+Shift+P**) → **Git: Clone**.
4. Paste:

```
https://github.com/rohitrshrivastava-collab/lagforge-bot.git
```

5. Pick a folder (for example Documents). Open the cloned folder when VS Code asks. If VS Code asks to install Git, let it.

### No Git? Download the zip from GitHub

On [the repo page](https://github.com/rohitrshrivastava-collab/lagforge-bot) (while signed in): **Code → Download ZIP**. Unzip, then in VS Code: **File → Open Folder**.

Or in a terminal (Git installed):

```bash
git clone https://github.com/rohitrshrivastava-collab/lagforge-bot.git
cd lagforge-bot
```

Optional: if you still want the visual paper desk in Grok, whitelist `*.grok-sandbox.com` in Quick Heal → Internet Security → Browsing Protection. You do **not** need that site to run this engine.

---

## Run paper

In the VS Code terminal (inside the cloned folder):

```bash
python -m venv .venv
```

Activate it:

- **Windows:** `.venv\Scripts\activate`
- **Mac / Linux:** `source .venv/bin/activate`

Then:

```bash
pip install -r requirements.txt
cp env.example .env
```

Windows PowerShell:

```powershell
copy env.example .env
```

Open `.env`. Keep `PAPER_TRADING=true`. Set `LAG_VENUE=COINSWITCH` or `LAG_VENUE=COINDCX`. Add Telegram token and chat id. Leave exchange keys empty for paper. Optionally set `ALLOC_PCT` (1–100) and `MAX_SESSION_LOSS_INR` (halt if session loss hits this rupee amount; 0 = off). Save. Never commit `.env`.

If CoinSwitch WS fails on your home network, set `ALLOW_SYNTHETIC_LAG=true` for a local delayed-Binance book. Turn that **off** before the real 72-hour calibration.

```bash
python latency_bench.py
python main.py
```

The **visual desk** (same layout as the Grok preview) opens on your computer, wired to this engine. Paper/Live, CS/DCX, wallet, allocation, max-loss, start/pause, blotter, and keys all work there. Keys you paste in that desk are written to local `.env` only.

Leave the terminal window open. `Ctrl+C` stops it.

---

## AWS EC2 (ap-south-1) — after paper works on your PC

Ubuntu 22.04, t3.small or better. SSH inbound from your IP only. Outbound HTTPS open.

Clone this repo on the box, recreate the venv, copy `.env` **on the server** (do not email it). Run `python latency_bench.py` — you want CoinSwitch RTT in the low tens of milliseconds from Mumbai.

```bash
sudo cp deploy/lagforge.service /etc/systemd/system/lagforge.service
```

Edit `WorkingDirectory` and `EnvironmentFile` to your path, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lagforge
sudo journalctl -u lagforge -f
```

Keep `PAPER_TRADING=true` until the 72-hour tape is done.

## Going live (after 72h paper)

Only if net edge survived fees across Asia, London, and US hours. In `.env` **on the server**, fill the keys for the venue you picked:

```
LAG_VENUE=COINSWITCH
COINSWITCH_API_KEY=...
COINSWITCH_SECRET_KEY=...
PAPER_TRADING=false
CONFIRM_LIVE=YES
```

or:

```
LAG_VENUE=COINDCX
COINDCX_API_KEY=...
COINDCX_SECRET_KEY=...
PAPER_TRADING=false
CONFIRM_LIVE=YES
```

`CONFIRM_LIVE=YES` and keys for that venue are both required. Restart the service. Keys stay on that box.

## Strategy notes

- Target and timeout flatten **only if the close is net-green after fees**.
- The vol stop is the only per-trade loss exit (at least 3× the book spread).
- `MAX_SESSION_LOSS_INR` flattens every open slot and stops new entries when marked session loss hits the cap.
- Slots are equal-weight from `(wallet × ALLOC_PCT%) / SLOT_COUNT`. One open position per coin.
