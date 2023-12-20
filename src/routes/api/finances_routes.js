const express = require('express');
const router = express.Router();
const financesController = require('../../controllers/finances_controllers');

router.get('/finances', financesController.getFinances);
router.post('/finances', financesController.calculateAndStoreFinances);


module.exports = router;
