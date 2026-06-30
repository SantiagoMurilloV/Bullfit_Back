// src/services/gamificationService.js
// Core streak + calendar logic for the Bullfit gamification system.
//
// STREAK DEFINITION
//   A "week" runs Monday through Friday (Colombian business days only).
//   A week is COMPLETE if the user attended (Attendance='Si') at least 3
//   different business days in that Mon-Fri window.
//   The streak = number of consecutive COMPLETE weeks ending at the most
//   recent fully-elapsed week or the current in-progress week (counted
//   if it already has 3+ days regardless of whether it's finished).
//
// CALENDAR DATA
//   For the profile calendar view, we return one or more months worth of
//   days annotated with attendance status, grouped by ISO week.

const moment = require('moment-timezone');
const Reservation = require('../models/reservations');
const UserStreak = require('../models/userStreak');
const { isBusinessDay } = require('../utils/colombianHolidays');
const User = require('../models/users');
const { newlyUnlockedTrophies, TROPHIES_START } = require('../lib/trophies');
const { notifyUser } = require('../lib/notifyUser');

const TZ = 'America/Bogota';

const MONTH_LABELS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the week has at least 3 business-day attendances,
 * regardless of whether they are consecutive.
 *
 * Examples:
 *   Mon, Tue, Thu  → true  (3 days, no need to be consecutive)
 *   Mon, Wed, Fri  → true
 *   Mon, Tue       → false (only 2)
 */
function hasThreeConsecutive(attendedSet) {
  return attendedSet.size >= 3;
}

/** Monday of the ISO week that contains `dateStr`. */
function weekStart(dateStr) {
  return moment.tz(dateStr, TZ).startOf('isoWeek').format('YYYY-MM-DD');
}

/** Friday of the ISO week that contains `dateStr`. */
function weekEnd(dateStr) {
  return moment.tz(dateStr, TZ).startOf('isoWeek').add(4, 'days').format('YYYY-MM-DD');
}

/** Key for grouping: 'YYYY-[W]WW' (ISO week string). */
function weekKey(dateStr) {
  return moment.tz(dateStr, TZ).format('GGGG-[W]WW');
}

// ─── Core Streak Calculator ──────────────────────────────────────────────────

/**
 * Pure streak calculation from an already-loaded array of day strings.
 * No DB calls — used by the bulk endpoint to avoid N queries.
 */
function computeStreakFromDays(attendedDays) {
  const today = moment.tz(TZ).format('YYYY-MM-DD');
  const todayKey = weekKey(today);
  const weekMap = {};
  for (const day of attendedDays) {
    if (day > today) continue;            // ignorar reservas futuras (las medallas/racha nunca cuentan el futuro)
    if (day < TROPHIES_START) continue;   // el juego de rachas arranca en la fecha de lanzamiento: todos parten de cero
    if (!isBusinessDay(day)) continue;
    const k = weekKey(day);
    if (!weekMap[k]) weekMap[k] = new Set();
    weekMap[k].add(day);
  }
  if (!Object.keys(weekMap).length) return 0;

  // Walk backwards from current week. Each week must be complete (3 consecutive
  // business days attended). The current in-progress week is skipped if incomplete
  // — the user still has time. Any past week that is incomplete OR has no attendance
  // breaks the streak immediately.
  const prevWeekKey = moment.tz(TZ).startOf('isoWeek').subtract(1, 'week').format('GGGG-[W]WW');
  let streak = 0;
  let checkKey = prevWeekKey; // start from last fully-elapsed week

  // First, optionally count current week if already complete
  if (weekMap[todayKey] && hasThreeConsecutive(weekMap[todayKey])) {
    streak++;
    // then continue from prevWeek
  }

  // Walk backwards one week at a time
  while (true) {
    const set = weekMap[checkKey];
    if (!set || !hasThreeConsecutive(set)) break; // missing or incomplete → streak over
    streak++;
    checkKey = moment.tz(checkKey, 'GGGG-[W]WW', TZ).subtract(1, 'week').format('GGGG-[W]WW');
  }

  return streak;
}

/**
 * Compute streak data for a user from their attendance history.
 *
 * @param {string} userId  - Mongoose ObjectId string
 * @returns {Object} { currentStreak, longestStreak, totalActivities,
 *                     streakStartDate, lastAttendedDate }
 */
