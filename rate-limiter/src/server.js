require('dotenv').config();
const express = require('express');
const { connect } = require('./redisClient');
const rateLimiter = require('./rateLimiter');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Apply rate limiter globally to all routes
app.use(rateLimiter);

// Sample protected routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello! You are within the rate limit.' });
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await connect();
  app.listen(PORT, () => {
    console.log(`Rate Limiter server running on http://localhost:${PORT}`);
    console.log(`Limit: ${5} requests per 60 seconds per IP`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
