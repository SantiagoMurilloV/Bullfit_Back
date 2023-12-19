const express = require('express');
const router = express.Router();
const usersController = require('../../controllers/users_controller');
const { body } = require('express-validator');

router.post('/users', [
  body('Phone').isMobilePhone(),
  body('IdentificationNumber').isLength({ min: 5 })
], usersController.createUser);

router.get('/users', usersController.getAllUsers);
router.get('/users/:userId', usersController.getUserById);
router.put('/users/:userId', usersController.updateUserStatus);

module.exports = router;
