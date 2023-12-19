// routes/financesRoutes.js
const express = require('express');
const router = express.Router();
const financesController = require('../../controllers/finances_controllers');

router.get('/finances', financesController.getFinances);
router.post('/finances', financesController.calculateAndStoreFinances);
// Aquí puedes agregar más rutas si necesitas realizar otras operaciones

module.exports = router;
