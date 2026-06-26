const express = require('express');
const router = express.Router();
const reservationsControllers = require('../../controllers/reservations_controllers');
const { requireAuth } = require('../../middleware/auth');

// Sprint 3.C.2: all reservation endpoints now require a valid JWT.
router.use(requireAuth);

router.get('/reservations', reservationsControllers.getAllReservations);
router.get('/reservations/week', reservationsControllers.getReservationsByWeek);
router.get('/reservations/:userId', reservationsControllers.getUserReservations);
router.get('/reservationsid/:userId', reservationsControllers.getAllReservationsId);
router.get('/reservationsHistory/:userId', reservationsControllers.getUserReservationHistory);
router.get('/reservationsAbsences', reservationsControllers.getAbsencesByUser);
router.post('/reservations', reservationsControllers.createReservation);
router.put('/reservations/:reservationId', reservationsControllers.updateUserTrainingType);
router.delete('/reservations/:reservationId', reservationsControllers.deleteReservation);
router.get('/counter', reservationsControllers.getMonthlyCounts)
module.exports = router;