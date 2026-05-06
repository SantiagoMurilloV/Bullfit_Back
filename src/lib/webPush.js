// src/lib/webPush.js
// Thin wrapper around the `web-push` package. The wrapper:
//   - Configures VAPID details once from env vars (VAPID_PUBLIC_KEY,
//     VAPID_PRIVATE_KEY, VAPID_SUBJECT). If anything is missing we keep
//     the rest of the app booting and surface the error only when
//     somebody actually tries to send.
//   - Exposes sendPush(subscription, payload) which JSON-encodes the
//     payload and returns a result object instead of throwing - that way
//     the caller can keep iterating over a list of subscriptions even
//     when one of them is dead.
//   - Treats 404/410 responses from the push service as "this
//     subscription is gone" and asks the caller to delete it from Mongo.
//     The push spec uses these codes specifically for expired endpoints.

const webpush = require('web-push');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@bullfit.app';

let configured = false;

const configureIfPossible = () => {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
};

const isConfigured = () => Boolean(PUBLIC_KEY && PRIVATE_KEY);

/**
 * Send a single push notification.
 * Returns { ok: true } on success or
 *         { ok: false, gone: true, status, error } if the subscription
 *           is permanently invalid (caller should delete it),
 *         { ok: false, gone: false, status, error } for transient failures.
 */
const sendPush = async (subscription, payload) => {
  if (!configureIfPossible()) {
    return { ok: false, gone: false, status: 0, error: 'VAPID not configured' };
  }

  try {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      body,
      { TTL: 60 * 60 * 24 }, // 24h - if the device is offline longer, drop it
    );
    return { ok: true };
  } catch (err) {
    const status = err && err.statusCode;
    // 404 (Not Found) and 410 (Gone) are the spec codes for "delete me".
    const gone = status === 404 || status === 410;
    return { ok: false, gone, status, error: err && err.message };
  }
};

module.exports = { sendPush, isConfigured, getPublicKey: () => PUBLIC_KEY };
