// routes/slotRoutes.js
const express = require('express');
const router = express.Router();
const slotController = require('../../controllers/quotaLimits_controller');
const { requireAuth } = require('../../middleware/auth');

// Sprint 3.C.2: every quota/slot endpoint now requires a valid JWT. The
// reservation flow needs this on every page load so it stays at the
// requireAuth (not requireAdmin) level. Write endpoints can be elevated
// to requireAdmin in Sprint 3.E.
router.use(requireAuth);

router.post('/slots', slotController.createSlot);

router.put('/slots/:day/:hour', slotController.updateSlot);

router.get('/slots', slotController.getSlots);


module.exports = router;
