const { client } = require('./redisClient');

const WINDOW_MS = 60 * 1000;   // 60-second sliding window
const MAX_REQUESTS = 5;         // requests allowed per window

/**
 * Sliding Window Counter rate limiter middleware.
 *
 * How it works:
 *  1. Identify user by IP address.
 *  2. Use a Redis Sorted Set (key = "rl:<ip>") where each member is a
 *     unique request ID and its score is the Unix timestamp in ms.
 *  3. Remove all members with score < (now - windowMs)  →  outside the window.
 *  4. Count remaining members  →  requests in the last 60 seconds.
 *  5. If count >= limit → 429 Too Many Requests.
 *  6. Otherwise add current request to the set and set the key's TTL.
 */
async function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `rl:${ip}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Atomic pipeline: remove expired entries → count → add new entry → set TTL
  const results = await client.multi()
    .zRemRangeByScore(key, '-inf', windowStart)   // remove outside window
    .zCard(key)                                    // count inside window
    .zAdd(key, { score: now, value: `${now}-${Math.random()}` }) // log request
    .expire(key, Math.ceil(WINDOW_MS / 1000))      // auto-cleanup key
    .exec();

  const requestCount = results[1]; // count BEFORE adding current request

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - requestCount - 1));
  res.setHeader('X-RateLimit-Window', `${WINDOW_MS / 1000}s`);

  if (requestCount >= MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Limit of ${MAX_REQUESTS} requests per ${WINDOW_MS / 1000}s exceeded.`,
      retryAfter: `${WINDOW_MS / 1000}s`,
    });
  }

  next();
}

module.exports = rateLimiter;
