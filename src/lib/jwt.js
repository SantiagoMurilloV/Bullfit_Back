// src/lib/jwt.js
// Thin wrapper around jsonwebtoken so callers don't have to know the secret
// or the expiration policy. The secret comes from JWT_SECRET; expiry from
// JWT_EXPIRES_IN (default 7 days).
//
// Why we wrap it:
//   - Centralized "ok / not ok" result so middlewares don't need a try/catch.
//   - One place to swap the algorithm or rotate keys later.
//   - Makes it trivial to feature-flag JWT off (return null) if we ever need
//     to roll back without changing every caller.

const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRES_IN = '7d';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // We do NOT throw at module-load time so the app can still boot
    // (helmet/cors/health all keep working). The error is surfaced when
    // someone tries to sign or verify a token.
    return null;
  }
  return secret;
};

/**
 * Sign a JWT for a user. Payload is intentionally minimal:
 *   - sub: user._id
 *   - role: 'user' | 'admin'
 * The frontend can read these claims to drive UI decisions; sensitive data
 * (Phone, IdentificationNumber, etc.) stays in the API response body where
 * it can be invalidated server-side if needed.
 *
 * Returns null if JWT_SECRET is not configured. Callers should treat that
 * as "auth temporarily unavailable" and respond with 500.
 */
const signToken = (user) => {
  const secret = getSecret();
  if (!secret) return null;

  const payload = {
    sub: user._id?.toString(),
    role: user.role || 'user',
  };

  const expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN;

  return jwt.sign(payload, secret, { expiresIn });
};

/**
 * Verify a token. Returns:
 *   { ok: true, payload } on success
 *   { ok: false, reason } on failure (no throw - middlewares stay clean)
 *
 * `reason` is one of: 'no-secret' | 'expired' | 'invalid' | 'malformed'.
 */
const verifyToken = (token) => {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };

  try {
    const payload = jwt.verify(token, secret);
    return { ok: true, payload };
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { ok: false, reason: 'expired' };
    if (err.name === 'JsonWebTokenError') return { ok: false, reason: 'invalid' };
    return { ok: false, reason: 'invalid' };
  }
};

module.exports = { signToken, verifyToken };
