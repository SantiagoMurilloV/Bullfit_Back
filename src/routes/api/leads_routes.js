// src/routes/api/leads_routes.js
// Landing-page leads ("personas interesadas").
//   POST   /api/leads        - PUBLIC (the bullfit.co landing form)
//   GET    /api/leads        - admin, list (optional ?status=)
//   PATCH  /api/leads/:id     - admin, change status
//   DELETE /api/leads/:id     - admin, remove

const express = require('express');

const router = express.Router();
const ctrl = require('../../controllers/leads_controller');
const { requireAdmin } = require('../../middleware/auth');

router.post('/leads', ctrl.createLead);
router.get('/leads', requireAdmin, ctrl.listLeads);
router.patch('/leads/:id', requireAdmin, ctrl.updateLead);
router.delete('/leads/:id', requireAdmin, ctrl.deleteLead);

module.exports = router;
