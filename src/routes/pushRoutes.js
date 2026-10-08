const express = require('express');
const { z } = require('zod');
const router = express.Router();
const verificarToken = require('../middlewares/autenticacao');
const { permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const idempotency = require('../middlewares/idempotency');
const controller = require('../controllers/pushController');

const deviceSchema = z.object({
  expo_push_token: z.string().trim().min(30).max(255).regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/),
  plataforma: z.enum(['ios', 'android']),
  app_id: z.enum(['movi-passageiro', 'movi-motorista']),
}).strict();
const removeSchema = z.object({ expo_push_token: deviceSchema.shape.expo_push_token }).strict();
const auth = [verificarToken, permitirTipo('motorista', 'passageiro'), exigirContaAtiva];

router.post('/notificacoes/dispositivo', ...auth, validar(deviceSchema), idempotency(), asyncHandler(controller.registrarDispositivo));
router.delete('/notificacoes/dispositivo', ...auth, validar(removeSchema), asyncHandler(controller.removerDispositivo));

module.exports = router;
