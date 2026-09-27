from __future__ import annotations

import json
from typing import Any

import aiosqlite

from models import Position


SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  ts_ms INTEGER NOT NULL
);
"""


class Store:
    def __init__(self, path: str) -> None:
        self.path = path
        self._db: aiosqlite.Connection | None = None

    async def open(self) -> None:
        self._db = await aiosqlite.connect(self.path)
        await self._db.executescript(SCHEMA)
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        assert self._db is not None
        return self._db

    async def put_kv(self, k: str, v: Any) -> None:
        await self.db.execute(
            "INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
            (k, json.dumps(v)),
        )
        await self.db.commit()

    async def get_kv(self, k: str, default: Any = None) -> Any:
        cur = await self.db.execute("SELECT v FROM kv WHERE k=?", (k,))
        row = await cur.fetchone()
        return default if row is None else json.loads(row[0])

    async def upsert_position(self, pos: Position) -> None:
        payload = json.dumps(pos.__dict__)
        await self.db.execute(
            "INSERT INTO positions(id, payload) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
            (pos.id, payload),
        )
        await self.db.commit()

    async def delete_position(self, pos_id: str) -> None:
        await self.db.execute("DELETE FROM positions WHERE id=?", (pos_id,))
        await self.db.commit()

    async def load_positions(self) -> list[Position]:
        cur = await self.db.execute("SELECT payload FROM positions")
        rows = await cur.fetchall()
        out: list[Position] = []
        for (payload,) in rows:
            data = json.loads(payload)
            out.append(Position(**data))
        return out

    async def insert_trade(self, payload: dict[str, Any]) -> None:
        await self.db.execute(
            "INSERT OR REPLACE INTO trades(id, payload, ts_ms) VALUES(?, ?, ?)",
            (payload["id"], json.dumps(payload), payload["exit_ts_ms"]),
        )
        await self.db.commit()

    async def load_trades(self, limit: int = 120) -> list[dict[str, Any]]:
        cur = await self.db.execute(
            "SELECT payload FROM trades ORDER BY ts_ms DESC LIMIT ?",
            (limit,),
        )
        rows = await cur.fetchall()
        return [json.loads(payload) for (payload,) in rows]

