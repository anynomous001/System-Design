"""
Task 3 – Round Robin Load Balancer
Forwards incoming requests to 3 backend servers in rotation using the
`requests` library. Acts as a reverse proxy on port 5020.

Round Robin algorithm:
  next_server = servers[ counter % len(servers) ]
  counter += 1
"""

import requests
from flask import Flask, request, Response, jsonify

app = Flask(__name__)

# Backend server pool
SERVERS = [
    "http://localhost:5010",
    "http://localhost:5011",
    "http://localhost:5012",
]

# The single piece of state the Round Robin algorithm needs
request_counter = 0


def get_next_server() -> str:
    """Return the URL of the next backend server using Round Robin."""
    global request_counter
    server = SERVERS[request_counter % len(SERVERS)]
    request_counter += 1
    return server


# ── Proxy route ───────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE"])
@app.route("/<path:path>",             methods=["GET", "POST", "PUT", "DELETE"])
def proxy(path):
    target = get_next_server()
    url    = f"{target}/{path}"

    print(f"[LB] Request #{request_counter} → {target}")

    try:
        # Forward the request to the chosen backend using the `requests` library
        resp = requests.request(
            method  = request.method,
            url     = url,
            headers = {k: v for k, v in request.headers if k != "Host"},
            data    = request.get_data(),
            params  = request.args,
            timeout = 5,
        )

        # Stream the backend response back to the original caller
        return Response(
            resp.content,
            status  = resp.status_code,
            headers = {
                **dict(resp.headers),
                "X-Served-By": target,          # which backend handled it
                "X-Request-Number": str(request_counter),
            },
        )

    except requests.exceptions.ConnectionError:
        return jsonify({"error": f"Backend {target} is unreachable"}), 502


# ── Status endpoint ───────────────────────────────────────────────────────────

@app.get("/_lb/status")
def status():
    return jsonify({
        "total_requests": request_counter,
        "servers": SERVERS,
        "algorithm": "Round Robin",
    })


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Load Balancer running on http://localhost:5020")
    print(f"Backends: {SERVERS}")
    app.run(port=5020, debug=False)
