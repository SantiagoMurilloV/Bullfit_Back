// src/lib/notifyUser.js
// Single helper to notify ONE user: persists the message to their bell inbox
// (UserNotification) AND best-effort sends a web-push to all their devices,
// pruning dead subscriptions. This is the same inbox+push pattern already used
// in inactivityJob.js and leads_controller.js, factored out so payment-
// confirmation flows (finances, store) don't re-implement it.
//
// Designed to be called fire-and-forget from controllers: it never throws, so
// a notification failure can't break the request that triggered it.

const UserNotification = require('../models/userNotification');
const PushSubscription = require('../models/pushSubscription');
const { sendPush, isConfigured } = require('./webPush');

/**
 * @param {string|ObjectId} userId  recipient user id
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.url='/']      where the bell click navigates
 * @param {string} [opts.type='system'] one of the UserNotification enum types
 * @param {string} [opts.dedupeKey]    optional, prevents duplicate inbox rows
 * @returns {Promise<Object|null>} the created notification (or null on failure)
 */
const notifyUser = async (userId, { title, body, url = '/', type = 'system', dedupeKey } = {}) => {
  if (!userId || !title || !body) return null;

  // 1) Persist to the bell inbox.
  let notif = null;
  try {
    notif = await UserNotification.create({
      userId,
      title,
      body,
      type,
      url,
      ...(dedupeKey ? { dedupeKey } : {}),
    });
  } catch (err) {
    console.error('[notifyUser] inbox create failed:', err.message);
  }

  // 2) Best-effort web-push to every registered device.
  try {
    if (isConfigured()) {
      const subs = await PushSubscription.find({ userId }).lean();
      if (subs.length) {
        const payload = { title, body, url };
        const results = await Promise.all(subs.map((s) => sendPush(s, payload)));

        const goneIds = subs.filter((_, i) => results[i] && results[i].gone).map((s) => s._id);
        if (goneIds.length) {
          await PushSubscription.deleteMany({ _id: { $in: goneIds } });
        }
        if (notif && results.some((r) => r && r.ok)) {
          await UserNotification.updateOne({ _id: notif._id }, { $set: { pushSent: true } });
        }
      }
    }
  } catch (err) {
    console.error('[notifyUser] push failed:', err.message);
  }

  return notif;
};

module.exports = { notifyUser };
