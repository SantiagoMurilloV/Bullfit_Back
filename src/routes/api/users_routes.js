const express = require('express');
const router = express.Router();
const usersController = require('../../controllers/users_controller');

router.post('/users', usersController.createUser);
router.get('/users', usersController.getAllUsers);
router.get('/users/:userId', usersController.getUserById);
router.put('/users/:userId', usersController.updateUserStatus);
router.delete('/users/:userId', usersController.deleteUsers);
module.exports = router;
