// src/routes/api/trophies_routes.js
// Dynamic trophy catalog routes. Per-route auth (like push_routes.js), NOT a
// blanket router.use(requireAuth): reads need any logged-in user, writes are
// admin-only.
//
// Uploads use multer memoryStorage (buffer in req.file.buffer) so the image
// never hits disk; the controller streams it straight to Cloudinary. Multipart
// requests bypass express.json — multer parses them.

const express = require('express');
const multer = require('multer');

const router = express.Router();
const ctrl = require('../../controllers/trophies_controller');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    return cb(new Error('Solo se permiten imágenes'));
  },
});

// Wrap multer so its errors come back as clean 400 JSON instead of bubbling to
// the global error handler as a 500.
const uploadSingle = (field) => (req, res, next) => {
  upload.single(field)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen supera el límite de 5MB'
        : (err.message || 'Error al subir la imagen');
      return res.status(400).json({ message: msg });
    }
    return next();
  });
};

router.get('/trophies', requireAuth, ctrl.listTrophies);
router.post('/trophies', requireAdmin, uploadSingle('image'), ctrl.createTrophy);
router.put('/trophies/:id', requireAdmin, uploadSingle('image'), ctrl.updateTrophy);
router.delete('/trophies/:id', requireAdmin, ctrl.deleteTrophy);

module.exports = router;
