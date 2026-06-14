// src/models/userStreak.js
// Stores the computed streak state for each user.
// Updated every time an admin marks Attendance='Si' or 'No'.
//
// A "streak week" = Mon-Fri window where the user attended at least 3 days.
// Weekends and Colombian public holidays don't count.
//
// Fields:
//   currentStreak     - consecutive completed weeks up to and including today
//   longestStreak     - all-time highest currentStreak value
//   totalActivities   - total attended sessions within the current streak run
//   streakStartDate   - YYYY-MM-DD of the Monday that started the current streak
//   lastAttendedDate  - YYYY-MM-DD of the most recent Attendance='Si' session
//   lastComputedAt    - when we last recalculated (used by cron to avoid re-work)

const mongoose = require('mongoose');

const userStreakSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    // Best streak counted ONLY from the trophy launch date (lib/trophies
    // TROPHIES_START). Drives medal unlocks; separate from the all-time streak.
    trophyLongestStreak: { type: Number, default: 0 },
    totalActivities: { type: Number, default: 0 }, // sessions in current streak
    streakStartDate: { type: String, default: null }, // YYYY-MM-DD
    lastAttendedDate: { type: String, default: null }, // YYYY-MM-DD
    lastComputedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('UserStreak', userStreakSchema);
