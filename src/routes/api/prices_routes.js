const express = require('express');
const router = express.Router();
const pricesController = require('../../controllers/prices_controller');
const { requireAuth } = require('../../middleware/auth');

// Sprint 3.C.2: all prices endpoints now require a valid JWT. Reading the
// price catalog is needed by every authenticated user (it's surfaced when
// computing daily-plan totals), so requireAuth is the right level here.
// Sprint 3.E may upgrade write endpoints (POST/PUT/DELETE) to requireAdmin.
router.use(requireAuth);

router.post('/prices', pricesController.createPrice);
router.get('/prices', pricesController.getAllPrices);
router.get('/prices/:id', pricesController.getPriceById);
router.put('/prices/:id', pricesController.updatePrice);
router.delete('/prices/:id', pricesController.deletePrice);

module.exports = router;
