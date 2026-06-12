// src/jobs/inactivityJob.js
// Daily cron job: notify active users who haven't made a reservation in
// 3 or more business days (Colombian calendar, Mon–Fri excluding holidays).
//
// Schedule: runs every weekday at 09:00 Bogotá time.
//   Cron expression: '0 9 * * 1-5'  (Mon–Fri, 9am)
//
// Flow per run:
//   1. Find all users with Active='Sí'.
//   2. For each, find their most recent reservation (any status/attendance).
//   3. If the most recent reservation date is 3+ business days before today,
//      and we haven't already sent an inactivity alert today:
//       a. Create a UserNotification record (shows in bell icon).
//       b. Send a web-push notification to their subscribed devices.
//   4. Log a summary.
//
// Deduplication: we set a `dedupeKey` of 'inactivity-<userId>-<today>' so
// re-runs (restarts, retries) don't flood the user with duplicates.

const cron = require('node-cron');
const moment = require('moment-timezone');
const User = require('../models/users');
const Reservation = require('../models/reservations');
const UserNotification = require('../models/userNotification');
const PushSubscription = require('../models/pushSubscription');
const { sendPush } = require('../lib/webPush');
const { businessDaysSince } = require('../utils/colombianHolidays');

const TZ = 'America/Bogota';
const INACTIVITY_THRESHOLD_DAYS = 3;

async function runInactivityCheck() {
  const today = moment.tz(TZ).format('YYYY-MM-DD');
  console.log(`[inactivity-job] Starting check for ${today}`);

  try {
    // 1. Fetch all active users.
    const activeUsers = await User.find({ Active: 'Sí' }, { _id: 1, FirstName: 1 }).lean();
    if (!activeUsers.length) {
      console.log('[inactivity-job] No active users found. Done.');
      return;
    }

    let notified = 0;
    let skipped = 0;

    for (const user of activeUsers) {
      const userId = user._id.toString();
      const dedupeKey = `inactivity-${userId}-${today}`;

      // Skip if already notified today.
      const alreadySent = await UserNotification.exists({ dedupeKey });
      if (alreadySent) { skipped++; continue; }

      // Find most recent reservation.
      const lastReservation = await Reservation.findOne(
        { userId: user._id },
        { day: 1 },
      ).sort({ day: -1 }).lean();

      let daysSince;
      if (!lastReservation) {
        // No reservations ever — use registration date or treat as very inactive.
        daysSince = INACTIVITY_THRESHOLD_DAYS + 1;
      } else {
        daysSince = businessDaysSince(lastReservation.day);
      }

      if (daysSince < INACTIVITY_THRESHOLD_DAYS) { skipped++; continue; }

      // Create notification in the bell inbox.
      const title = 'Te extrañamos en Bullfit 🔥';
      const body = `${user.FirstName}, llevas ${daysSince} días sin entrenar. ¡Tu racha te espera!`;
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
          // Clean up dead subscription.
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }

      // Mark push as sent on the notification record.
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
  // Run at 09:00 Bogotá time, Mon–Fri.
  cron.schedule('0 9 * * 1-5', runInactivityCheck, {
    timezone: TZ,
  });
  console.log('[inactivity-job] Scheduled: weekdays at 09:00 Bogotá');
}

module.exports = { startInactivityJob, runInactivityCheck };
