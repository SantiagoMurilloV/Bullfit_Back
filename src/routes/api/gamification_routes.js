// src/routes/api/gamification_routes.js
// Gamification + notification-bell routes.
//
// Auth:
//   - Streak/calendar endpoints: requireAuth (any logged-in user for their own
//     data; admin can query any userId via requireAdmin guard in controller).
//   - Notification endpoints: requireAuth (each controller filters by req.auth.sub).

const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/gamification_controller');
const { requireAuth, requireAdmin, requireSelfOrAdmin } = require('../../middleware/auth');

// ── Streak + calendar ────────────────────────────────────────────────────────
// GET /api/gamification/streaks/all  — debe ir ANTES de /:userId para evitar shadowing
router.get('/gamification/streaks/all', requireAuth, ctrl.getAllStreaks);

// GET /api/gamification/leaderboard  — ranking del juego de rachas (Bull Admin).
// También ANTES de /:userId para evitar shadowing.
router.get('/gamification/leaderboard', requireAdmin, ctrl.getStreakLeaderboard);

// Autorización horizontal: cada usuario solo consulta SU racha; el admin, todas.
// GET /api/gamification/:userId?year=2026&month=6
router.get('/gamification/:userId', requireAuth, requireSelfOrAdmin('userId'), ctrl.getUserGamification);

// GET /api/gamification/:userId/streak  (lightweight, for customer list cards)
router.get('/gamification/:userId/streak', requireAuth, requireSelfOrAdmin('userId'), ctrl.getUserStreak);

// GET /api/gamification/:userId/progress?months=3  (constancy chart + trophies)
router.get('/gamification/:userId/progress', requireAuth, requireSelfOrAdmin('userId'), ctrl.getUserProgress);

// ── Notification bell ────────────────────────────────────────────────────────
// Order matters: put /read-all and /all before /:id to avoid route shadowing.

// GET /api/user-notifications
router.get('/user-notifications', requireAuth, ctrl.listNotifications);

// PATCH /api/user-notifications/read-all
router.patch('/user-notifications/read-all', requireAuth, ctrl.markAllRead);

// PATCH /api/user-notifications/:id/read
router.patch('/user-notifications/:id/read', requireAuth, ctrl.markOneRead);

// DELETE /api/user-notifications/all
router.delete('/user-notifications/all', requireAuth, ctrl.deleteAllNotifications);

// DELETE /api/user-notifications/:id
router.delete('/user-notifications/:id', requireAuth, ctrl.deleteOneNotification);

module.exports = router;
