const express = require('express');
const router = express.Router();
const financesController = require('../../controllers/finances_controllers');
const { requireAuth } = require('../../middleware/auth');

// Sprint 3.C.2: all finance endpoints now require a valid JWT.
// Note: horizontal authorization (a non-admin user cannot read another
// user's finances) is intentionally NOT enforced in this commit. Today
// the bar is just "must be logged in". Sprint 3.E will add the
// requireSelfOrAdmin check to /finances/:userId style routes.
router.use(requireAuth);

router.post('/finances', financesController.financesUser);
router.put('/userFinance/:userId', financesController.updateFinanceByUserId);
router.put('/finance/:financeId', financesController.updateFinanceById);
router.get('/finances', financesController.getAllUsersFinances);
router.get('/finances/all', financesController.getEveryFinance);
router.get('/finances/month/:month', financesController.getFinancesByMonth);
router.get('/getAllDiaryUsersFinances',financesController.getAllDiaryUsersFinances);
router.get('/finances/:userId', financesController.getUserFinance);
router.delete('/finances/:userId', financesController.deleteUsers);
router.delete('/deleteFinances/:financeId', financesController.deleteFiance);

module.exports = router;
