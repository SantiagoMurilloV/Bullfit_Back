// src/routes/api/push_routes.js
// Sprint 6.A. Three endpoints:
//   GET  /api/push/public-key   - any authenticated user, frontend calls
//                                 it to bootstrap the browser subscription
//   POST /api/push/subscribe    - any authenticated user, persists sub
//   POST /api/push/unsubscribe  - any authenticated user, removes sub
//   POST /api/notifications     - admin only, broadcast to all subs
//
// Future:
//   GET    /api/notifications      (Sprint 6.E - list scheduled)
//   DELETE /api/notifications/:id  (Sprint 6.E - cancel scheduled)

const express = require('express');
const router = express.Router();
const pushController = require('../../controllers/push_controller');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

// Authenticated user endpoints (anyone logged in).
router.get('/push/public-key', requireAuth, pushController.publicKey);
router.post('/push/subscribe', requireAuth, pushController.subscribe);
router.post('/push/unsubscribe', requireAuth, pushController.unsubscribe);

// Admin-only.
router.post('/notifications', requireAdmin, pushController.sendBroadcast);
router.get('/notifications/templates', requireAdmin, pushController.listTemplates);
router.post('/notifications/templates', requireAdmin, pushController.createTemplate);
router.delete('/notifications/templates/:id', requireAdmin, pushController.deleteTemplate);
router.get('/notifications/recipients', requireAdmin, pushController.listRecipients);

module.exports = router;
