const express = require('express');
const router = express.Router();
const pricesController = require('../../controllers/prices_controller');

router.post('/prices', pricesController.createPrice);
router.get('/prices', pricesController.getAllPrices);
router.get('/prices/:id', pricesController.getPriceById);
router.put('/prices/:id', pricesController.updatePrice);
router.delete('/prices/:id', pricesController.deletePrice);

module.exports = router;
