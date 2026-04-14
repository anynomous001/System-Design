"""
Task 3 – Mock Backend Servers
Three separate Flask apps on ports 5010, 5011, 5012.
Run this file to start all three in separate threads.
"""

import threading
from flask import Flask, jsonify


def make_server(server_id: int, port: int):
    app = Flask(f"server{server_id}")

    @app.get("/")
    def index():
        return jsonify({
            "message": f"Hello from Server {server_id}!",
            "server": server_id,
            "port": port
        })

    # Silence Flask startup banner per thread
    import logging
    log = logging.getLogger("werkzeug")
    log.setLevel(logging.ERROR)

    app.run(port=port)


BACKENDS = [
    {"id": 1, "port": 5010},
    {"id": 2, "port": 5011},
    {"id": 3, "port": 5012},
]

if __name__ == "__main__":
    threads = []
    for b in BACKENDS:
        t = threading.Thread(target=make_server, args=(b["id"], b["port"]), daemon=True)
        t.start()
        threads.append(t)
        print(f"Backend Server {b['id']} started on http://localhost:{b['port']}")

    print("\nAll 3 backend servers running. Press Ctrl+C to stop.")
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print("\nShutting down.")
