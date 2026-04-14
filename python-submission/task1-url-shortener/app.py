"""
Task 1 – URL Shortener Lite
Flask + SQLite + Base62

Endpoints:
  POST /shorten   { "url": "https://..." }  →  { "short_id": "...", "short_url": "..." }
  GET  /<short_id>                          →  302 redirect to original URL
"""

import hashlib
import sqlite3
from flask import Flask, request, jsonify, redirect, g

app = Flask(__name__)
DATABASE = "urls.db"
BASE_URL = "http://localhost:5005"

BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


# ── Database helpers ──────────────────────────────────────────────────────────

def get_db():
    """Return a per-request SQLite connection (stored on Flask's g object)."""
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE, detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_error):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create the urls table and indexes if they don't exist yet."""
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS urls (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            short_id    TEXT    NOT NULL UNIQUE,
            original_url TEXT   NOT NULL,
            url_hash    TEXT    NOT NULL UNIQUE,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_short_id ON urls (short_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_url_hash  ON urls (url_hash)")
    db.commit()


# ── Base62 encoding ───────────────────────────────────────────────────────────

def to_base62(number, length=6):
    """Convert an integer to a Base62 string of fixed length."""
    result = ""
    while len(result) < length:
        result = BASE62[number % 62] + result
        number //= 62
    return result[:length]


def generate_short_id(url, attempt=0):
    """
    Hash the URL with SHA-256, take the first 48 bits, encode as Base62.
    On collision (attempt > 0) append a salt to shift the hash output.
    """
    payload = url if attempt == 0 else f"{url}:{attempt}"
    hex_hash = hashlib.sha256(payload.encode()).hexdigest()
    # Take first 12 hex chars = 48 bits → fits comfortably in a Python int
    number = int(hex_hash[:12], 16)
    return to_base62(number)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/shorten")
def shorten():
    data = request.get_json(silent=True) or {}
    url = data.get("url", "").strip()

    if not url or not url.startswith("http"):
        return jsonify({"error": "A valid URL starting with http is required"}), 400

    db = get_db()
    url_hash = hashlib.sha256(url.encode()).hexdigest()

    # Duplicate check — same URL always gets the same short link
    existing = db.execute(
        "SELECT short_id FROM urls WHERE url_hash = ?", (url_hash,)
    ).fetchone()

    if existing:
        short_id = existing["short_id"]
        return jsonify({
            "short_id": short_id,
            "short_url": f"{BASE_URL}/{short_id}",
            "note": "URL already shortened"
        })

    # Generate short ID; retry on collision
    attempt = 0
    while True:
        short_id = generate_short_id(url, attempt)
        conflict = db.execute(
            "SELECT 1 FROM urls WHERE short_id = ?", (short_id,)
        ).fetchone()
        if not conflict:
            break
        attempt += 1

    db.execute(
        "INSERT INTO urls (short_id, original_url, url_hash) VALUES (?, ?, ?)",
        (short_id, url, url_hash),
    )
    db.commit()

    return jsonify({
        "short_id": short_id,
        "short_url": f"{BASE_URL}/{short_id}"
    }), 201


@app.get("/<short_id>")
def redirect_url(short_id):
    db = get_db()
    row = db.execute(
        "SELECT original_url FROM urls WHERE short_id = ?", (short_id,)
    ).fetchone()

    if not row:
        return jsonify({"error": "Short URL not found"}), 404

    return redirect(row["original_url"], code=302)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    with app.app_context():
        init_db()
    print("URL Shortener running on http://localhost:5005")
    app.run(port=5005, debug=False)
