// src/models/notificationTemplate.js
// A favorite/saved notification template. Unlike the history-derived feed
// (NotificationLog), these are ONLY the messages an admin explicitly starred
// in the composer. The composer's "Reutilizar plantilla" dropdown reads from
// this collection, and admins can delete entries one by one.

const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 240 },
    url: { type: String, default: '/' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true },
);

// Avoid duplicate favorites for the same (title, body) pair.
notificationTemplateSchema.index({ title: 1, body: 1 }, { unique: true });
// Frequent query: newest favorites first.
notificationTemplateSchema.index({ createdAt: -1 });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
