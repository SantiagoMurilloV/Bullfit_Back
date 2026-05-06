// src/routes/api/auth_routes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../../controllers/auth_controller');
const { requireAuth } = require('../../middleware/auth');

// Per-IP rate limit for the login endpoint. Stricter than the global API
// limiter (300/min) because login is an obvious brute-force target. 10
// attempts per minute is enough for a confused user retyping their phone
// and not enough for credential stuffing at scale.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de inicio de sesión, espera un minuto.' },
});

router.post('/auth/login', loginLimiter, authController.login);
router.get('/auth/me', requireAuth, authController.me);

module.exports = router;
