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
 * Compute streak data for a user from their attendance history.
 *
 * @param {string} userId  - Mongoose ObjectId string
 * @returns {Object} { currentStreak, longestStreak, totalActivities,
 *                     streakStartDate, lastAttendedDate }
 */
async function computeStreak(userId, sinceDay = null) {
  // Fetch attended reservations, oldest first. When `sinceDay` is given
  // (YYYY-MM-DD), only count attendance on/after it — used for the trophy
  // streak, which starts counting from the launch date.
  const query = { userId, Attendance: 'Si' };
  if (sinceDay) query.day = { $gte: sinceDay };
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

  // Group attended days by ISO week key, counting only distinct business days.
  const weekMap = {}; // weekKey → Set of day strings
  for (const r of attended) {
    if (!isBusinessDay(r.day)) continue; // skip if somehow on a holiday/weekend
    const k = weekKey(r.day);
    if (!weekMap[k]) weekMap[k] = new Set();
    weekMap[k].add(r.day);
  }

  // Sort weeks chronologically.
  const sortedWeeks = Object.keys(weekMap).sort();
  if (!sortedWeeks.length) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalActivities: 0,
      streakStartDate: null,
      lastAttendedDate: null,
    };
  }

  const MIN_DAYS = 3; // days required per week to count as "complete"

  const todayKey = weekKey(moment.tz(TZ).format('YYYY-MM-DD'));

  // Build list of { key, complete, start, days } for each week that has attendance.
  const weekList = sortedWeeks.map((k) => ({
    key: k,
    days: weekMap[k].size,
    complete: weekMap[k].size >= MIN_DAYS,
    start: moment.tz(k, 'GGGG-[W]WW', TZ).startOf('isoWeek').format('YYYY-MM-DD'),
  }));

  // Walk the sorted week list and find consecutive complete-week runs.
  // We consider two weeks "consecutive" if no complete intermediate week
  // was skipped. If a week was entirely skipped (no attendance at all) and
  // was in the past, the streak resets — UNLESS we decide to be lenient.
  // For Bullfit we use STRICT consecutive: any gap week (past, fully elapsed,
  // no attendance or < 3 days) resets the counter.

  let best = 0;
  let bestStart = null;
  let run = 0;
  let runStart = null;
  let prevKey = null;

  // Helper: week keys between two keys (exclusive, to detect gaps).
  function weeksBetween(keyA, keyB) {
    let cur = moment.tz(keyA, 'GGGG-[W]WW', TZ).add(1, 'week');
    const end = moment.tz(keyB, 'GGGG-[W]WW', TZ);
    const gaps = [];
    while (cur.isBefore(end)) {
      gaps.push(cur.format('GGGG-[W]WW'));
      cur.add(1, 'week');
    }
    return gaps;
  }

  for (const w of weekList) {
    const isCurrentOrFuture = w.key >= todayKey;
    const gapWeeks = prevKey ? weeksBetween(prevKey, w.key) : [];
    const hasGap = gapWeeks.length > 0;

    if (hasGap || (!w.complete && !isCurrentOrFuture)) {
      // Streak resets.
      if (run > best) { best = run; bestStart = runStart; }
      run = w.complete ? 1 : 0;
      runStart = w.complete ? w.start : null;
    } else if (w.complete) {
      run++;
      if (!runStart) runStart = w.start;
    }
    // Incomplete current week: don't reset — user still has days to attend.
    prevKey = w.key;
  }
  if (run > best) { best = run; bestStart = runStart; }

  // Current streak = last run value (if the last week was complete or is current).
  const lastWeek = weekList[weekList.length - 1];
  let currentStreak = 0;
  let currentStreakStart = null;

  if (lastWeek.complete || lastWeek.key >= todayKey) {
    // Re-walk to get the final consecutive run from the end.
    let cur2 = 0;
    let cur2Start = null;
    let prev2 = null;
    for (const w of weekList) {
      const isCurrentOrFuture2 = w.key >= todayKey;
      const gap2 = prev2 ? weeksBetween(prev2, w.key).length > 0 : false;
      if (gap2 || (!w.complete && !isCurrentOrFuture2)) {
        cur2 = w.complete ? 1 : 0;
        cur2Start = w.complete ? w.start : null;
      } else if (w.complete) {
        cur2++;
        if (!cur2Start) cur2Start = w.start;
      }
      prev2 = w.key;
    }
    currentStreak = cur2;
    currentStreakStart = cur2Start;
  }

  // Total activities in the current streak period.
  let totalActivities = 0;
  if (currentStreakStart) {
    totalActivities = attended.filter((r) => r.day >= currentStreakStart).length;
  }

  const longestStreak = Math.max(best, currentStreak);
  const lastAttendedDate = attended[attended.length - 1].day;

  return {
    currentStreak,
    longestStreak,
    totalActivities,
    streakStartDate: currentStreakStart,
    lastAttendedDate,
  };
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

  // All-time streak (drives the calendar / "mejor racha").
  const data = await computeStreak(userId);
  // Trophy streak: only counts from the launch date.
  const trophyData = await computeStreak(userId, TROPHIES_START);
  const trophyLongest = trophyData.longestStreak || 0;

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
        body: `Desbloqueaste "${t.name}" (${t.label} de racha). ${t.description}`,
        url: '/#trofeos',
        type: 'achievement',
        dedupeKey: `trophy-${userId}-${t.key}`,
      }).catch((err) => console.error('[gamification] trophy notify failed:', err.message));

      // → every admin
      for (const a of admins) {
        notifyUser(a._id, {
          title: 'Medalla desbloqueada 🏆',
          body: `${userName || 'Un usuario'} desbloqueó "${t.name}" (${t.label} de racha).`,
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
  const dayMap = {};
  for (const r of reservations) {
    // If multiple reservations same day, prefer 'Si'
    if (!dayMap[r.day] || r.Attendance === 'Si') {
      dayMap[r.day] = {
        attended: r.Attendance === 'Si',
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
    weeks.push({
      weekKey: weekKey(weekDays[0].date),
      days: weekDays,
      daysAttended,
      complete: daysAttended >= 3,
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
  updateUserStreak,
  buildCalendarMonth,
  getMonthlyAttendance,
  getTrophyStreakWeeks,
};
