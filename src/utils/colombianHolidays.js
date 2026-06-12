// src/utils/colombianHolidays.js
// Colombian public holidays (festivos) for 2024-2028.
//
// Colombia has two types of holidays (Ley 51/1983 and Ley Emiliani/1983):
//   - Fixed: same calendar date every year.
//   - Movable (Emiliani): if not on Monday, moved to the next Monday.
//
// Movable holidays that apply Emiliani:
//   Epiphany (Jan 6), Saint Joseph (Mar 19), Peter & Paul (Jun 29),
//   Columbus Day (Oct 12), All Saints (Nov 1), Cartagena Independence (Nov 11).
//
// Easter-dependent movable holidays (do NOT apply Emiliani — exact date):
//   Holy Thursday (-3d), Good Friday (-2d), Ascension (+39d),
//   Corpus Christi (+60d), Sacred Heart (+68d).
//
// Exported API:
//   isColombianHoliday(dateString) → Boolean
//   isBusinessDay(dateString)      → Boolean  (Mon–Fri, not holiday)
//   countBusinessDays(startStr, endStr) → Number  (inclusive)
//   addBusinessDays(dateString, n) → 'YYYY-MM-DD'  (n business days later)

const moment = require('moment-timezone');

// ─── Easter (Anonymous Gregorian algorithm) ──────────────────────────────────
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return moment.tz({ year, month: month - 1, date: day }, 'America/Bogota');
}

// Move to the following Monday if not already Monday (Ley Emiliani).
function nextMonday(m) {
  const dow = m.isoWeekday(); // 1=Mon … 7=Sun
  if (dow === 1) return m.clone();
  return m.clone().add(8 - dow, 'days');
}

// Format moment as YYYY-MM-DD string.
function fmt(m) {
  return m.format('YYYY-MM-DD');
}

// ─── Holiday set builder for a given year ────────────────────────────────────
function buildHolidaysForYear(year) {
  const y = Number(year);
  const holidays = new Set();

  // — Fixed holidays —
  holidays.add(`${y}-01-01`); // New Year
  holidays.add(`${y}-05-01`); // Labor Day
  holidays.add(`${y}-07-20`); // Independence Day
  holidays.add(`${y}-08-07`); // Battle of Boyacá
  holidays.add(`${y}-12-08`); // Immaculate Conception
  holidays.add(`${y}-12-25`); // Christmas

  // — Emiliani (movable to next Monday) —
  holidays.add(fmt(nextMonday(moment.tz(`${y}-01-06`, 'America/Bogota')))); // Epiphany
  holidays.add(fmt(nextMonday(moment.tz(`${y}-03-19`, 'America/Bogota')))); // Saint Joseph
  holidays.add(fmt(nextMonday(moment.tz(`${y}-06-29`, 'America/Bogota')))); // Peter & Paul
  holidays.add(fmt(nextMonday(moment.tz(`${y}-10-12`, 'America/Bogota')))); // Columbus Day
  holidays.add(fmt(nextMonday(moment.tz(`${y}-11-01`, 'America/Bogota')))); // All Saints
  holidays.add(fmt(nextMonday(moment.tz(`${y}-11-11`, 'America/Bogota')))); // Cartagena Independence

  // — Easter-dependent (exact dates, no Emiliani) —
  const easter = easterDate(y);
  holidays.add(fmt(easter.clone().subtract(3, 'days'))); // Holy Thursday
  holidays.add(fmt(easter.clone().subtract(2, 'days'))); // Good Friday
  holidays.add(fmt(easter.clone().add(39, 'days')));     // Ascension
  holidays.add(fmt(easter.clone().add(60, 'days')));     // Corpus Christi
  holidays.add(fmt(easter.clone().add(68, 'days')));     // Sacred Heart

  return holidays;
}

// Cache per year so we don't recalculate on every call.
const _cache = {};

function getHolidaysForYear(year) {
  if (!_cache[year]) _cache[year] = buildHolidaysForYear(year);
  return _cache[year];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true if `dateStr` (YYYY-MM-DD) is a Colombian public holiday.
 */
function isColombianHoliday(dateStr) {
  const year = dateStr.slice(0, 4);
  return getHolidaysForYear(year).has(dateStr);
}

/**
 * Returns true if `dateStr` is a business day (Mon–Fri, not a holiday).
 */
function isBusinessDay(dateStr) {
  const dow = moment.tz(dateStr, 'America/Bogota').isoWeekday(); // 1=Mon, 7=Sun
  if (dow === 6 || dow === 7) return false;
  return !isColombianHoliday(dateStr);
}

/**
 * Count business days between startStr and endStr (both inclusive, YYYY-MM-DD).
 */
function countBusinessDays(startStr, endStr) {
  let current = moment.tz(startStr, 'America/Bogota');
  const end = moment.tz(endStr, 'America/Bogota');
  let count = 0;
  while (current.isSameOrBefore(end, 'day')) {
    if (isBusinessDay(current.format('YYYY-MM-DD'))) count++;
    current.add(1, 'day');
  }
  return count;
}

/**
 * Returns the date that is `n` business days after (or before if n<0) `dateStr`.
 * Result is formatted as 'YYYY-MM-DD'.
 */
function addBusinessDays(dateStr, n) {
  let current = moment.tz(dateStr, 'America/Bogota');
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    current.add(step, 'day');
    if (isBusinessDay(current.format('YYYY-MM-DD'))) remaining--;
  }
  return current.format('YYYY-MM-DD');
}

/**
 * Returns the number of business days elapsed since `dateStr` up to today (Colombia).
 * Returns 0 if dateStr is today or in the future.
 */
function businessDaysSince(dateStr) {
  const today = moment.tz('America/Bogota').format('YYYY-MM-DD');
  if (dateStr >= today) return 0;
  return countBusinessDays(dateStr, today) - 1; // exclude the start date itself
}

module.exports = {
  isColombianHoliday,
  isBusinessDay,
  countBusinessDays,
  addBusinessDays,
  businessDaysSince,
};
