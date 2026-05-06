// src/models/notificationLog.js
// One row per broadcast. Doubles as the "templates" feed in the admin
// composer: the UI fetches the most recent unique (title, body) pairs and
// surfaces them as one-click reuse.
//
// We only keep aggregate counters here, not per-recipient deliveries:
// the relevant signal for the admin is "how many got it" plus "what did I
// send", and storing one document per recipient would balloon to tens of
// thousands of rows for no real product value.

const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    url: { type: String, default: '/' },
    // Targeting summary. Sprint 6.D MVP only supports 'all'; the field is
    // stored anyway so future per-user sends can be filtered without a
    // schema migration.
    audience: { type: String, enum: ['all', 'users'], default: 'all' },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Aggregate delivery results (web-push reports per subscription).
    totals: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      gone: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true },
);

// Frequent query: "give me the most recent N broadcasts".
notificationLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
