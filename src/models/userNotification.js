// src/models/userNotification.js
// Per-user notification inbox. Each document is one notification delivered
// (or queued for delivery) to a specific user.
//
// Types:
//   'inactivity'  - user hasn't reserved in 3+ business days
//   'streak'      - streak milestone reached (weekly)
//   'achievement' - badge/logro unlocked
//   'system'      - admin-sent or generic message
//
// The 'read' field drives the unread-badge count in the bell icon.
// The 'pushSent' field avoids sending duplicate web-push for the same notification.

const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['inactivity', 'streak', 'achievement', 'system'],
      default: 'system',
    },
    read: { type: Boolean, default: false },
    url: { type: String, default: '/' },
    pushSent: { type: Boolean, default: false },
    // For achievement notifications: the trophy key awarded (e.g. 'burpees').
    trophyKey: { type: String, default: null },
    // Deduplication key — prevents sending the same inactivity alert twice
    // on the same calendar day. Format: '<type>-<userId>-<YYYY-MM-DD>'.
    dedupeKey: { type: String, index: true, sparse: true },
  },
  { timestamps: true },
);

// Fetch unread first, then newest first.
userNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('UserNotification', userNotificationSchema);
