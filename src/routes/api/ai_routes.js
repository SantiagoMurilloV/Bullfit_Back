const express = require('express');
const router = express.Router();
const aiController = require('../../controllers/ai_controller');
const { requireAuth } = require('../../middleware/auth');

// Requiere sesión válida: evita que terceros consuman nuestras API keys.
router.use(requireAuth);

router.post('/ai/chat', aiController.chat);

module.exports = router;
