// src/jobs/inactivityJob.js
// Weekly cron job (Mondays): notify active users who haven't made a reservation
// in 4+ business days (Colombian calendar, Mon–Fri excluding holidays).
//
// Schedule: runs every Monday at 09:00 Bogotá time.
//   Cron expression: '0 9 * * 1'  (Monday, 9am)
//
// Flow per run:
//   1. Find all users with Active='Sí'.
//   2. For each, find their most recent reservation (any status/attendance).
//   3. If the most recent reservation date is 4+ business days before today,
//      and we haven't already sent an inactivity alert this week:
//       a. Create a UserNotification record (shows in bell icon) with a
//          randomized motivational message so it never feels repetitive.
//       b. Send a web-push notification to their subscribed devices.
//   4. Log a summary.
//
// Deduplication: we set a `dedupeKey` of 'inactivity-<userId>-<ISO-week>'
// so re-runs (restarts, retries) don't flood the user within the same week.

const cron = require('node-cron');
const moment = require('moment-timezone');
const User = require('../models/users');
const Reservation = require('../models/reservations');
const UserNotification = require('../models/userNotification');
const PushSubscription = require('../models/pushSubscription');
const { sendPush } = require('../lib/webPush');
const { businessDaysSince } = require('../utils/colombianHolidays');

const TZ = 'America/Bogota';
const INACTIVITY_THRESHOLD_DAYS = 4; // business days (no weekends, no holidays)

// Varied messages so the user never receives the exact same text twice in a row.
// Each entry: { title, body(firstName, days) }
const INACTIVITY_MESSAGES = [
  {
    title: '¡Tu cuerpo te extraña! 💪',
    body: (name, days) => `${name}, llevas ${days} días hábiles sin entrenar. Hoy es el mejor día para volver.`,
  },
  {
    title: 'La racha te espera 🔥',
    body: (name, days) => `${name}, ${days} días sin Bullfit. ¡Un solo entrenamiento cambia todo!`,
  },
  {
    title: 'Bullfit te necesita 🏋️',
    body: (name, days) => `Han pasado ${days} días hábiles, ${name}. Tu espacio en el gym te está esperando.`,
  },
  {
    title: '¿Todo bien? Te echamos de menos 👀',
    body: (name, days) => `${name}, ${days} días sin verte por aquí. ¡Vuelve y recupera tu racha!`,
  },
  {
    title: 'Semana nueva, nueva oportunidad 🚀',
    body: (name, days) => `${name}, esta semana es tuya. Llevas ${days} días sin entrenar — ¡rómpela hoy!`,
  },
  {
    title: 'No dejes que el hábito se enfríe ❄️➡️🔥',
    body: (name, days) => `${days} días hábiles sin Bullfit, ${name}. Cada sesión cuenta para tu racha.`,
  },
];

/**
 * Pick a message variant deterministically based on userId so that
 * different users get different messages in the same run, and the same
 * user rotates through all variants over consecutive weeks.
 */
function pickMessage(userId, weekNumber) {
  // Use last 4 chars of userId (hex) + week number to spread variants.
  const seed = parseInt(userId.slice(-4), 16) + weekNumber;
  return INACTIVITY_MESSAGES[seed % INACTIVITY_MESSAGES.length];
}

async function runInactivityCheck() {
  const now = moment.tz(TZ);
  const isoWeek = now.format('GGGG-[W]WW'); // e.g. "2026-W25"
  console.log(`[inactivity-job] Starting Monday check for week ${isoWeek}`);

  try {
    // 1. Fetch all active users.
    const activeUsers = await User.find({ Active: 'Sí' }, { _id: 1, FirstName: 1 }).lean();
    if (!activeUsers.length) {
      console.log('[inactivity-job] No active users found. Done.');
      return;
    }

    const weekNumber = now.isoWeek(); // 1–53
    let notified = 0;
    let skipped = 0;

    for (const user of activeUsers) {
      const userId = user._id.toString();
      // Deduplicate per ISO week (not per day) so Monday restarts don't re-fire.
      const dedupeKey = `inactivity-${userId}-${isoWeek}`;

      // Skip if already notified this week.
      const alreadySent = await UserNotification.exists({ dedupeKey });
      if (alreadySent) { skipped++; continue; }

      // Find most recent reservation.
      const lastReservation = await Reservation.findOne(
        { userId: user._id },
        { day: 1 },
      ).sort({ day: -1 }).lean();

      let daysSince;
      if (!lastReservation) {
        // No reservations ever — treat as fully inactive.
        daysSince = INACTIVITY_THRESHOLD_DAYS + 1;
      } else {
        daysSince = businessDaysSince(lastReservation.day);
      }

      if (daysSince < INACTIVITY_THRESHOLD_DAYS) { skipped++; continue; }

      // Pick a varied message for this user/week combination.
      const variant = pickMessage(userId, weekNumber);
      const firstName = (user.FirstName || 'campeón').split(' ')[0];
      const title = variant.title;
      const body = variant.body(firstName, daysSince);
      const url = `/reservations/${userId}`;

      const notif = await UserNotification.create({
        userId: user._id,
        title,
        body,
        type: 'inactivity',
        read: false,
        url,
        dedupeKey,
      });

      // Send web-push to all their subscriptions.
      const subs = await PushSubscription.find({ userId: user._id }).lean();
      const pushPayload = { title, body, url };

      for (const sub of subs) {
        const result = await sendPush(sub, pushPayload);
        if (result.gone) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }

      if (subs.length) {
        await UserNotification.updateOne({ _id: notif._id }, { $set: { pushSent: true } });
      }

      notified++;
    }

    console.log(`[inactivity-job] Done. Notified: ${notified}, Skipped: ${skipped}`);
  } catch (err) {
    console.error('[inactivity-job] Error during check:', err);
  }
}

/**
 * Start the scheduled inactivity job.
 * Call this once from app.js after the DB connection is open.
 */
function startInactivityJob() {
  // Run at 09:00 Bogotá time, every Monday only.
  cron.schedule('0 9 * * 1', runInactivityCheck, {
    timezone: TZ,
  });
  console.log('[inactivity-job] Scheduled: Mondays at 09:00 Bogotá');
}

module.exports = { startInactivityJob, runInactivityCheck };
