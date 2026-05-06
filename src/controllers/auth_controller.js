// src/controllers/auth_controller.js
// Sprint 3.A: real authentication endpoint. The legacy frontend currently
// downloads the entire users list and matches Phone+IdentificationNumber on
// the client. This endpoint moves that check server-side and returns a JWT.
//
// DUAL MODE - WHY THE BCRYPT PATH IS COMMENTED:
//   Today the "password" of every existing user is their cedula
//   (IdentificationNumber). We compare it directly here so no user has to
//   change anything at deploy time. In Sprint 3.5 we will:
//     1) On successful login, if user.passwordHash is missing, hash the
//        provided password with bcrypt and save it (lazy migration).
//     2) Add /api/auth/set-password so users can change their password.
//     3) Once every active user has passwordHash, remove the cedula fallback.

const bcrypt = require('bcryptjs');
const User = require('../models/users');
const { signToken } = require('../lib/jwt');

// Strip out fields we never want returned to the client.
const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

/**
 * POST /api/auth/login
 * Body: { phone: string, password: string }
 * Response: { token, user }
 *
 * Errors are intentionally vague (always "Credenciales inválidas") so an
 * attacker can't tell whether a Phone exists in the system.
 */
exports.login = async (req, res) => {
  const phone = (req.body && typeof req.body.phone === 'string') ? req.body.phone.trim() : '';
  const password = (req.body && typeof req.body.password === 'string') ? req.body.password.trim() : '';

  if (!phone || !password) {
    return res.status(400).json({ message: 'phone y password son requeridos' });
  }

  try {
    // We must explicitly +select passwordHash because the schema sets
    // select: false on it.
    const user = await User.findOne({ Phone: phone }).select('+passwordHash');

    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    let passwordOk = false;

    if (user.passwordHash) {
      // Sprint 3.5 path: real bcrypt check.
      passwordOk = await bcrypt.compare(password, user.passwordHash);
    } else {
      // Sprint 3.A path: cedula-as-password compatibility.
      passwordOk = (password === user.IdentificationNumber);
    }

    if (!passwordOk) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = signToken(user);
    if (!token) {
      console.error('[auth] JWT_SECRET no configurado - el login no puede emitir tokens.');
      return res.status(500).json({ message: 'Auth no configurada en el servidor' });
    }

    return res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('[auth/login] error:', err);
    return res.status(500).json({ message: 'Error en el inicio de sesión' });
  }
};

/**
 * GET /api/auth/me
 * Returns the currently authenticated user (full document, sans passwordHash).
 * Useful for the frontend to refresh user info after a JWT is restored from
 * localStorage on app boot, without re-downloading the entire users list.
 *
 * This route requires requireAuth applied at the router level.
 */
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.auth.sub);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('[auth/me] error:', err);
    return res.status(500).json({ message: 'Error al cargar el usuario' });
  }
};
