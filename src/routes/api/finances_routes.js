const express = require('express');
const router = express.Router();
const financesController = require('../../controllers/finances_controllers');

router.post('/finances', financesController.financesUser);
router.put('/finances/:userId',financesController.updateUserFinance);
router.get('/finances', financesController.getAllUsersFinances);
router.get('/finances/:userId', financesController.getUserFinance);
router.delete('/finances/:userId', financesController.deleteUsers);

module.exports = router;
