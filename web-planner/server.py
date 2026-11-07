#!/usr/bin/env python3
"""Small standard-library web server and SQLite API for the BlueBridge planner."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import sqlite3
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "planner.db"


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.execute("CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if urlparse(self.path).path == "/api/plan":
            with sqlite3.connect(DB_PATH) as db:
                row = db.execute("SELECT payload, updated_at FROM plans WHERE id=1").fetchone()
            self.send_json({"plan": json.loads(row[0]) if row else None, "updatedAt": row[1] if row else None})
            return
        if urlparse(self.path).path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/plan":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 100_000:
                self.send_error(413, "Plan is too large")
                return
            plan = json.loads(self.rfile.read(size))
            if not isinstance(plan, dict) or not isinstance(plan.get("tasks"), list):
                self.send_error(400, "Expected a plan with a tasks list")
                return
            serialized = json.dumps(plan, ensure_ascii=False)
            with sqlite3.connect(DB_PATH) as db:
                db.execute("INSERT INTO plans (id, payload, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP", (serialized,))
            self.send_json({"ok": True})
        except (ValueError, json.JSONDecodeError):
            self.send_error(400, "Invalid JSON")

    def send_json(self, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    init_db()
    print("BlueBridge planner: http://localhost:8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
