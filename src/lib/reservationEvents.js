// src/lib/reservationEvents.js
// In-process event bus for reservation changes (create / update / delete).
// The SSE endpoint (routes/api/events_routes.js) subscribes to this bus and
// streams each event to connected admin clients so the agenda updates live
// without a page reload.
//
// Why an EventEmitter and not just calling the SSE writer directly from the
// controllers: it decouples the persistence code from the transport. The
// controllers only "announce" a change; whoever cares (SSE today, maybe push
// or websockets later) listens. Listeners never throw back into the emitter,
// so a slow/broken client can't break a reservation write.
//
// Multi-instance fan-out (optional): if REDIS_ENABLED === 'true' we ALSO
// publish each event to a Redis channel and a dedicated subscriber connection
// re-emits it locally. That way an event produced on instance A reaches SSE
// clients connected to instance B. Events are tagged with a per-process
// `origin` id so the subscriber ignores the message it just published itself
// (no double delivery on the originating instance). If Redis is disabled or
// unreachable, only the in-process emitter runs — enough for a single
// instance, which is the current deployment.

const EventEmitter = require('events');
const Redis = require('ioredis');

const CHANNEL = 'reservations:events';
const EVENT_NAME = 'reservation';

// Unique id for this process so we can drop our own Redis echo.
const ORIGIN = `${process.pid}-${Date.now()}`;

const bus = new EventEmitter();
// Each open SSE connection registers one listener. Lift the default cap (10)
// so a handful of admins with multiple tabs don't trigger the
// MaxListenersExceededWarning. 0 = unlimited.
bus.setMaxListeners(0);

const isRedisEnabled = () => process.env.REDIS_ENABLED === 'true';

// ---- Redis pub/sub (lazy, optional) ---------------------------------------
let publisher = null;
let subscriber = null;
let redisInitTried = false;

const buildRedisOptions = () => ({
  enableReadyCheck: false,
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

const makeConnection = () => {
  const opts = buildRedisOptions();
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, opts);
  }
  return new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    ...opts,
  });
};

// Spin up the publisher + subscriber connections once, on first use. A failure
// here is non-fatal: we log and fall back to in-process-only delivery.
const ensureRedis = () => {
  if (!isRedisEnabled() || redisInitTried) return;
  redisInitTried = true;

  try {
    publisher = makeConnection();
    subscriber = makeConnection();

    publisher.on('error', (err) => console.error('[reservationEvents] redis publisher error:', err.message));
    subscriber.on('error', (err) => console.error('[reservationEvents] redis subscriber error:', err.message));

    subscriber.connect().catch((err) => {
      console.error('[reservationEvents] redis subscriber connect failed:', err.message);
    });
    publisher.connect().catch((err) => {
      console.error('[reservationEvents] redis publisher connect failed:', err.message);
    });

    subscriber.subscribe(CHANNEL).catch((err) => {
      console.error('[reservationEvents] redis subscribe failed:', err.message);
    });

    subscriber.on('message', (channel, raw) => {
      if (channel !== CHANNEL) return;
      try {
        const message = JSON.parse(raw);
        // Drop the echo of events we published ourselves; they were already
        // delivered locally by emitReservationEvent.
        if (message && message.origin === ORIGIN) return;
        bus.emit(EVENT_NAME, message.payload);
      } catch (err) {
        console.error('[reservationEvents] bad redis message:', err.message);
      }
    });
  } catch (err) {
    console.error('[reservationEvents] redis init failed:', err.message);
    publisher = null;
    subscriber = null;
  }
};

/**
 * Announce a reservation change. Safe to call fire-and-forget from controllers.
 * @param {Object} input
 * @param {'created'|'updated'|'deleted'} input.type
 * @param {Object} input.reservation - the saved/updated/deleted document (lean or mongoose)
 */
const emitReservationEvent = ({ type, reservation } = {}) => {
  try {
    const r = reservation || {};
    const payload = {
      type,
      reservationId: r._id ? String(r._id) : undefined,
      userId: r.userId ? String(r.userId) : undefined,
      day: r.day,
      hour: r.hour,
    };

    // Always deliver to local SSE clients immediately.
    bus.emit(EVENT_NAME, payload);

    // Fan out to other instances via Redis when enabled.
    if (isRedisEnabled()) {
      ensureRedis();
      if (publisher) {
        publisher
          .publish(CHANNEL, JSON.stringify({ origin: ORIGIN, payload }))
          .catch((err) => console.error('[reservationEvents] redis publish failed:', err.message));
      }
    }
  } catch (err) {
    // Never let event delivery break a reservation write.
    console.error('[reservationEvents] emit failed:', err.message);
  }
};

const onReservationEvent = (handler) => bus.on(EVENT_NAME, handler);
const offReservationEvent = (handler) => bus.off(EVENT_NAME, handler);

module.exports = { emitReservationEvent, onReservationEvent, offReservationEvent };
