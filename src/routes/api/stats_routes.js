const express = require('express');
const router = express.Router();
const statsController = require('../../controllers/stats_controller');

// Stats endpoint -- the frontend component has its own password gate
// (Bull_estadistica) so we skip requireAuth here to keep it simple.
// Only aggregated/anonymous data is returned.
router.get('/stats', statsController.getStats);

module.exports = router;
