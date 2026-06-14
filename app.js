const express = require('express');
const app = express();
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const usersRoutes = require('./src/routes/api/users_routes');
const reservationsRoutes = require('./src/routes/api/reservations_routes');
const financeRoutes = require('./src/routes/api/finances_routes');
const storeRoutes = require('./src/routes/api/store_routes');
const pricesRoutes = require('./src/routes/api/prices_routes');
const invitadosRoutes = require('./src/routes/api/invitados_routes');
// const notification = require('./helpers/twilio_route');
const slot = require('./src/routes/api/quotaLimits_routes');
const termsAndConditionsRoutes = require('./src/routes/api/termsAndConditions_routes');
const pqrs = require('./src/routes/api/pqrs_routes');
const authRoutes = require('./src/routes/api/auth_routes');
const pushRoutes = require('./src/routes/api/push_routes');
const statsRoutes = require('./src/routes/api/stats_routes');
const gamificationRoutes = require('./src/routes/api/gamification_routes');
const leadsRoutes = require('./src/routes/api/leads_routes');
const eventsRoutes = require('./src/routes/api/events_routes');
const { startInactivityJob } = require('./src/jobs/inactivityJob');
const { startMembershipExpiryJob } = require('./src/jobs/membershipExpiryJob');

dotenv.config();

// Trust the first proxy hop so express-rate-limit and req.ip see the real
// client IP behind DigitalOcean App Platform's load balancer. Without this,
// every request appears to come from the same proxy address and the rate
// limiter would throttle the entire app to a single bucket.
app.set('trust proxy', 1);

// ---- Security headers ------------------------------------------------------
// Helmet sets sensible defaults (X-Content-Type-Options, X-Frame-Options,
// HSTS, etc). We disable two policies that can break first-load:
//  - contentSecurityPolicy: would require listing every script/style/image
//    source the React app pulls, including Vercel/DO domains. Out of scope
//    for P0 hardening; revisit later.
//  - crossOriginEmbedderPolicy: blocks embedding cross-origin assets
//    (Firebase Storage URLs for PDFs). Re-enable once everything moves
//    to Supabase + COEP-compatible headers.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '1mb' }));
app.use(compression());

// Strip Mongo operators ($, .) from request payload keys to mitigate
// NoSQL injection. Safe for this app: no controller relies on dotted or
// $-prefixed input keys.
app.use(mongoSanitize());

const dbUrl = process.env.MONGODB_URL;
const PORT = process.env.PORT || 8084;

// Mongoose connection with explicit pool/timeout options (deprecated
// useNewUrlParser/useUnifiedTopology removed - they are no-ops in Mongoose 6+).
mongoose.connect(dbUrl, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

const db = mongoose.connection;
db.on('error', (error) => console.error('MongoDB error:', error));
db.on('disconnected', () => console.warn('MongoDB disconnected'));
db.on('reconnected', () => console.log('MongoDB reconnected'));
db.once('open', () => {
  console.log('Conexión a la base de datos exitosa');
  startInactivityJob();
  startMembershipExpiryJob();
});


// ---- CORS ------------------------------------------------------------------
// Whitelist explicit origins. Order of precedence:
//   1) CORS_ORIGINS env var (comma-separated list) - canonical override.
//   2) Built-in defaults: production Vercel domain, Vercel preview pattern,
//      and localhost for dev.
//
// We pass a function (instead of an array or a string) so we can support
// the wildcard pattern for Vercel preview deployments
// (https://bullfit-app-v2-0-*-santiagomurilloval.vercel.app) without
// relaxing security to "*". Requests with no Origin header (server-to-server,
// curl, mobile webviews) are allowed through to keep existing flows working.
// Stable production frontends. Both keep working side by side: the original
// Vercel domain and the new custom domain (app.bullfit.co).
const PROD_ORIGINS = [
  'https://bullfit-app-v2-0.vercel.app',
  'https://app.bullfit.co',
  // Public landing — posts new leads to POST /api/leads.
  'https://bullfit.co',
  'https://www.bullfit.co',
];
const VERCEL_PREVIEW_REGEX = /^https:\/\/bullfit-app-v2-0(-[a-z0-9-]+)?\.vercel\.app$/i;
const LOCAL_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// CORS_ORIGINS (if set) is now ADDITIVE on top of the built-in allow list,
// instead of replacing it. This guarantees the known production frontends keep
// working even if the env var is set to something narrower.
const explicitWhitelist = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const isAllowedOrigin = (origin) => {
  if (PROD_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_REGEX.test(origin)) return true;
  if (LOCAL_DEV_ORIGINS.includes(origin)) return true;
  if (explicitWhitelist.includes(origin)) return true;
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin / non-browser callers (no Origin header).
    if (!origin) return callback(null, true);
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
}));

// ---- Health check (no auth, no DB write) -----------------------------------
// Used by DigitalOcean App Platform to verify the instance is alive and the
// DB connection is up. Keep this BEFORE the /api routes so it always responds
// even if a route module fails to load. Excluded from the rate limiter below.
app.get('/health', (req, res) => {
  // mongoose.connection.readyState: 0 disconnected, 1 connected,
  // 2 connecting, 3 disconnecting.
  const dbState = mongoose.connection.readyState;
  const dbStateLabel = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: { state: dbStateLabel, ready: healthy },
    env: process.env.NODE_ENV || 'development',
  });
});

// ---- Rate limiting ---------------------------------------------------------
// Soft global limiter. 300 req/minute per IP is generous for normal client
// behavior (a logged-in admin browsing finances pulls dozens of requests at
// load) and still blocks brute-force enumeration and basic DoS. Tweak via
// env vars if a legitimate use case hits the limit.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes, intenta de nuevo en un minuto.' },
});
app.use('/api', apiLimiter);

// Rutas de la API
// Auth router goes first so /api/auth/login isn't shadowed by anything else.
app.use('/api', authRoutes);
// Leads BEFORE the routers that apply router-level requireAuth, so the public
// POST /api/leads (landing form) isn't swallowed by their global guard.
app.use('/api', leadsRoutes);
// SSE stream for live reservation updates. Has its own query-token auth (the
// browser EventSource can't send the Authorization header), so it must NOT sit
// behind the header-based requireAuth of the reservations router.
app.use('/api', eventsRoutes);
// Stats route before authenticated routers (has its own password gate in frontend).
app.use('/api', statsRoutes);
app.use('/api', pushRoutes);
app.use('/api', usersRoutes);
app.use('/api', reservationsRoutes);
app.use('/api', financeRoutes);
app.use('/api', storeRoutes);
app.use('/api', pricesRoutes);
app.use('/api', termsAndConditionsRoutes);
// app.use('/api', notification);
app.use('/api', slot);
app.use('/api', pqrs);
app.use('/api', invitadosRoutes);
app.use('/api', gamificationRoutes);

// ---- 404 handler -----------------------------------------------------------
// Anything that wasn't caught by the routers above. Keep before the error
// handler so unmatched routes return a clean JSON instead of HTML.
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada', path: req.originalUrl });
});

// ---- Global error handler --------------------------------------------------
// Catches errors forwarded with next(err) or thrown by async handlers wrapped
// in a try/catch that calls next(err). Today most controllers handle their
// own errors locally; this is the safety net for the ones that don't and the
// landing pad for upcoming async-wrapper refactors. Stack traces are only
// included outside production to avoid leaking internals.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled-error]', {
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: err.stack,
  });
  if (res.headersSent) {
    return; // delegate to default Express handler
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: status >= 500 ? 'Error interno del servidor' : err.message,
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log('Servidor Express en ejecución en el puerto ' + PORT);
});
