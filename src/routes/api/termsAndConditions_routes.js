const express = require('express');
const router = express.Router();
const termController = require('../../controllers/termsAndConditions_controller'); 

router.post('/termsAndConditions', termController.createTermsAndConditions);

router.get('/termsAndConditions/:userId', termController.getTermsAndConditions);
module.exports = router;
