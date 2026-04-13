const crypto = require('crypto');

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Generate a SHA-256 hex hash of the given URL.
 */
function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

/**
 * Convert the first 8 hex chars of a hash into a 6-char Base62 short ID.
 * Falls back to a random suffix on collision (handled at the DB layer).
 */
function toBase62(hexHash, length = 6) {
  let num = BigInt('0x' + hexHash.slice(0, 12)); // 48-bit number
  let result = '';
  while (result.length < length) {
    result = BASE62[Number(num % 62n)] + result;
    num = num / 62n;
  }
  return result.slice(0, length);
}

/**
 * Generate a short ID from a URL hash.
 * If a collision suffix is needed, appends a random extra character.
 */
function generateShortId(urlHash, attempt = 0) {
  if (attempt === 0) return toBase62(urlHash);
  // On collision, mix in a random byte to shift the output
  const salt = crypto.randomBytes(4).toString('hex');
  return toBase62(crypto.createHash('sha256').update(urlHash + salt).digest('hex'));
}

module.exports = { hashUrl, generateShortId };
