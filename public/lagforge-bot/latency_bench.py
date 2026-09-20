"""Measure HTTPS RTT from THIS machine to Binance and CoinSwitch. Run on the EC2 box."""

from __future__ import annotations

import asyncio
import statistics
import sys
import time

import aiohttp

TARGETS = {
    "binance_fapi": "https://fapi.binance.com/fapi/v1/ping",
    "binance_vision": "https://data-api.binance.vision/api/v3/ping",
    "coinswitch_time": "https://coinswitch.co/trade/api/v2/time",
    "coinswitch_www": "https://coinswitch.co/",
    "fx_usd_inr": "https://open.er-api.com/v6/latest/USD",
}


async def once(session: aiohttp.ClientSession, url: str) -> float | None:
    t0 = time.perf_counter()
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=6)) as resp:
            await resp.read()
            return (time.perf_counter() - t0) * 1000
    except Exception as exc:
        print(f"  fail {url} {exc}")
        return None


async def bench(rounds: int = 5) -> None:
    print(f"LAGFORGE latency bench  rounds={rounds}  platform={sys.platform}")
    async with aiohttp.ClientSession() as session:
        for name, url in TARGETS.items():
            samples: list[float] = []
            for _ in range(rounds):
                ms = await once(session, url)
                if ms is not None:
                    samples.append(ms)
            if not samples:
                print(f"{name:18}  unreachable")
                continue
            print(
                f"{name:18}  min {min(samples):7.1f}  med {statistics.median(samples):7.1f}  "
                f"avg {statistics.mean(samples):7.1f}  max {max(samples):7.1f}  ms"
            )
            print(f"{'':18}  {url}")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(bench())
