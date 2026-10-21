const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/rideChatController');
const { verificarToken, permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const idempotency = require('../middlewares/idempotency');
const { upload, validateChatMediaSignature } = require('../middlewares/chatUpload');
const { createMessageSchema } = require('../validators/rideChatValidator');
const { limiteChat } = require('../middlewares/rateLimiter');

const router = express.Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const participants = [verificarToken, permitirTipo('motorista', 'passageiro'), exigirContaAtiva];
const validateParams = validar.validarParams;

router.get('/:id/chat', ...participants, limiteChat, validateParams(idSchema), asyncHandler(controller.list));
router.post('/:id/chat', ...participants, limiteChat, validateParams(idSchema), upload.single('arquivo'), validateChatMediaSignature, validar(createMessageSchema), idempotency(), asyncHandler(controller.send));

module.exports = router;
