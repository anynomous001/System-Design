/**
 * 3 mock backend servers running on ports 5001, 5002, 5003.
 * Each identifies itself in the response so we can verify Round Robin routing.
 */
const express = require('express');

const BACKENDS = [
  { id: 1, port: 5001 },
  { id: 2, port: 5002 },
  { id: 3, port: 5003 },
];

BACKENDS.forEach(({ id, port }) => {
  const app = express();

  app.use((req, res) => {
    console.log(`[Server ${id}] ${req.method} ${req.url}`);
    res.json({
      server: `Backend Server ${id}`,
      port,
      method: req.method,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  });

  app.listen(port, () => {
    console.log(`Backend Server ${id} listening on http://localhost:${port}`);
  });
});
