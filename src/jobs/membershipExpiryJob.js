// src/jobs/membershipExpiryJob.js
// Daily cron job: remind users whose monthly membership (Plan 'Mensual')
// expires in 2 days, so they renew on time.
//
// Schedule: every day at 09:00 Bogotá time. Cron: '0 9 * * *'.
//
// Flow per run:
//   1. Compute target date = today + 2 days (Bogotá), as 'YYYY-MM-DD'.
//   2. Find Mensual finances whose endDate equals EXACTLY that target.
//      Matching the exact date is what keeps us on the *current* period:
//      a stale record from months/years ago has an old endDate and simply
//      won't match, so we never pick the wrong endDate.
//   3. Skip the reminder if the user already has a Mensual record with a
//      later endDate (they already renewed/extended).
//   4. Notify (bell inbox + web-push) via notifyUser, deduped per period.
//
// endDate is stored as 'yyyy-MM-dd' (see finances_controllers.financesUser
// and the frontend Finances.jsx date pickers).

const cron = require('node-cron');
const moment = require('moment-timezone');
const UserFinance = require('../models/finances');
const User = require('../models/users');
const UserNotification = require('../models/userNotification');
const { notifyUser } = require('../lib/notifyUser');

const TZ = 'America/Bogota';
const DAYS_BEFORE = 2;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// '2026-06-30' -> '30 de junio'
const humanizeDate = (isoDate) => {
  const m = moment.tz(isoDate, 'YYYY-MM-DD', TZ);
  if (!m.isValid()) return isoDate;
  return `${m.date()} de ${MESES[m.month()]}`;
};

async function runMembershipExpiryCheck() {
  const target = moment.tz(TZ).add(DAYS_BEFORE, 'days').format('YYYY-MM-DD');
  console.log(`[membership-expiry-job] Checking memberships ending on ${target}`);

  try {
    // Only the records whose period ends exactly on the target date — this is
    // always the current/nearest one, never an old endDate.
    const expiring = await UserFinance.find(
      { Plan: 'Mensual', endDate: target },
      { _id: 1, userId: 1, endDate: 1, FirstName: 1 },
    ).lean();

    if (!expiring.length) {
      console.log('[membership-expiry-job] No memberships expiring. Done.');
      return;
    }

    let notified = 0;
    let skipped = 0;

    for (const finance of expiring) {
      if (!finance.userId) { skipped++; continue; }

      const dedupeKey = `membership-expiry-${finance._id}-${target}`;

      // Don't re-notify on job restarts/retries.
      const alreadySent = await UserNotification.exists({ dedupeKey });
      if (alreadySent) { skipped++; continue; }

      // If the user already has a membership ending later, they've renewed —
      // skip the reminder. (String date compare works for 'YYYY-MM-DD'.)
      const renewed = await UserFinance.exists({
        userId: finance.userId,
        Plan: 'Mensual',
        endDate: { $gt: target },
      });
      if (renewed) { skipped++; continue; }

      // Prefer the live user name; fall back to the denormalized finance name.
      const user = await User.findById(finance.userId).select('FirstName').lean();
      const name = (user && user.FirstName) || finance.FirstName || '';
      const greeting = name ? `${name}, ` : '';

      await notifyUser(finance.userId, {
        title: 'Tu mensualidad está por vencer ⏳',
        body: `${greeting}tu mensualidad vence el ${humanizeDate(finance.endDate)}. No dejes que nada te detenga — renuévala y mantén el ritmo que traes. ¡En Bullfit te esperamos! 💪`,
        url: '/',
        type: 'system',
        dedupeKey,
      });

      notified++;
    }

    console.log(`[membership-expiry-job] Done. Notified: ${notified}, Skipped: ${skipped}`);
  } catch (err) {
    console.error('[membership-expiry-job] Error during check:', err);
  }
}

/**
 * Start the scheduled membership-expiry job.
 * Call once from app.js after the DB connection is open.
 */
function startMembershipExpiryJob() {
  cron.schedule('0 9 * * *', runMembershipExpiryCheck, { timezone: TZ });
  console.log('[membership-expiry-job] Scheduled: daily at 09:00 Bogotá');
}

module.exports = { startMembershipExpiryJob, runMembershipExpiryCheck };
