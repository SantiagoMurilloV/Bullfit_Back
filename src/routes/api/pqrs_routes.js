const express = require('express');
const router = express.Router();
const pqrsController = require('../../controllers/pqrs_controllers');
const { requireAuth } = require('../../middleware/auth');

// Sprint 3.C.2: every PQRS endpoint now requires a valid JWT. Anonymous
// callers receive 401. The frontend interceptor (setupApiAuth) attaches
// the token automatically when one is stored.
router.use(requireAuth);

router.post('/pqr', pqrsController.createPqr);
router.get('/pqrs', pqrsController.getPqrs);
router.delete('/pqrs/:pqrId', pqrsController.deletePqr);

module.exports = router;