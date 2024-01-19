const express = require('express');
const router = express.Router();
const storeController = require('../../controllers/store_controller');

router.post('/store', storeController.createStoreConsumption);
router.put('/store/:id', storeController.updateStoreConsumption);
router.get('/store', storeController.getAllStoreConsumptions);
router.get('/storeUser/:userId', storeController.getStoreConsumption);
router.delete('/store/:id', storeController.deleteStoreConsumption);

module.exports = router;
