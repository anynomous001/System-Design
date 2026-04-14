"""
Task 2 – Rate Limiter Mini
Flask + in-memory dictionary (Sliding Window using timestamps)

Endpoint:
  GET /data   →  200 OK  or  429 Too Many Requests

Algorithm:
  Each user (identified by IP) maps to a list of request timestamps.
  On every request:
    1. Remove timestamps older than 60 seconds (they've left the window).
    2. Count remaining timestamps — these are requests in the last 60 seconds.
    3. If count >= 5 → reject with 429.
    4. Otherwise append current timestamp → allow request.

In-memory store structure:
  {
    "192.168.1.1": [1713000000.123, 1713000010.456, ...],
    "10.0.0.2":    [1713000005.789],
  }
"""

import time
from flask import Flask, request, jsonify

app = Flask(__name__)

# In-memory store: maps IP address → list of Unix timestamps (float seconds)
request_log: dict[str, list[float]] = {}

LIMIT      = 5    # max requests allowed
WINDOW_SEC = 60   # sliding window size in seconds


def is_rate_limited(ip: str) -> tuple[bool, int]:
    """
    Check if the given IP has exceeded the rate limit.

    Returns:
        (limited: bool, remaining: int)
    """
    now = time.time()
    window_start = now - WINDOW_SEC

    # Get this IP's history, defaulting to empty list
    timestamps = request_log.get(ip, [])

    # Step 1 — prune timestamps outside the window (Sliding Window core logic)
    timestamps = [t for t in timestamps if t >= window_start]

    # Step 2 — count requests currently inside the window
    count = len(timestamps)

    if count >= LIMIT:
        # Calculate how long until the oldest request slides out
        oldest = timestamps[0]
        retry_after = int((oldest + WINDOW_SEC) - now) + 1
        request_log[ip] = timestamps   # save pruned list without adding new entry
        return True, retry_after

    # Step 3 — allow: append current timestamp and save
    timestamps.append(now)
    request_log[ip] = timestamps
    return False, LIMIT - len(timestamps)


# ── Route ─────────────────────────────────────────────────────────────────────

@app.get("/data")
def data():
    ip = request.remote_addr or "unknown"
    limited, value = is_rate_limited(ip)

    if limited:
        return jsonify({
            "error": "Too Many Requests",
            "message": "Try again later.",
            "retry_after_seconds": value
        }), 429

    return jsonify({
        "message": "Here is your data!",
        "requests_remaining": value
    })


# ── Debug endpoint: inspect the in-memory store ───────────────────────────────

@app.get("/_debug/store")
def debug_store():
    now = time.time()
    result = {}
    for ip, timestamps in request_log.items():
        result[ip] = {
            "timestamps": [round(t, 2) for t in timestamps],
            "in_window": sum(1 for t in timestamps if t >= now - WINDOW_SEC)
        }
    return jsonify(result)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Rate Limiter running on http://localhost:5001")
    print(f"Limit: {LIMIT} requests per {WINDOW_SEC} seconds per IP")
    app.run(port=5001, debug=False)
