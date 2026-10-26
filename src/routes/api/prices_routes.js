const express = require('express');
const router = express.Router();
const pricesController = require('../../controllers/prices_controller');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

// Reading the catalog is needed by every authenticated user (daily-plan
// totals, guest pass price), so GET stays at requireAuth. Writes change what
// everyone gets charged, so they are admin-only.
router.use(requireAuth);

router.get('/prices', pricesController.getAllPrices);
router.get('/prices/:id', pricesController.getPriceById);
router.post('/prices', requireAdmin, pricesController.createPrice);
router.put('/prices/:id', requireAdmin, pricesController.updatePrice);
router.delete('/prices/:id', requireAdmin, pricesController.deletePrice);

module.exports = router;
