// src/controllers/gamification_controller.js
// Endpoints for the Bullfit gamification system:
//   GET  /api/gamification/:userId          - streak + calendar for a user
//   GET  /api/gamification/:userId/streak   - streak data only (lightweight)
//   GET  /api/user-notifications            - bell inbox for the logged-in user
//   PATCH /api/user-notifications/:id/read  - mark one notification as read
//   PATCH /api/user-notifications/read-all  - mark all as read
//   DELETE /api/user-notifications/:id      - delete one notification
//   DELETE /api/user-notifications/all      - delete all for user

const moment = require('moment-timezone');
const UserStreak = require('../models/userStreak');
const UserNotification = require('../models/userNotification');
const { computeStreak, buildCalendarMonth, getMonthlyAttendance, getTrophyStreakWeeks } = require('../services/gamificationService');

const TZ = 'America/Bogota';

// ─── Streak + Calendar ───────────────────────────────────────────────────────

/**
 * GET /api/gamification/:userId
 * Query params: ?year=2026&month=6   (defaults to current month)
 *
 * Returns streak data + calendar grid for the requested month.
 */
exports.getUserGamification = async (req, res) => {
  try {
    const { userId } = req.params;
    const now = moment.tz(TZ);
    const year = Number(req.query.year) || now.year();
    const month = Number(req.query.month) || now.month() + 1; // 1-based

    // Try cached streak first; fall back to live computation.
    let streak = await UserStreak.findOne({ userId }).lean();
    if (!streak) {
      streak = await computeStreak(userId);
    }

    const calendar = await buildCalendarMonth(userId, year, month);

    return res.json({ streak, calendar });
  } catch (err) {
    console.error('[gamification] getUserGamification error:', err);
    return res.status(500).json({ message: 'Error al obtener datos de gamificación' });
  }
};

/**
 * GET /api/gamification/:userId/streak
 * Lightweight — just streak numbers, no calendar grid.
 */
exports.getUserStreak = async (req, res) => {
  try {
    const { userId } = req.params;
    let streak = await UserStreak.findOne({ userId }).lean();
    if (!streak) {
      streak = await computeStreak(userId);
    }
    return res.json(streak);
  } catch (err) {
    console.error('[gamification] getUserStreak error:', err);
    return res.status(500).json({ message: 'Error al obtener racha' });
  }
};

/**
 * GET /api/gamification/:userId/progress?months=3
 *
 * One call powering the profile "Progreso" + "Trofeos" tabs:
 *   - streak:  best/current streak (longestStreak drives trophy unlocks)
 *   - monthly: attended sessions per month for the constancy chart
 */
exports.getUserProgress = async (req, res) => {
  try {
    const { userId } = req.params;
    const months = Number(req.query.months) || 3;

    let streak = await UserStreak.findOne({ userId }).lean();
    if (!streak) {
      streak = await computeStreak(userId);
    }
    const monthly = await getMonthlyAttendance(userId, months);
    // Streak that counts only from the trophy launch date — drives medals.
    const trophyWeeks = await getTrophyStreakWeeks(userId);

    return res.json({ streak, monthly, trophyWeeks });
  } catch (err) {
    console.error('[gamification] getUserProgress error:', err);
    return res.status(500).json({ message: 'Error al obtener el progreso' });
  }
};

// ─── Notification Bell ───────────────────────────────────────────────────────

/**
 * GET /api/user-notifications
 * Returns notifications for the authenticated user.
 * Query: ?limit=30&offset=0
 */
exports.listNotifications = async (req, res) => {
  try {
    const userId = req.auth.sub;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Number(req.query.offset) || 0;

    const [notifications, unreadCount] = await Promise.all([
      UserNotification.find({ userId })
        .sort({ read: 1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      UserNotification.countDocuments({ userId, read: false }),
    ]);

    return res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('[gamification] listNotifications error:', err);
    return res.status(500).json({ message: 'Error al obtener notificaciones' });
  }
};

/**
 * PATCH /api/user-notifications/read-all
 * Mark all unread notifications as read for the authenticated user.
 */
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.auth.sub;
    await UserNotification.updateMany({ userId, read: false }, { $set: { read: true } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[gamification] markAllRead error:', err);
    return res.status(500).json({ message: 'Error al marcar notificaciones' });
  }
};

/**
 * PATCH /api/user-notifications/:id/read
 * Mark a single notification as read.
 */
exports.markOneRead = async (req, res) => {
  try {
    const userId = req.auth.sub;
    const notif = await UserNotification.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { read: true } },
      { new: true },
    );
    if (!notif) return res.status(404).json({ message: 'Notificación no encontrada' });
    return res.json(notif);
  } catch (err) {
    console.error('[gamification] markOneRead error:', err);
    return res.status(500).json({ message: 'Error al actualizar notificación' });
  }
};

/**
 * DELETE /api/user-notifications/all
 * Delete all notifications for the authenticated user.
 */
exports.deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.auth.sub;
    await UserNotification.deleteMany({ userId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[gamification] deleteAllNotifications error:', err);
    return res.status(500).json({ message: 'Error al borrar notificaciones' });
  }
};

/**
 * DELETE /api/user-notifications/:id
 * Delete a single notification belonging to the authenticated user.
 */
exports.deleteOneNotification = async (req, res) => {
  try {
    const userId = req.auth.sub;
    const notif = await UserNotification.findOneAndDelete({ _id: req.params.id, userId });
    if (!notif) return res.status(404).json({ message: 'Notificación no encontrada' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[gamification] deleteOneNotification error:', err);
    return res.status(500).json({ message: 'Error al borrar notificación' });
  }
};
