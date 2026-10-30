// ═══════════════════════════════════════════════════════════
// middleware/security.js — Security middleware & asset links
// ═══════════════════════════════════════════════════════════
const express = require('express');

// Anything inside public/ is served to the whole internet. If source or config is
// ever dropped in there by mistake, it would be downloadable (e.g. /server.js would
// hand out the backend, JWT secret included). Refuse these outright -- belt and braces.
const BLOCKED_PUBLIC = /^\/(?:server\.js|package(?:-lock)?\.json|Dockerfile|railway\.json|\.env.*|\.git.*|data(?:\/.*)?)$/i;

/**
 * Middleware: block requests for protected paths from public/
 */
function blockedPublicMiddleware(req, res, next) {
  if (BLOCKED_PUBLIC.test(req.path)) {
    console.warn('Blocked attempt to fetch a protected path from public/:', req.path);
    return res.status(404).send('Not found');
  }
  next();
}

/**
 * Middleware: prevent stale HTML by setting no-cache headers
 */
function cacheControlMiddleware(req, res, next) {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
}

/**
 * Create a router for the assetlinks.json endpoint (Android TWA / Play Store)
 */
function createAssetLinksRouter() {
  const router = express.Router();
  router.get('/.well-known/assetlinks.json', (req, res) => {
    const pkg = process.env.ANDROID_PACKAGE || '';
    const fp = (process.env.ANDROID_SHA256 || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!pkg || !fp.length) {
      return res.status(404).json({ error: 'Android app not configured. Set ANDROID_PACKAGE and ANDROID_SHA256.' });
    }
    res.type('application/json').json([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fp }
    }]);
  });
  return router;
}

module.exports = {
  blockedPublicMiddleware,
  cacheControlMiddleware,
  createAssetLinksRouter
};
