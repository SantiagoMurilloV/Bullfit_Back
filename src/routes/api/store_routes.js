const express = require('express');
const router = express.Router();
const storeController = require('../../controllers/store_controller');
const { requireAuth } = require('../../middleware/auth');

// Sprint 3.C.2: all store endpoints now require a valid JWT.
router.use(requireAuth);

router.post('/store', storeController.createStoreConsumption);
router.put('/store/:id', storeController.updateStoreConsumption);
router.get('/store', storeController.getAllStoreConsumptions);
router.get('/store/month/:month', storeController.getStoreConsumptionsByMonth);
router.get('/storeUser/:userId', storeController.getStoreConsumption);
router.delete('/store/:id', storeController.deleteStoreConsumption);

module.exports = router;
