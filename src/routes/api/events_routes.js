// src/routes/api/events_routes.js
// Server-Sent Events (SSE) stream for live reservation changes.
//
//   GET /api/events/reservations?token=<jwt>
//
// The admin agenda (frontend Diary.jsx) opens this stream and refreshes the
// current week whenever a reservation is created / updated / deleted by anyone
// (another admin, a user from the app), so the admin never has to reload.
//
// Auth note: the browser's native EventSource cannot send custom headers, so
// it can't use the usual `Authorization: Bearer` flow. We accept the JWT as a
// `token` query param and validate it here with the same verifyToken used by
// the requireAuth middleware. This route is therefore NOT mounted behind the
// global header-based requireAuth.

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../lib/jwt');
const { onReservationEvent, offReservationEvent } = require('../../lib/reservationEvents');

const HEARTBEAT_MS = 25 * 1000;

router.get('/events/reservations', (req, res) => {
  // ---- Auth via query token (EventSource can't set headers) ----------------
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const result = verifyToken(token);
  if (!result.ok) {
    const status = result.reason === 'no-secret' ? 500 : 401;
    return res.status(status).json({ message: 'No autenticado' });
  }

  // ---- SSE headers ---------------------------------------------------------
  // `no-transform` makes the global compression() middleware skip this
  // response (otherwise it would buffer the stream). X-Accel-Buffering: no
  // tells reverse proxies (nginx / DO) not to buffer either.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Initial comment so the client's connection opens immediately.
  res.write(': connected\n\n');

  // ---- Forward reservation events to this client ---------------------------
  const send = (payload) => {
    try {
      res.write(`event: reservation\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      // Write after close, etc. — drop the client.
      cleanup();
    }
  };

  onReservationEvent(send);

  // ---- Heartbeat to keep the connection alive through the LB ---------------
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (err) {
      cleanup();
    }
  }, HEARTBEAT_MS);

  // ---- Cleanup -------------------------------------------------------------
  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    offReservationEvent(send);
  }

  req.on('close', cleanup);
  res.on('error', cleanup);
});

module.exports = router;
