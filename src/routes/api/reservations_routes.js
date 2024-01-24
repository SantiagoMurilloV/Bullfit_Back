const express = require('express');
const router = express.Router();
const reservationsControllers = require('../../controllers/reservations_controllers');

router.get('/reservations', reservationsControllers.getAllReservations);
router.get('/reservations/:userId', reservationsControllers.getUserReservations);
router.get('/reservationsid/:userId', reservationsControllers.getAllReservationsId);
router.post('/reservations', reservationsControllers.createReservation);
router.put('/reservations/:reservationId', reservationsControllers.updateUserTrainingType);
router.delete('/reservations/:reservationId', reservationsControllers.deleteReservation);
router.get('/counter',reservationsControllers.getMonthlyCounts)
module.exports = router;