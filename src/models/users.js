// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  Active: { type: String, index: true },
  FirstName: String,
  LastName: String,
  Plan: { type: String, index: true },
  IdentificationNumber: { type: String, index: true },
  Phone: String,
  registrationDate: String,
  nameEmergency: String,
  LastNameEmergency: String,
  PhoneEmergency: String,

  // ---- Auth fields (added in Sprint 3.A) -----------------------------------
  // role: 'user' (default) | 'admin'. Replaces the previous hardcoded check
  // `Phone === '0000' && IdentificationNumber === '1234'` in the frontend.
  // Migration: after this deploy, set role='admin' on the legacy admin user
  // via Atlas one-time update (see Sprint 3.D).
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },

  // passwordHash: bcrypt hash. Optional in Sprint 3.A so existing users keep
  // logging in with `IdentificationNumber` as the password during the
  // dual-mode period. Sprint 3.5 will:
  //   1) On login, if !passwordHash, hash the user's IdentificationNumber and
  //      save it (lazy migration).
  //   2) Add a /api/auth/set-password endpoint for users to change it.
  passwordHash: { type: String, select: false },
});

userSchema.index({ IdentificationNumber: 1 }, { unique: false, sparse: true });

module.exports = mongoose.model('User', userSchema);
