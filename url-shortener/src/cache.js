const { createClient } = require('redis');

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

client.on('error', (err) => console.error('Redis error:', err));

async function connect() {
  await client.connect();
  console.log('Redis: connected');
}

/**
 * Get a cached value by key.
 */
async function get(key) {
  return client.get(key);
}

/**
 * Set a key with a TTL in seconds.
 */
async function setEx(key, ttlSeconds, value) {
  if (ttlSeconds > 0) {
    await client.setEx(key, ttlSeconds, value);
  }
}

/**
 * Delete a key.
 */
async function del(key) {
  await client.del(key);
}

module.exports = { connect, get, setEx, del };
