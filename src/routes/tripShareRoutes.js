const express = require('express');
const { z } = require('zod');
const router = express.Router();
const verificarToken = require('../middlewares/autenticacao');
const { permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const idempotency = require('../middlewares/idempotency');
const { limiteGeral } = require('../middlewares/rateLimiter');
const controller = require('../controllers/tripShareController');
const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.post('/corridas/:id/compartilhamento', verificarToken, permitirTipo('passageiro'), exigirContaAtiva, validar.validarParams(idSchema), idempotency(), asyncHandler(controller.criar));
router.delete('/corridas/:id/compartilhamento', verificarToken, permitirTipo('passageiro'), exigirContaAtiva, validar.validarParams(idSchema), asyncHandler(controller.revogar));
router.get('/compartilhar/:token', limiteGeral, asyncHandler(controller.paginaPublica));

module.exports = router;
