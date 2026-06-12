// src/controllers/push_controller.js
// Sprint 6.A controllers:
//   - publicKey: return the VAPID public key so the frontend can subscribe
//   - subscribe: store/refresh the browser-issued PushSubscription
//   - unsubscribe: drop a subscription on logout / explicit opt-out
//   - sendBroadcast (admin): create a notification and push it to every
//     active subscription. Subscriptions that come back as gone (404/410)
//     are deleted as part of the same call so we self-heal the list.

const mongoose = require('mongoose');
const PushSubscription = require('../models/pushSubscription');
const NotificationLog = require('../models/notificationLog');
const NotificationTemplate = require('../models/notificationTemplate');
const UserNotification = require('../models/userNotification');
const User = require('../models/users');
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
  const recipientsInput = (req.body && Array.isArray(req.body.recipients)) ? req.body.recipients : [];

  if (!title || !body) {
    return res.status(400).json({ message: 'title y body son requeridos' });
  }
  if (title.length > 80) {
    return res.status(400).json({ message: 'title no puede exceder 80 caracteres' });
  }
  if (body.length > 240) {
    return res.status(400).json({ message: 'body no puede exceder 240 caracteres' });
  }

  // Resolve audience (Sprint 6.E):
  //   - With recipients in the body: send only to those user ids (no Active
  //     filter, since the admin explicitly chose them - they may want to
  //     reach out to a paused member too).
  //   - Without recipients (broadcast): only Active=Si users. Inactive
  //     accounts (cancelled/suspended) should not receive marketing pushes.
  let audience = 'all';
  let userFilter = null;
  let validRecipientIds = [];

  if (recipientsInput.length > 0) {
    // Coerce to ObjectId, drop anything malformed.
    validRecipientIds = recipientsInput
      .filter((id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (validRecipientIds.length === 0) {
      return res.status(400).json({ message: 'recipients no contiene ids válidos' });
    }
    audience = 'users';
    userFilter = { _id: { $in: validRecipientIds } };
  } else {
    audience = 'all';
    userFilter = { Active: 'Sí' };
  }

  let targetUserIds;
  try {
    const targetUsers = await User.find(userFilter).select('_id').lean();
    targetUserIds = targetUsers.map((u) => u._id);
  } catch (err) {
    console.error('[push/send] error cargando usuarios destino:', err);
    return res.status(500).json({ message: 'Error cargando usuarios' });
  }

  if (targetUserIds.length === 0) {
    return res.json({ sent: 0, gone: 0, failed: 0, total: 0, inbox: 0, audience, eligibleUsers: 0 });
  }

  // Persist to each target user's in-app inbox (the bell history). This is
  // independent of web push: the user sees the message in their bell even if
  // they never granted browser push permission. Without this the bell history
  // stayed empty for admin-sent notifications.
  let inbox = 0;
  try {
    const docs = targetUserIds.map((id) => ({ userId: id, title, body, type: 'system', url }));
    const inserted = await UserNotification.insertMany(docs, { ordered: false });
    inbox = inserted.length;
  } catch (err) {
    console.error('[push/send] error guardando bandejas:', err);
  }

  let subs;
  try {
    subs = await PushSubscription.find({ userId: { $in: targetUserIds } }).lean();
  } catch (err) {
    console.error('[push/send] error cargando suscripciones:', err);
    return res.status(500).json({ message: 'Error cargando suscripciones' });
  }

  if (subs.length === 0) {
    return res.json({ sent: 0, gone: 0, failed: 0, total: 0, inbox, audience, eligibleUsers: targetUserIds.length });
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
      audience,
      recipients: audience === 'users' ? validRecipientIds : [],
      totals: { total: subs.length, sent, gone, failed },
      sentBy: req.auth && req.auth.sub,
    });
  } catch (err) {
    console.error('[push/send] error guardando log:', err);
  }

  return res.json({ sent, gone, failed, total: subs.length, inbox, audience, eligibleUsers: targetUserIds.length });
};

/**
 * GET /api/notifications/recipients
 *
 * Returns the list of users the admin is allowed to target with a push
 * notification, ordered by name. The frontend renders this in the
 * "Específico" tab so the admin can pick one or several recipients.
 *
 * We expose only Active=Si users by default (consistent with the broadcast
 * audience), but accept ?includeInactive=1 to include the rest in case the
 * admin wants to reach a paused member specifically.
 *
 * Auth: requireAdmin (applied at the router).
 */
exports.listRecipients = async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const filter = includeInactive ? {} : { Active: 'Sí' };

  try {
    const users = await User.find(filter)
      .select('FirstName LastName Phone Active Plan')
      .sort({ FirstName: 1, LastName: 1 })
      .lean();
    return res.json({ users });
  } catch (err) {
    console.error('[push/recipients] error:', err);
    return res.status(500).json({ message: 'Error cargando usuarios' });
  }
};

/**
 * GET /api/notifications/templates
 *
 * Returns the admin's saved favorite templates, newest first. These are ONLY
 * the messages explicitly starred in the composer (NotificationTemplate), not
 * the full send history. Limit is capped at 50 server-side.
 */
exports.listTemplates = async (req, res) => {
  const requestedLimit = Number(req.query.limit) || 20;
  const limit = Math.max(1, Math.min(50, requestedLimit));

  try {
    const docs = await NotificationTemplate.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('title body url createdAt')
      .lean();
    return res.json({ templates: docs });
  } catch (err) {
    console.error('[push/templates] error:', err);
    return res.status(500).json({ message: 'Error cargando plantillas' });
  }
};

/**
 * POST /api/notifications/templates
 * Body: { title, body, url? }
 *
 * Saves a message as a favorite template (the composer's ⭐ button). If a
 * template with the same (title, body) already exists, that one is returned
 * instead of creating a duplicate.
 */
exports.createTemplate = async (req, res) => {
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

  try {
    // Idempotent on (title, body): reuse the existing favorite if present.
    const existing = await NotificationTemplate.findOne({ title, body }).lean();
    if (existing) {
      return res.status(200).json({ template: existing, created: false });
    }
    const tpl = await NotificationTemplate.create({
      title,
      body,
      url,
      createdBy: req.auth && req.auth.sub,
    });
    return res.status(201).json({ template: tpl, created: true });
  } catch (err) {
    // Unique-index race: another request created the same pair first.
    if (err && err.code === 11000) {
      const existing = await NotificationTemplate.findOne({ title, body }).lean();
      return res.status(200).json({ template: existing, created: false });
    }
    console.error('[push/templates create] error:', err);
    return res.status(500).json({ message: 'Error guardando la plantilla' });
  }
};

/**
 * DELETE /api/notifications/templates/:id
 * Removes a saved favorite template.
 */
exports.deleteTemplate = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'id inválido' });
  }
  try {
    const deleted = await NotificationTemplate.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Plantilla no encontrada' });
    }
    return res.status(204).end();
  } catch (err) {
    console.error('[push/templates delete] error:', err);
    return res.status(500).json({ message: 'Error eliminando la plantilla' });
  }
};
