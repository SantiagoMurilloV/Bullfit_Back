const express = require('express');
const router = express.Router();
const financesController = require('../../controllers/finances_controllers');

router.post('/finances', financesController.financesUser);
router.put('/userFinance/:userId', financesController.updateFinanceByUserId);
router.put('/finance/:financeId', financesController.updateFinanceById);
router.get('/finances', financesController.getAllUsersFinances);
router.get('/finances/:userId', financesController.getUserFinance);
router.delete('/finances/:userId', financesController.deleteUsers);
router.delete('/deleteFinances/:financeId', financesController.deleteFiance);

module.exports = router;
