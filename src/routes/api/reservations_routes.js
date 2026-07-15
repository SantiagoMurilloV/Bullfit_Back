const express = require('express');
const router = express.Router();
const reservationsControllers = require('../../controllers/reservations_controllers');
const { requireAuth, requireSelfOrAdmin } = require('../../middleware/auth');

// Sprint 3.C.2: all reservation endpoints now require a valid JWT.
// Autorización horizontal: las rutas por :userId exigen ser el propio usuario
// o admin (privacidad de Bull customer: solo puede ver SUS datos).
router.use(requireAuth);

router.get('/reservations', reservationsControllers.getAllReservations);
router.get('/reservations/week', reservationsControllers.getReservationsByWeek);
router.get('/reservations/:userId', requireSelfOrAdmin('userId'), reservationsControllers.getUserReservations);
router.get('/reservationsid/:userId', requireSelfOrAdmin('userId'), reservationsControllers.getAllReservationsId);
router.get('/reservationsHistory/:userId', requireSelfOrAdmin('userId'), reservationsControllers.getUserReservationHistory);
router.get('/reservationsAbsences', reservationsControllers.getAbsencesByUser);
router.get('/reservationsInactivity', reservationsControllers.getInactivityByUser);
router.post('/reservations', reservationsControllers.createReservation);
router.put('/reservations/:reservationId', reservationsControllers.updateUserTrainingType);
router.delete('/reservations/:reservationId', reservationsControllers.deleteReservation);
router.get('/counter', reservationsControllers.getMonthlyCounts)
module.exports = router;