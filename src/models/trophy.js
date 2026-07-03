// src/models/trophy.js
// Dynamic trophy catalog. Replaces the previously hard-coded frontend arrays.
// The IMAGE is stored in Cloudinary (imageUrl / imagePublicId); everything else
// lives here. The frontend reads this via GET /api/trophies and the admin
// manages it from the "Biblioteca de trofeos" in the Progreso screen.
//
// The `key` is the stable slug the rest of the system keys off:
//   - awarding/revoking stores it as UserNotification.trophyKey (push_controller)
//   - the streak "vitrina" unlocks the 6 streak medals by `weeks`
// Migration (src/scripts/migrateTrophies.js) seeds the 13 original medals with
// their EXACT existing keys so already-awarded trophies keep matching.
//
// Field meaning:
//   weeks     : streak threshold in weeks. Only the 6 streak medals have it;
//               null for special/manual trophies.
//   adminOnly : true → shown to a user only if the admin awarded it (special).
//               The 6 streak medals are adminOnly:false (auto-unlock by streak).
//   system    : true → protected core medal (the 6 streak ones). Cannot be
//               DELETED (backend 403 + no UI button). Content is still editable.

const mongoose = require('mongoose');

const trophySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    label: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    weeks: { type: Number, default: null },
    adminOnly: { type: Boolean, default: true },
    system: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Trophy', trophySchema);
