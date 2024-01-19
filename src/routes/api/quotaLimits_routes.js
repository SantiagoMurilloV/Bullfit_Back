// routes/slotRoutes.js
const express = require('express');
const router = express.Router();
const slotController = require('../../controllers/quotaLimits_controller');


router.post('/slots', slotController.createSlot);

router.put('/slots/:day/:hour', slotController.updateSlot);

router.get('/slots', slotController.getSlots);


module.exports = router;
