const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cache = require('./cache');
const { hashUrl, generateShortId } = require('./shortId');

const router = express.Router();
const prisma = new PrismaClient();

// POST /shorten
// Body: { "url": "https://example.com/very/long/path" }
router.post('/shorten', async (req, res) => {
  const { url } = req.body;

  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  const urlHash = hashUrl(url);

  // Check for duplicate — same URL always gets the same short link
  const existing = await prisma.url.findUnique({ where: { urlHash } });
  if (existing) {
    return res.json({
      shortUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/${existing.shortId}`,
      shortId: existing.shortId,
      expiresAt: existing.expiresAt,
    });
  }

  // Generate short ID with collision handling
  let shortId;
  let attempt = 0;
  while (true) {
    shortId = generateShortId(urlHash, attempt);
    const conflict = await prisma.url.findUnique({ where: { shortId } });
    if (!conflict) break;
    attempt++;
  }

  const record = await prisma.url.create({
    data: { shortId, originalUrl: url, urlHash },
  });

  return res.status(201).json({
    shortUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/${record.shortId}`,
    shortId: record.shortId,
    expiresAt: record.expiresAt,
  });
});

// GET /:shortId  — redirect to the original URL
router.get('/:shortId', async (req, res) => {
  const { shortId } = req.params;

  // 1. Check Redis cache first
  const cached = await cache.get(`url:${shortId}`);
  if (cached) {
    return res.redirect(302, cached);
  }

  // 2. Cache miss — query PostgreSQL
  const record = await prisma.url.findUnique({ where: { shortId } });

  if (!record) {
    return res.status(404).json({ error: 'Short URL not found' });
  }

  // 3. Check expiry
  if (new Date() > record.expiresAt) {
    return res.status(410).json({ error: 'Short URL has expired' });
  }

  // 4. Populate cache — dynamic TTL so Redis and Postgres expire in sync
  const ttlSeconds = Math.floor((record.expiresAt - new Date()) / 1000);
  await cache.setEx(`url:${shortId}`, ttlSeconds, record.originalUrl);

  return res.redirect(302, record.originalUrl);
});

module.exports = router;
