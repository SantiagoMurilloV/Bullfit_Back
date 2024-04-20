const express = require('express');
const router = express.Router();
const pqrsController = require('../../controllers/pqrs_controllers');


router.post('/pqr', pqrsController.createPqr);
router.get('/pqrs', pqrsController.getPqrs);
router.delete('/pqrs/:pqrId', pqrsController.deletePqr);

module.exports = router;