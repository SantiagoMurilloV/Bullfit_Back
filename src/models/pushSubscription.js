// src/models/pushSubscription.js
// One document per (user, browser) pair. The browser-issued endpoint is
// what the Push service uses to deliver the notification, and the keys
// are the encryption envelope for the payload. We keep userId so the
// admin can target individual users in a later sprint.
//
// Why a compound unique on (userId, endpoint):
//   A user can have several active subscriptions (phone + tablet + laptop)
//   but the SAME endpoint should never be duplicated for the same user
//   on re-login or duplicate calls to subscribe(). Without the index, a
//   user that re-subscribes creates a row each time and we send N copies
//   of every notification.

const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // The User-Agent at subscribe time. Helpful for debugging "why did
    // this device stop receiving notifications" (often Safari < 16.4 or
    // a device that changed its identity).
    userAgent: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
