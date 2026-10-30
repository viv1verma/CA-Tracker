// ═══════════════════════════════════════════════════════════
// app.js — Express application assembly
// ═══════════════════════════════════════════════════════════
const express = require('express');
const path = require('path');
const fs = require('fs');
const { cacheControlMiddleware, blockedPublicMiddleware, createAssetLinksRouter } = require('./middleware/security');
const routes = require('./routes');

const app = express();

// ── Body parser ──
app.use(express.json({ limit: '15mb' }));

// ── Cache control for HTML ──
app.use(cacheControlMiddleware);

// ── Android TWA asset links ──
app.use(createAssetLinksRouter());

// ── Block protected paths from being served as static files ──
app.use(blockedPublicMiddleware);

// ── All API routes (before static files so /api/* takes priority) ──
app.use(routes);

// ── Static files ──
// Serve React build output (JS/CSS bundles in /assets/)
const distDir = path.join(__dirname, 'public', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}
// Serve PWA files (manifest.json, sw.js, icons)
app.use(express.static(path.join(__dirname, 'public')));

// ── SPA catch-all: serve React index.html for all non-API routes ──
const reactIndex = path.join(distDir, 'index.html');
app.get('*', (req, res) => {
  if (fs.existsSync(reactIndex)) return res.sendFile(reactIndex);
  // Legacy fallback
  const legacyIndex = path.join(__dirname, 'public', 'legacy.html');
  if (fs.existsSync(legacyIndex)) return res.sendFile(legacyIndex);
  res.status(404).send('Not found');
});

module.exports = app;
