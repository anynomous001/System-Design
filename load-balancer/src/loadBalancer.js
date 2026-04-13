require('dotenv').config();
const express = require('express');
const httpProxy = require('http-proxy');

const app = express();
const proxy = httpProxy.createProxyServer({});
const LB_PORT = process.env.PORT || 8080;
const HEALTH_CHECK_INTERVAL_MS = 10_000; // 10 seconds

// Backend server pool
const servers = [
  { id: 1, url: 'http://localhost:5001', healthy: true },
  { id: 2, url: 'http://localhost:5002', healthy: true },
  { id: 3, url: 'http://localhost:5003', healthy: true },
];

// ── Round Robin State ────────────────────────────────────────────────────────
let requestCounter = 0;

/**
 * Pick the next healthy server using Round Robin.
 * Uses modulo arithmetic: servers[counter % n]
 * Skips unhealthy servers.
 */
function getNextServer() {
  const healthyServers = servers.filter((s) => s.healthy);
  if (healthyServers.length === 0) return null;

  const server = healthyServers[requestCounter % healthyServers.length];
  requestCounter++;
  return server;
}

// ── Health Checks ────────────────────────────────────────────────────────────
async function checkHealth(server) {
  try {
    // Node's built-in fetch (Node 18+) — no extra deps needed
    const res = await fetch(server.url, { signal: AbortSignal.timeout(2000) });
    server.healthy = res.ok || res.status < 500;
  } catch {
    server.healthy = false;
  }

  const status = server.healthy ? 'UP' : 'DOWN';
  console.log(`[Health Check] Server ${server.id} (${server.url}) → ${status}`);
}

function startHealthChecks() {
  setInterval(() => {
    servers.forEach(checkHealth);
  }, HEALTH_CHECK_INTERVAL_MS);
  console.log(`Health checks running every ${HEALTH_CHECK_INTERVAL_MS / 1000}s`);
}

// ── Proxy Error Handling ─────────────────────────────────────────────────────
proxy.on('error', (err, _req, res) => {
  console.error('[Proxy Error]', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Backend server unavailable' }));
});

// ── Status Endpoint (must be before the catch-all proxy route) ────────────────
app.get('/_lb/status', (_req, res) => {
  res.json({
    totalRequests: requestCounter,
    servers: servers.map(({ id, url, healthy }) => ({ id, url, healthy })),
  });
});

// ── Load Balancer Route (catch-all reverse proxy) ─────────────────────────────
app.use((req, res) => {
  const server = getNextServer();

  if (!server) {
    return res.status(503).json({ error: 'Service Unavailable', message: 'No healthy backend servers' });
  }

  // Attach routing info to response headers so caller knows which server handled it
  res.setHeader('X-Served-By', `Server-${server.id}`);
  res.setHeader('X-Request-Number', requestCounter);

  console.log(`[LB] Request #${requestCounter} → Server ${server.id} (${server.url}${req.url})`);

  proxy.web(req, res, { target: server.url });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(LB_PORT, () => {
  console.log(`Load Balancer running on http://localhost:${LB_PORT}`);
  console.log(`Backends: ${servers.map((s) => s.url).join(', ')}`);
  startHealthChecks();
});
