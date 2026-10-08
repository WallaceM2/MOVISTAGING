const express = require('express');
const router = express.Router();
const controller = require('../controllers/legalController');
const { verificarToken } = require('../middlewares/autenticacao');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const idempotency = require('../middlewares/idempotency');
const { aceiteSchema } = require('../validators/legalValidator');

router.get('/legal/publicos/:tipo', asyncHandler(controller.listarDocumentosPublicos));
router.get('/legal/documentos', verificarToken, asyncHandler(controller.listarDocumentosAtuais));
router.post('/legal/aceites', verificarToken, validar(aceiteSchema), idempotency(), asyncHandler(controller.aceitar));

module.exports = router;
