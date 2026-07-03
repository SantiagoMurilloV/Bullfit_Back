// src/controllers/trophies_controller.js
// CRUD for the dynamic trophy catalog. Conventions mirror push_controller:
// manual validation, JSON { message } errors, console.error('[trophies ...]').
//
// Reads (list) are open to any authenticated user. Writes (create/update/
// delete) are admin-gated at the router level (see trophies_routes.js).
//
// Not touched here (kept decoupled and intact):
//   - the streak auto-unlock engine (gamificationService + src/lib/trophies.js)
//   - the award/revoke flow (push_controller: POST /api/notifications, etc.),
//     which is key-agnostic → new catalog keys are awardable with no changes.

const Trophy = require('../models/trophy');
const { uploadImage, deleteImage, isConfigured } = require('../lib/cloudinary');

const MAX_NAME = 80;
const MAX_LABEL = 60;
const MAX_DESC = 500;

// Accent-stripped, lowercase, underscore slug. Stable key for a trophy.
const slugify = (str) =>
  (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'trofeo';

// Ensure the generated key doesn't collide with an existing one.
const uniqueKey = async (base) => {
  let key = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Trophy.exists({ key })) {
    n += 1;
    key = `${base}_${n}`;
  }
  return key;
};

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// GET /api/trophies
exports.listTrophies = async (req, res) => {
  try {
    const trophies = await Trophy.find()
      .sort({ order: 1, weeks: 1, createdAt: 1 })
      .lean();
    return res.json({ trophies });
  } catch (err) {
    console.error('[trophies list] error:', err);
    return res.status(500).json({ message: 'Error cargando los trofeos' });
  }
};

// POST /api/trophies   (multipart: image + name + label? + description?)
// New trophies are always special/manual (adminOnly:true, weeks:null, system:false).
exports.createTrophy = async (req, res) => {
  const name = str(req.body && req.body.name);
  const label = str(req.body && req.body.label);
  const description = str(req.body && req.body.description);

  if (!name) return res.status(400).json({ message: 'El título es requerido' });
  if (name.length > MAX_NAME) return res.status(400).json({ message: `El título no puede exceder ${MAX_NAME} caracteres` });
  if (label.length > MAX_LABEL) return res.status(400).json({ message: `El subtítulo no puede exceder ${MAX_LABEL} caracteres` });
  if (description.length > MAX_DESC) return res.status(400).json({ message: `La descripción no puede exceder ${MAX_DESC} caracteres` });
  if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'La imagen es requerida' });
  if (!isConfigured()) return res.status(503).json({ message: 'Cloudinary no está configurado en el servidor' });

  try {
    const key = await uniqueKey(slugify(name));
    const uploaded = await uploadImage(req.file.buffer, key); // → bullfit/trophies/<key>-Bullfit
    const trophy = await Trophy.create({
      key,
      name,
      label,
      description,
      imageUrl: uploaded.secure_url,
      imagePublicId: uploaded.public_id,
      weeks: null,
      adminOnly: true,
      system: false,
      order: 100,
    });
    return res.status(201).json({ trophy });
  } catch (err) {
    console.error('[trophies create] error:', err);
    return res.status(500).json({ message: 'Error creando el trofeo' });
  }
};

// PUT /api/trophies/:id   (multipart: name?/label?/description? + optional image)
// Edits CONTENT of ANY trophy, including the 6 protected `system` medals.
// Never changes key/weeks/system (those define the game mechanics).
exports.updateTrophy = async (req, res) => {
  const { id } = req.params;
  try {
    const trophy = await Trophy.findById(id);
    if (!trophy) return res.status(404).json({ message: 'Trofeo no encontrado' });

    if (req.body && typeof req.body.name === 'string') {
      const name = str(req.body.name);
      if (!name) return res.status(400).json({ message: 'El título no puede quedar vacío' });
      if (name.length > MAX_NAME) return res.status(400).json({ message: `El título no puede exceder ${MAX_NAME} caracteres` });
      trophy.name = name;
    }
    if (req.body && typeof req.body.label === 'string') {
      const label = str(req.body.label);
      if (label.length > MAX_LABEL) return res.status(400).json({ message: `El subtítulo no puede exceder ${MAX_LABEL} caracteres` });
      trophy.label = label;
    }
    if (req.body && typeof req.body.description === 'string') {
      const description = str(req.body.description);
      if (description.length > MAX_DESC) return res.status(400).json({ message: `La descripción no puede exceder ${MAX_DESC} caracteres` });
      trophy.description = description;
    }

    // Optional image replacement: upload the new one, then best-effort delete the old.
    if (req.file && req.file.buffer) {
      if (!isConfigured()) return res.status(503).json({ message: 'Cloudinary no está configurado en el servidor' });
      const uploaded = await uploadImage(req.file.buffer, trophy.key); // reutiliza <key>-Bullfit
      const oldPublicId = trophy.imagePublicId;
      trophy.imageUrl = uploaded.secure_url;
      trophy.imagePublicId = uploaded.public_id;
      await trophy.save();
      if (oldPublicId && oldPublicId !== uploaded.public_id) {
        deleteImage(oldPublicId).catch((e) =>
          console.error('[trophies update] no se pudo borrar la imagen previa:', e && e.message));
      }
      return res.json({ trophy });
    }

    await trophy.save();
    return res.json({ trophy });
  } catch (err) {
    console.error('[trophies update] error:', err);
    return res.status(500).json({ message: 'Error actualizando el trofeo' });
  }
};

// DELETE /api/trophies/:id
// Protected system medals (the 6 streak ones) can't be deleted.
exports.deleteTrophy = async (req, res) => {
  const { id } = req.params;
  try {
    const trophy = await Trophy.findById(id);
    if (!trophy) return res.status(404).json({ message: 'Trofeo no encontrado' });
    if (trophy.system) {
      return res.status(403).json({ message: 'Este trofeo es de racha y está protegido: no se puede eliminar' });
    }
    if (trophy.imagePublicId) {
      await deleteImage(trophy.imagePublicId).catch((e) =>
        console.error('[trophies delete] Cloudinary:', e && e.message));
    }
    await Trophy.findByIdAndDelete(id);
    return res.status(204).end();
  } catch (err) {
    console.error('[trophies delete] error:', err);
    return res.status(500).json({ message: 'Error eliminando el trofeo' });
  }
};
