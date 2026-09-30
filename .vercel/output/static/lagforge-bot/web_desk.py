"""Local visual desk served by the Python engine. Bind is 127.0.0.1 by default."""

from __future__ import annotations

import asyncio
import json
import logging
import webbrowser
from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import WSMsgType, web

log = logging.getLogger("lagforge.desk")
WEB_DIR = Path(__file__).resolve().parent / "web"

if TYPE_CHECKING:
    from main import Engine


def _cors(resp: web.StreamResponse) -> web.StreamResponse:
    resp.headers["Cache-Control"] = "no-store"
    return resp


async def run_web_desk(engine: Engine, stop: asyncio.Event) -> None:
    async def state(_req: web.Request) -> web.Response:
        return _cors(web.json_response(engine.snapshot()))

    async def control(req: web.Request) -> web.Response:
        try:
            body = await req.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}
        result = await engine.apply_control(body)
        return _cors(web.json_response(result, status=200 if result.get("ok") else 400))

    async def ws_handler(req: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(heartbeat=20)
        await ws.prepare(req)
        try:
            await ws.send_json(engine.snapshot())
            while not stop.is_set() and not ws.closed:
                try:
                    msg = await asyncio.wait_for(ws.receive(), timeout=0.4)
                except asyncio.TimeoutError:
                    if not ws.closed:
                        await ws.send_json(engine.snapshot())
                    continue
                if msg.type in {WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.CLOSED, WSMsgType.ERROR}:
                    break
                if msg.type == WSMsgType.TEXT:
                    try:
                        body = json.loads(msg.data)
                    except Exception:
                        body = {}
                    if isinstance(body, dict) and body.get("action"):
                        result = await engine.apply_control(body)
                        await ws.send_json(result.get("state") or engine.snapshot())
        except Exception as exc:
            log.debug("desk ws: %s", exc)
        return ws

    async def index(_req: web.Request) -> web.FileResponse:
        return web.FileResponse(WEB_DIR / "index.html")

    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/api/state", state)
    app.router.add_post("/api/control", control)
    app.router.add_get("/ws", ws_handler)
    if WEB_DIR.exists():
        app.router.add_static("/static", WEB_DIR, show_index=False)

    host = engine.cfg.desk_host
    port = engine.cfg.desk_port
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    try:
        await site.start()
    except OSError as exc:
        log.warning("visual desk did not bind %s:%s (%s) — engine still runs", host, port, exc)
        await stop.wait()
        return

    url = f"http://{host}:{port}/"
    log.info("visual desk %s", url)
    if engine.cfg.open_desk and host in {"127.0.0.1", "localhost"}:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        await stop.wait()
    finally:
        await runner.cleanup()
