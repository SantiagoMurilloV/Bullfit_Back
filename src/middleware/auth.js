// src/middleware/auth.js
// requireAuth and requireAdmin Express middlewares. They are CREATED here
// in Sprint 3.A but NOT applied to any route yet - that happens gradually
// in Sprint 3.C, route-by-route, so we can roll back individually.
//
// Token discovery order:
//   1) Authorization: Bearer <token>   (preferred, what the frontend will send)
//   2) Cookie:        token=<token>    (reserved for future httpOnly cookie migration)
//
// On success the decoded payload is attached as req.auth = { sub, role, ... }.
// We deliberately do NOT load the user document from Mongo here - middlewares
// stay fast and any handler that needs the full document can fetch it.

const { verifyToken } = require('../lib/jwt');

const extractToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme && scheme.toLowerCase() === 'bearer' && token) {
      return token.trim();
    }
  }

  // Future: read httpOnly cookie. Today our cookie middleware is not wired,
  // so this branch is effectively dead. Leaving it ready for Sprint 3.5.
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
};

const requireAuth = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  const result = verifyToken(token);
  if (!result.ok) {
    const map = {
      'no-secret': 'Auth no configurada en el servidor',
      'expired': 'Sesión expirada, vuelve a iniciar sesión',
      'invalid': 'Token inválido',
      'malformed': 'Token mal formado',
    };
    const status = result.reason === 'no-secret' ? 500 : 401;
    return res.status(status).json({ message: map[result.reason] || 'No autenticado' });
  }

  req.auth = result.payload;
  return next();
};

const requireAdmin = (req, res, next) => {
  // Run requireAuth first; if it didn't, fall back to verifying inline.
  if (!req.auth) {
    return requireAuth(req, res, () => requireAdmin(req, res, next));
  }
  if (req.auth.role !== 'admin') {
    return res.status(403).json({ message: 'No autorizado' });
  }
  return next();
};

module.exports = { requireAuth, requireAdmin };
