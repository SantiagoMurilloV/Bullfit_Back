// src/models/lead.js
// "Persona interesada" submitted from the public landing page (bullfit.co).
// Created by an unauthenticated POST /api/leads; read/managed by admins.

const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    apellido: { type: String, trim: true, default: '', maxlength: 120 },
    whatsapp: { type: String, required: true, trim: true, maxlength: 40 },
    interes: { type: String, trim: true, default: '', maxlength: 120 },
    mensaje: { type: String, trim: true, default: '', maxlength: 1000 },
    fuente: { type: String, trim: true, default: 'landing-bullfit', maxlength: 60 },
    // Submission timestamp as reported by the landing (falls back to now).
    fecha: { type: Date, default: () => new Date() },
    // Admin workflow status.
    status: {
      type: String,
      enum: ['nuevo', 'contactado', 'descartado'],
      default: 'nuevo',
      index: true,
    },
  },
  { timestamps: true },
);

leadSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
