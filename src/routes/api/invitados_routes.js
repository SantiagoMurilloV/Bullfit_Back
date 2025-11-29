const express = require('express');
const router = express.Router();
const invitadosController = require('../../controllers/invitados_controller');

router.get('/invitados', invitadosController.getAllInvitados);
router.get('/invitados/usuario/:userId', invitadosController.getInvitadosByUser);
router.get('/invitados/:invitadoId', invitadosController.getInvitadoById);
router.post('/invitados', invitadosController.createInvitado);
router.delete('/invitados/:invitadoId', invitadosController.deleteInvitado);

module.exports = router;
