const express = require('express');
const router = express.Router();
const financesController = require('../../controllers/finances_controllers');
const { requireAuth, requireSelfOrAdmin } = require('../../middleware/auth');

// Sprint 3.C.2: all finance endpoints now require a valid JWT.
// Autorización horizontal: /finances/:userId ahora exige ser el propio
// usuario o admin (privacidad de Bull customer, el "Sprint 3.E" pendiente).
router.use(requireAuth);

router.post('/finances', financesController.financesUser);
router.put('/userFinance/:userId', financesController.updateFinanceByUserId);
router.put('/finance/:financeId', financesController.updateFinanceById);
router.get('/finances', financesController.getAllUsersFinances);
router.get('/finances/all', financesController.getEveryFinance);
router.get('/finances/month/:month', financesController.getFinancesByMonth);
router.get('/getAllDiaryUsersFinances',financesController.getAllDiaryUsersFinances);
router.get('/finances/:userId', requireSelfOrAdmin('userId'), financesController.getUserFinance);
router.delete('/finances/:userId', financesController.deleteUsers);
router.delete('/deleteFinances/:financeId', financesController.deleteFiance);

module.exports = router;