async function computeStreak(userId, sinceDay = null) {
  // Fetch attended reservations, oldest first.
  //  - `day <= today` => las medallas/racha NUNCA cuentan reservas futuras.
  //  - `day >= floor` => toda la racha arranca en la fecha de lanzamiento del
  //    juego (TROPHIES_START): todos parten de cero el 1 de julio. `sinceDay`,
  //    si se pasa, solo puede mover el piso hacia adelante, nunca antes.
  const today = moment.tz(TZ).format('YYYY-MM-DD');
  const floorDay = sinceDay && sinceDay > TROPHIES_START ? sinceDay : TROPHIES_START;
  const query = { userId, Attendance: { $ne: 'No' }, day: { $gte: floorDay, $lte: today } };
  const attended = await Reservation.find(
    query,
    { day: 1, _id: 0 },
  ).sort({ day: 1 }).lean();

  if (!attended.length) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalActivities: 0,
      streakStartDate: null,
      lastAttendedDate: null,
    };
  }

  // Group attended days by ISO week, business days only.
  const weekMap = {};
  for (const r of attended) {
    if (!isBusinessDay(r.day)) continue;
    const k = weekKey(r.day);
    if (!weekMap[k]) weekMap[k] = new Set();
    weekMap[k].add(r.day);
  }

  if (!Object.keys(weekMap).length) {
    return { currentStreak: 0, longestStreak: 0, totalActivities: 0, streakStartDate: null, lastAttendedDate: null };
  }

  const todayKey  = weekKey(today);
  const prevWeekKey = moment.tz(TZ).startOf('isoWeek').subtract(1, 'week').format('GGGG-[W]WW');

  // ── Current streak: walk backwards week by week from today ───────────────
  // Current week counts only if already complete (3 consecutive).
  // Previous weeks must each be complete with no gap — one missing week → 0.
  let currentStreak = 0;
  let currentStreakStart = null;

  let checkKey = todayKey;
  // Skip current week if incomplete (user still has time); still start there.
  if (weekMap[checkKey] && hasThreeConsecutive(weekMap[checkKey])) {
    currentStreak++;
    currentStreakStart = moment.tz(checkKey, 'GGGG-[W]WW', TZ).startOf('isoWeek').format('YYYY-MM-DD');
  }
  // Walk backwards through previous weeks
  checkKey = prevWeekKey;
  while (true) {
    const set = weekMap[checkKey];
    if (!set || !hasThreeConsecutive(set)) break;
    currentStreak++;
    currentStreakStart = moment.tz(checkKey, 'GGGG-[W]WW', TZ).startOf('isoWeek').format('YYYY-MM-DD');
    checkKey = moment.tz(checkKey, 'GGGG-[W]WW', TZ).subtract(1, 'week').format('GGGG-[W]WW');
  }

  // ── Longest streak: forward pass through all weeks with attendance ────────
  // Weeks with no attendance between two attended weeks count as a break.
  const sortedWeeks = Object.keys(weekMap).sort();
  let best = 0;
  let run = 0;
  let runStart = null;
  let prevKey = null;

  for (const k of sortedWeeks) {
    const complete = hasThreeConsecutive(weekMap[k]);
    // Gap = skipped week(s) between prevKey and k
    const gap = prevKey
      ? moment.tz(k, 'GGGG-[W]WW', TZ).diff(moment.tz(prevKey, 'GGGG-[W]WW', TZ), 'weeks') > 1
      : false;

    if (gap || !complete) {
      if (run > best) { best = run; }
      run = complete ? 1 : 0;
      runStart = complete ? moment.tz(k, 'GGGG-[W]WW', TZ).startOf('isoWeek').format('YYYY-MM-DD') : null;
    } else {
      run++;
      if (!runStart) runStart = moment.tz(k, 'GGGG-[W]WW', TZ).startOf('isoWeek').format('YYYY-MM-DD');
    }
    prevKey = k;
  }
  if (run > best) best = run;

  const longestStreak = Math.max(best, currentStreak);

  // Total activities since start of current streak
  let totalActivities = 0;
  if (currentStreakStart) {
    totalActivities = attended.filter((r) => r.day >= currentStreakStart).length;
  }

  const lastAttendedDate = attended[attended.length - 1].day;

  return { currentStreak, longestStreak, totalActivities, streakStartDate: currentStreakStart, lastAttendedDate };
}

// ─── Streak Updater ──────────────────────────────────────────────────────────

/**
 * Recompute and persist streak data for `userId` in UserStreak.
 * Called after every attendance update.
 */
