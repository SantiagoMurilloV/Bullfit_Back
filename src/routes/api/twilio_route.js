const express = require('express');
const router = express.Router();

const notificationController = require('../../controllers/twilioHelper');

router.get('/send-notification', notificationController.sendNotification);

router.post('/send-notification', notificationController.sendNotification);


module.exports = router;
