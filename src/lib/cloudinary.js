// src/lib/cloudinary.js
// Thin wrapper around the Cloudinary SDK for the trophy library.
//
// Only the trophy IMAGE lives in Cloudinary; all metadata (name, description,
// etc.) lives in Mongo (see src/models/trophy.js). Configuration comes from
// three env vars — set them locally in .env and in the DigitalOcean App
// Platform env for production. The API secret must NEVER reach the frontend.
//
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//
// The module does NOT throw at require-time when the vars are missing, so the
// server still boots without Cloudinary configured; upload/delete just fail
// with a clear error (or no-op for delete) until the vars are set.

const { v2: cloudinary } = require('cloudinary');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

const isConfigured = () => Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (isConfigured()) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
} else {
  console.warn(
    '[cloudinary] Faltan CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en el entorno — ' +
    'la subida/borrado de imágenes queda deshabilitada hasta configurarlas.',
  );
}

// All trophy artwork lives under this Cloudinary folder.
const FOLDER = 'bullfit/trophies';

// Every asset uploaded from Bullfit gets this suffix on its public_id name, so
// Bullfit's uploads are recognizable in the (shared) Cloudinary account.
// e.g. key "guerrero" → public_id "bullfit/trophies/guerrero-Bullfit".
const BRAND_SUFFIX = '-Bullfit';

const withBrandSuffix = (publicId) => {
  const base = String(publicId);
  return base.endsWith(BRAND_SUFFIX) ? base : `${base}${BRAND_SUFFIX}`;
};

/**
 * Upload an image buffer to Cloudinary. The resulting public_id name ALWAYS ends
 * with `-Bullfit` (the Bullfit brand suffix).
 * @param {Buffer} buffer  raw image bytes (multer memoryStorage → req.file.buffer)
 * @param {string} [publicId]  stable leaf id (e.g. the trophy key). The final
 *   public_id is `${FOLDER}/${publicId}-Bullfit` and uploads overwrite it
 *   (idempotent). When omitted, Cloudinary auto-generates a random id and we
 *   still append the brand suffix.
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
const uploadImage = (buffer, publicId) =>
  new Promise((resolve, reject) => {
    if (!isConfigured()) {
      return reject(new Error('Cloudinary no está configurado (faltan CLOUDINARY_* en el entorno).'));
    }
    if (!buffer || !buffer.length) {
      return reject(new Error('Buffer de imagen vacío.'));
    }
    const options = {
      folder: FOLDER,
      resource_type: 'image',
      overwrite: true,
      public_id: withBrandSuffix(publicId || `trofeo-${Date.now()}`),
    };
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      return resolve({ secure_url: result.secure_url, public_id: result.public_id });
    });
    stream.end(buffer);
  });

/**
 * Delete an image from Cloudinary by its full public_id. Safe no-op when
 * Cloudinary isn't configured or no id is given.
 * @param {string} publicId
 */
const deleteImage = (publicId) => {
  if (!isConfigured()) return Promise.resolve({ result: 'skipped-not-configured' });
  if (!publicId) return Promise.resolve({ result: 'no-public-id' });
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
};

module.exports = { cloudinary, isConfigured, uploadImage, deleteImage, FOLDER };