async function updateUserStreak(userId) {
  // Capture the previous trophy streak so we can detect newly-crossed trophy
  // thresholds after recomputing.
  const existing = await UserStreak.findOne(
    { userId },
    { trophyLongestStreak: 1 },
  ).lean();
  const prevTrophy = existing ? (existing.trophyLongestStreak || 0) : 0;

  // Streak shown in the calendar / "mejor racha". Since computeStreak now floors
  // every streak at the launch date (TROPHIES_START), the displayed streak and
  // the trophy streak coincide — no need to compute it twice.
  const data = await computeStreak(userId);
  const trophyLongest = data.longestStreak || 0;

  const streakDoc = await UserStreak.findOneAndUpdate(
    { userId },
    {
      $set: {
        ...data,
        trophyLongestStreak: trophyLongest,
        lastComputedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Celebrate any trophy whose threshold the user just crossed — but only once
  // the trophy system is live (TROPHIES_START). Before that, no unlock fires.
  const trophiesLive = moment.tz(TZ).format('YYYY-MM-DD') >= TROPHIES_START;
  const unlocked = trophiesLive ? newlyUnlockedTrophies(prevTrophy, trophyLongest) : [];

  if (unlocked.length) {
    // Resolve the achiever's name and the admin list once for this batch.
    let userName = '';
    let admins = [];
    try {
      const u = await User.findById(userId).select('FirstName LastName').lean();
      if (u) userName = `${u.FirstName || ''} ${u.LastName || ''}`.trim();
      admins = await User.find({ role: 'admin' }).select('_id').lean();
    } catch (err) {
      console.error('[gamification] trophy notify lookup failed:', err.message);
    }

    for (const t of unlocked) {
      // → the user who unlocked it
      notifyUser(userId, {
        title: '¡Nuevo trofeo! 🏆',
        body: `Desbloqueaste el trofeo "${t.name}". ${t.description}`,
        url: '/#trofeos',
        type: 'achievement',
        dedupeKey: `trophy-${userId}-${t.key}`,
      }).catch((err) => console.error('[gamification] trophy notify failed:', err.message));

      // → every admin
      for (const a of admins) {
        notifyUser(a._id, {
          title: 'Medalla desbloqueada 🏆',
          body: `${userName || 'Un usuario'} desbloqueó el trofeo "${t.name}".`,
          url: '/',
          type: 'achievement',
          dedupeKey: `trophy-admin-${a._id}-${userId}-${t.key}`,
        }).catch((err) => console.error('[gamification] admin trophy notify failed:', err.message));
      }
    }
  }

  return streakDoc;
}

// ─── Monthly Attendance (constancy chart) ────────────────────────────────────

/**
 * Count attended sessions per calendar month for the last `months` months
 * (including the current one), oldest first. Used by the profile constancy
 * chart.
 *
 * @param {string} userId
 * @param {number} months  - how many months back (default 3, max 12)
 * @returns {Promise<Array<{ month: string, label: string, attended: number }>>}
 */
async function getMonthlyAttendance(userId, months = 3) {
  const n = Math.max(1, Math.min(Number(months) || 3, 12));
  const now = moment.tz(TZ);

  // Build empty buckets for the last n months, chronological.
  const buckets = [];
  const indexByMonth = {};
  for (let i = n - 1; i >= 0; i--) {
    const m = now.clone().subtract(i, 'months');
    const ym = m.format('YYYY-MM');
    indexByMonth[ym] = buckets.length;
    buckets.push({ month: ym, label: MONTH_LABELS_ES[m.month()], attended: 0 });
  }

  const startDay = `${buckets[0].month}-01`;
  const attended = await Reservation.find(
    { userId, Attendance: 'Si', day: { $gte: startDay } },
    { day: 1, _id: 0 },
  ).lean();

  for (const r of attended) {
    const ym = (r.day || '').slice(0, 7);
    const idx = indexByMonth[ym];
    if (idx !== undefined) buckets[idx].attended += 1;
  }

  return buckets;
}

// ─── Calendar Builder ────────────────────────────────────────────────────────

/**
 * Build calendar data for a user for a given month.
 * Returns an array of week rows, each containing day annotations.
 *
 * @param {string} userId
 * @param {number} year   - e.g. 2026
 * @param {number} month  - 1-based (1=Jan)
 * @returns {Object} { year, month, weeks: [{ weekNum, days: [...], daysAttended, complete }] }
 */
async function buildCalendarMonth(userId, year, month) {
  const monthStr = String(month).padStart(2, '0');
  const startOfMonth = `${year}-${monthStr}-01`;
  const endOfMonth = moment.tz(startOfMonth, TZ).endOf('month').format('YYYY-MM-DD');

  // Fetch reservations for this user in this month.
  const reservations = await Reservation.find(
    { userId, day: { $gte: startOfMonth, $lte: endOfMonth } },
    { day: 1, Attendance: 1, TrainingType: 1, _id: 0 },
  ).lean();

  // Build lookup: day → { attended, trainingType }
  // A day counts as attended unless Attendance is explicitly 'No'.
  const dayMap = {};
  for (const r of reservations) {
    const isNo = r.Attendance === 'No';
    const isAttended = !isNo;
    // If multiple reservations same day, prefer an attended one
    if (!dayMap[r.day] || isAttended) {
      dayMap[r.day] = {
        attended: isAttended,
        hasReservation: true,
        trainingType: r.TrainingType || null,
      };
    }
  }

  // Build all days of the month.
  const days = [];
  let cur = moment.tz(startOfMonth, TZ);
  const end = moment.tz(endOfMonth, TZ);
  while (cur.isSameOrBefore(end, 'day')) {
    const d = cur.format('YYYY-MM-DD');
    const dow = cur.isoWeekday(); // 1=Mon, 7=Sun
    const isBiz = isBusinessDay(d);
    days.push({
      date: d,
      day: cur.date(),
      dayOfWeek: dow,
      isWeekend: dow >= 6,
      isBusinessDay: isBiz,
      ...(dayMap[d] || { attended: false, hasReservation: false, trainingType: null }),
    });
    cur.add(1, 'day');
  }

  // Group days into ISO weeks (Mon–Sun), include padding from prev/next months.
  const firstDay = moment.tz(startOfMonth, TZ);
  const lastDay = moment.tz(endOfMonth, TZ);

  // Pad start to Monday of first week.
  let weekStart2 = firstDay.clone().startOf('isoWeek');
  // Pad end to Sunday of last week.
  let weekEnd2 = lastDay.clone().endOf('isoWeek');

  const allDays = [];
  let c = weekStart2.clone();
  while (c.isSameOrBefore(weekEnd2, 'day')) {
    const d = c.format('YYYY-MM-DD');
    const isInMonth = c.month() === firstDay.month();
    const dow = c.isoWeekday();
    const isBiz = isBusinessDay(d);
    if (isInMonth) {
      // Use the annotation we already computed.
      const existing = days.find((x) => x.date === d);
      allDays.push(existing || { date: d, day: c.date(), dayOfWeek: dow, isWeekend: dow >= 6, isBusinessDay: isBiz, attended: false, hasReservation: false, trainingType: null, isInMonth: true });
    } else {
      allDays.push({ date: d, day: c.date(), dayOfWeek: dow, isWeekend: dow >= 6, isBusinessDay: isBiz, attended: false, hasReservation: false, trainingType: null, isInMonth: false });
    }
    if (allDays[allDays.length - 1].isInMonth === undefined) allDays[allDays.length - 1].isInMonth = true;
    c.add(1, 'day');
  }

  // Split into weeks (7-day chunks starting Monday).
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) {
    const weekDays = allDays.slice(i, i + 7);
    const bizDays = weekDays.filter((d) => d.isBusinessDay && d.isInMonth !== false);
    const daysAttended = bizDays.filter((d) => d.attended).length;
    const attendedSet = new Set(bizDays.filter((d) => d.attended).map((d) => d.date));
    weeks.push({
      weekKey: weekKey(weekDays[0].date),
      days: weekDays,
      daysAttended,
      complete: hasThreeConsecutive(attendedSet),
    });
  }

  return { year: Number(year), month: Number(month), weeks };
}

/**
 * Best streak (in weeks) counted only from the trophy launch date.
 * Drives which medals are unlocked. Returns 0 before the launch date.
 */
async function getTrophyStreakWeeks(userId) {
  const s = await computeStreak(userId, TROPHIES_START);
  return s.longestStreak || 0;
}

module.exports = {
  computeStreak,
  computeStreakFromDays,
  updateUserStreak,
  buildCalendarMonth,
  getMonthlyAttendance,
  getTrophyStreakWeeks,
};
