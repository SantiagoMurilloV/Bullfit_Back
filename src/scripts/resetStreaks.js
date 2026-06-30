// src/scripts/resetStreaks.js
//
// Reset de un solo uso para el ARRANQUE del juego de rachas (1 de julio 2026).
// Hace dos cosas, en silencio (NO envía ninguna notificación a nadie):
//   1. Pone en cero la cuenta de racha GUARDADA de todos los usuarios.
//   2. Quita TODOS los trofeos otorgados (notificaciones type:'achievement' con
//      trophyKey) — el juego aún no empieza, así que todos parten sin medallas.
//
// ¿Cuándo correrlo? Una sola vez, al lanzar el juego (1 jul). En esa fecha nadie
// tiene aún asistencias dentro del juego, así que poner todo en cero == recalcular.
//
// Notas:
//   - Las medallas POR RACHA (1 mes … 1 año) son calculadas en vivo, no se guardan.
//     Con el piso de fecha en gamificationService (computeStreak /
//     computeStreakFromDays) ya quedan bloqueadas para todos hasta el 1 de julio,
//     así que no hay nada que borrar para esas.
//   - Borrar documentos NO dispara notificaciones: el usuario simplemente deja de
//     ver el trofeo / la racha.
//
// Uso:  node src/scripts/resetStreaks.js     (o: npm run reset-streaks)

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const UserStreak = require('../models/userStreak');
const UserNotification = require('../models/userNotification');

async function main() {
  const dbUrl = process.env.MONGODB_URL;
  if (!dbUrl) {
    console.error('Falta MONGODB_URL en el entorno (.env). Abortando.');
    process.exit(1);
  }

  await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 5000 });
  console.log('Conectado a MongoDB.');

  // 1) Racha guardada → cero para todos.
  const streakRes = await UserStreak.updateMany(
    {},
    {
      $set: {
        currentStreak: 0,
        longestStreak: 0,
        trophyLongestStreak: 0,
        totalActivities: 0,
        streakStartDate: null,
        lastAttendedDate: null,
        lastComputedAt: new Date(),
      },
    },
  );
  console.log(`Rachas reseteadas a cero: ${streakRes.modifiedCount} usuario(s).`);

  // 2) Trofeos otorgados → fuera (borrado silencioso, sin notificar).
  const trophyRes = await UserNotification.deleteMany({
    type: 'achievement',
    trophyKey: { $exists: true, $ne: null },
  });
  console.log(`Trofeos otorgados eliminados: ${trophyRes.deletedCount}.`);

  await mongoose.disconnect();
  console.log('Listo. El juego de rachas arranca desde cero, sin medallas, el 1 de julio.');
}

main().catch(async (err) => {
  console.error('Error en el reset:', err);
  try { await mongoose.disconnect(); } catch (_) { /* noop */ }
  process.exit(1);
});
