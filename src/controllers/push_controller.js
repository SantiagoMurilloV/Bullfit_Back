// src/controllers/push_controller.js
// Sprint 6.A controllers:
//   - publicKey: return the VAPID public key so the frontend can subscribe
//   - subscribe: store/refresh the browser-issued PushSubscription
//   - unsubscribe: drop a subscription on logout / explicit opt-out
//   - sendBroadcast (admin): create a notification and push it to every
//     active subscription. Subscriptions that come back as gone (404/410)
//     are deleted as part of the same call so we self-heal the list.

const PushSubscription = require('../models/pushSubscription');
const NotificationLog = require('../models/notificationLog');
const { sendPush, isConfigured, getPublicKey } = require('../lib/webPush');

exports.publicKey = (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ message: 'VAPID no configurado en el servidor' });
  }
  return res.json({ key: getPublicKey() });
};

exports.subscribe = async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ message: 'Subscription mal formada' });
  }

  const userId = req.auth && req.auth.sub;
  if (!userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  try {
    // Upsert keyed by (userId, endpoint) so reconnecting the same device
    // does not create duplicates.
    const sub = await PushSubscription.findOneAndUpdate(
      { userId, endpoint },
      {
        $set: {
          userId,
          endpoint,
          keys,
          userAgent: req.headers['user-agent'],
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return res.status(201).json({ id: sub._id });
  } catch (err) {
    console.error('[push/subscribe] error:', err);
    return res.status(500).json({ message: 'Error guardando la suscripción' });
  }
};

exports.unsubscribe = async (req, res) => {
  const { endpoint } = req.body || {};
  const userId = req.auth && req.auth.sub;
  if (!userId || !endpoint) {
    return res.status(400).json({ message: 'endpoint requerido' });
  }
  try {
    await PushSubscription.deleteOne({ userId, endpoint });
    return res.status(204).end();
  } catch (err) {
    console.error('[push/unsubscribe] error:', err);
    return res.status(500).json({ message: 'Error eliminando la suscripción' });
  }
};

/**
 * POST /api/notifications
 * Body: { title, body, url? }
 *
 * Sprint 6.A behavior: send to ALL active subscriptions in parallel.
 * Sprint 6.D will add `recipients: [userId, ...]` for individual targeting.
 * Sprint 6.E will add `scheduledFor: ISODate` for scheduling.
 *
 * Auth: requireAdmin (applied at the router level).
 */
exports.sendBroadcast = async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ message: 'VAPID no configurado en el servidor' });
  }

  const title = (req.body && typeof req.body.title === 'string') ? req.body.title.trim() : '';
  const body = (req.body && typeof req.body.body === 'string') ? req.body.body.trim() : '';
  const url = (req.body && typeof req.body.url === 'string') ? req.body.url.trim() : '/';

  if (!title || !body) {
    return res.status(400).json({ message: 'title y body son requeridos' });
  }
  if (title.length > 80) {
    return res.status(400).json({ message: 'title no puede exceder 80 caracteres' });
  }
  if (body.length > 240) {
    return res.status(400).json({ message: 'body no puede exceder 240 caracteres' });
  }

  let subs;
  try {
    subs = await PushSubscription.find().lean();
  } catch (err) {
    console.error('[push/send] error cargando suscripciones:', err);
    return res.status(500).json({ message: 'Error cargando suscripciones' });
  }

  if (subs.length === 0) {
    return res.json({ sent: 0, gone: 0, failed: 0, total: 0 });
  }

  const payload = { title, body, url };

  // Run sends in parallel but bound the concurrency a bit so we don't
  // open hundreds of sockets at once if the subscription list grows.
  const results = await Promise.all(subs.map((sub) => sendPush(sub, payload)));

  let sent = 0;
  let gone = 0;
  let failed = 0;
  const goneIds = [];

  results.forEach((r, i) => {
    if (r.ok) sent += 1;
    else if (r.gone) {
      gone += 1;
      goneIds.push(subs[i]._id);
    } else {
      failed += 1;
    }
  });

  // Clean up dead subscriptions so future broadcasts don't pay for them.
  if (goneIds.length > 0) {
    try {
      await PushSubscription.deleteMany({ _id: { $in: goneIds } });
    } catch (err) {
      console.error('[push/send] error borrando subs vencidas:', err);
    }
  }

  // Persist the broadcast so the admin composer can offer it as a
  // template later. Failures are non-fatal: if the log write fails we
  // still report the delivery numbers to the admin.
  try {
    await NotificationLog.create({
      title,
      body,
      url,
      audience: 'all',
      recipients: [],
      totals: { total: subs.length, sent, gone, failed },
      sentBy: req.auth && req.auth.sub,
    });
  } catch (err) {
    console.error('[push/send] error guardando log:', err);
  }

  return res.json({ sent, gone, failed, total: subs.length });
};

/**
 * GET /api/notifications/templates
 *
 * Returns the most recent unique (title, body) pairs the admin has
 * broadcast, newest first. Used by the composer to one-click reuse a
 * previous message. We deduplicate at query time so an admin who
 * resends the same message ten times still gets one entry. Limit is
 * capped at 50 server-side regardless of what the client asked for.
 */
exports.listTemplates = async (req, res) => {
  const requestedLimit = Number(req.query.limit) || 10;
  const limit = Math.max(1, Math.min(50, requestedLimit));

  try {
    const docs = await NotificationLog.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { title: '$title', body: '$body' },
          title: { $first: '$title' },
          body: { $first: '$body' },
          url: { $first: '$url' },
          lastSentAt: { $first: '$createdAt' },
          uses: { $sum: 1 },
        },
      },
      { $sort: { lastSentAt: -1 } },
      { $limit: limit },
      { $project: { _id: 0 } },
    ]);
    return res.json({ templates: docs });
  } catch (err) {
    console.error('[push/templates] error:', err);
    return res.status(500).json({ message: 'Error cargando plantillas' });
  }
};
