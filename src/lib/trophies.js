// src/lib/trophies.js
// Trophy (achievement) definitions for the Bullfit "vitrina de trofeos".
// A trophy is unlocked when the user's best streak (longestStreak, in WEEKS)
// reaches `weeks`. Thresholds approximate months at ~52/12 weeks/month.
//
// Single source of truth on the backend (used to fire achievement
// notifications when a milestone is newly crossed). The frontend TrophyCase
// keeps a matching copy (with the medal artwork) — keep `key`/`weeks` in sync.

// The trophy system goes live on this date (Bogotá). Before it, no medal
// unlocks and no achievement notifications fire — everyone sees them locked.
const TROPHIES_START = '2026-07-01';

const TROPHIES = [
  { key: 'iniciado', name: 'Iniciado', label: '1 mes', weeks: 4,
    description: 'Arrancaste con todo y no fallaste. ¡El comienzo de algo grande!' },
  { key: 'constancia', name: 'Constancia', label: '2 meses', weeks: 9,
    description: 'Entrenar sin fallar ya no es esfuerzo: es hábito.' },
  { key: 'persistencia', name: 'Persistencia', label: '4 meses', weeks: 17,
    description: 'No te rendiste. Ya es parte de quién eres.' },
  { key: 'seis_meses', name: '6 Meses', label: '6 meses', weeks: 26,
    description: 'Disciplina pura, sin excusas. Eres imparable.' },
  { key: 'nueve_meses', name: '9 Meses', label: '9 meses', weeks: 39,
    description: 'Entrega total, sin pausa. Casi una leyenda Bullfit.' },
  { key: 'un_ano', name: '1 Año', label: '1 año', weeks: 52,
    description: '¡Lo lograste! Bienvenido a la élite Bullfit.' },
];

/**
 * Trophies newly unlocked when longestStreak moves from `prevWeeks` to
 * `newWeeks` (thresholds in the half-open range (prevWeeks, newWeeks]).
 */
const newlyUnlockedTrophies = (prevWeeks, newWeeks) =>
  TROPHIES.filter((t) => t.weeks > (prevWeeks || 0) && t.weeks <= (newWeeks || 0));

module.exports = { TROPHIES, TROPHIES_START, newlyUnlockedTrophies };
