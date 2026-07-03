// src/scripts/migrateTrophies.js
//
// Seeds the dynamic trophy catalog (Mongo collection `trophies`) with the 13
// original medals, uploading each PNG to Cloudinary. SAFE + IDEMPOTENT:
//   - Preserves the EXACT existing keys → already-awarded trophies and the
//     streak-unlock logic keep matching. Nothing else is touched.
//   - Cloudinary public_id is deterministic (`bullfit/trophies/<key>-Bullfit`,
//     overwrite) and Mongo writes are upserts by `key` → re-running is safe.
//   - Only creates/updates the `trophies` collection. Does NOT modify users,
//     streaks, notifications, or any other data.
//
// The medal PNGs live in the FRONTEND repo (public/trophies/). Point the script
// at them with TROPHIES_DIR; the default assumes Bullfit_web_v2.0 is a sibling
// of Bullfit_Back under the same parent folder.
//
// Usage:
//   node src/scripts/migrateTrophies.js --dry-run     (no writes; just reports)
//   node src/scripts/migrateTrophies.js               (real run)
//   npm run migrate-trophies -- --dry-run
//   TROPHIES_DIR=/abs/path/to/public/trophies node src/scripts/migrateTrophies.js

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Trophy = require('../models/trophy');
const { uploadImage, isConfigured } = require('../lib/cloudinary');

const DRY_RUN = process.argv.includes('--dry-run');

// Default: <parent>/Bullfit_web_v2.0/public/trophies  (sibling repo layout).
const DEFAULT_DIR = path.resolve(__dirname, '../../..', 'Bullfit_web_v2.0/public/trophies');
const TROPHIES_DIR = process.env.TROPHIES_DIR || DEFAULT_DIR;

// The 13 original medals. keys/weeks/adminOnly/system MUST match the current
// system exactly. The 6 streak medals: weeks set, adminOnly:false, system:true
// (protected). The 7 specials: weeks:null, adminOnly:true, system:false.
const TROPHIES = [
  { key: 'iniciado',     name: 'Iniciado',     label: '1 mes',            img: 'iniciado.png',    weeks: 4,  adminOnly: false, system: true,  order: 1,  description: 'Arrancaste con todo y no fallaste. ¡El comienzo de algo grande!' },
  { key: 'constancia',   name: 'Constancia',   label: '2 meses',          img: 'constancia.png',  weeks: 9,  adminOnly: false, system: true,  order: 2,  description: 'Entrenar sin fallar ya no es esfuerzo: es hábito.' },
  { key: 'persistencia', name: 'Persistencia', label: '4 meses',          img: 'persistencia.png',weeks: 17, adminOnly: false, system: true,  order: 3,  description: 'No te rendiste. Ya es parte de quién eres.' },
  { key: 'seis_meses',   name: '6 Meses',      label: '6 meses',          img: '6-meses.png',     weeks: 26, adminOnly: false, system: true,  order: 4,  description: 'Disciplina pura, sin excusas. Eres imparable.' },
  { key: 'nueve_meses',  name: '9 Meses',      label: '9 meses',          img: '9-meses.png',     weeks: 39, adminOnly: false, system: true,  order: 5,  description: 'Entrega total, sin pausa. Casi una leyenda Bullfit.' },
  { key: 'un_ano',       name: '1 Año',        label: '1 año',            img: '1-ano.png',       weeks: 52, adminOnly: false, system: true,  order: 6,  description: '¡Lo lograste! Bienvenido a la élite Bullfit.' },
  { key: 'seis_de_seis', name: '6 de 6',       label: 'Constancia Total', img: '66.png',          weeks: null, adminOnly: true, system: false, order: 7,  description: 'Entrenaste los 6 días de la semana sin fallar ni uno. Constancia total, nivel élite.' },
  { key: 'burpees',      name: '100 Burpees',  label: 'Sin Parar',        img: 'BURPEES.png',     weeks: null, adminOnly: true, system: false, order: 8,  description: 'Completaste 100 burpees sin parar. Fuerza mental y física al máximo.' },
  { key: 'embajador',    name: 'Embajador',    label: 'Bullfit',          img: 'Embajador.PNG',   weeks: null, adminOnly: true, system: false, order: 9,  description: 'Representas a Bullfit con orgullo. +100 historias etiquetándonos.' },
  { key: 'fundador',     name: 'Fundador',     label: 'Desde 2020',       img: 'Fundador.png',    weeks: null, adminOnly: true, system: false, order: 10, description: 'Estuviste desde el principio. Eres parte de la historia de Bullfit.' },
  { key: 'lider',        name: 'Líder',        label: 'De la Manada',     img: 'Lider.png',       weeks: null, adminOnly: true, system: false, order: 11, description: 'Contribuyes al crecimiento de la comunidad. Trae +5 invitados nuevos.' },
  { key: 'madrugador',   name: 'Madrugador',   label: '6:00 AM',          img: 'Madrugador.png',  weeks: null, adminOnly: true, system: false, order: 12, description: 'Mientras otros duermen, tú ya entrenaste. Un mes completo entrenando a las 6 AM sin falta.' },
  { key: 'pierna',       name: 'Pierna',       label: '100 Entrenos',     img: 'Pierna.png',      weeks: null, adminOnly: true, system: false, order: 13, description: '100 entrenamientos cumplidos sin falta. Disciplina, fuerza y resultados.' },
];

async function main() {
  console.log(`\n=== Migración de trofeos a Cloudinary${DRY_RUN ? ' (DRY-RUN, sin escribir)' : ''} ===`);
  console.log(`Carpeta de imágenes: ${TROPHIES_DIR}`);

  // Pre-flight: verify every image file exists before touching anything.
  const missing = TROPHIES.filter((t) => !fs.existsSync(path.join(TROPHIES_DIR, t.img)));
  if (missing.length) {
    console.error(`\nFaltan ${missing.length} imagen(es) en ${TROPHIES_DIR}:`);
    missing.forEach((t) => console.error(`  - ${t.img} (${t.key})`));
    console.error('Ajusta TROPHIES_DIR o verifica los archivos. Abortando.');
    process.exit(1);
  }
  console.log(`Imágenes encontradas: ${TROPHIES.length}/${TROPHIES.length}.`);

  if (!isConfigured()) {
    console.error('\nCloudinary no está configurado (faltan CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en .env). Abortando.');
    process.exit(1);
  }

  const dbUrl = process.env.MONGODB_URL;
  if (!dbUrl) {
    console.error('\nFalta MONGODB_URL en el entorno (.env). Abortando.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\nDRY-RUN: se subirían/actualizarían estos trofeos (no se escribe nada):');
    TROPHIES.forEach((t) => console.log(`  - ${t.key.padEnd(14)} ${t.system ? '[racha/protegido]' : '[especial]'}  ${t.img}`));
    console.log('\nOK (dry-run). Ejecuta sin --dry-run para aplicar.');
    return;
  }

  await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 5000 });
  console.log('Conectado a MongoDB.');

  let created = 0;
  let updated = 0;
  for (const t of TROPHIES) {
    const buffer = fs.readFileSync(path.join(TROPHIES_DIR, t.img));
    // Deterministic public_id → idempotent overwrite on re-run.
    const uploaded = await uploadImage(buffer, t.key); // eslint-disable-line no-await-in-loop
    const res = await Trophy.updateOne(          // eslint-disable-line no-await-in-loop
      { key: t.key },
      {
        $set: {
          name: t.name,
          label: t.label,
          description: t.description,
          imageUrl: uploaded.secure_url,
          imagePublicId: uploaded.public_id,
          weeks: t.weeks,
          adminOnly: t.adminOnly,
          system: t.system,
          order: t.order,
        },
        $setOnInsert: { key: t.key },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created += 1;
    else updated += 1;
    console.log(`  ✓ ${t.key.padEnd(14)} → ${uploaded.secure_url}`);
  }

  console.log(`\nListo. Creados: ${created}, actualizados: ${updated}. Total: ${TROPHIES.length}.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nError en la migración:', err);
  try { await mongoose.disconnect(); } catch (_) { /* noop */ }
  process.exit(1);
});
