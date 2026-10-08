const express = require('express');
const router = express.Router();
const corridaController = require('../controllers/corridaController');
const { verificarToken, permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const validar = require('../middlewares/validar');
const { validarParams } = validar;
const asyncHandler = require('../middlewares/asyncHandler');
const { corridaSchema, finalizacaoSchema, codigoEmbarqueSchema } = require('../validators/corridaValidator');
const { z } = require('zod');
const idempotency = require('../middlewares/idempotency');

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const authPassenger = [verificarToken, permitirTipo('passageiro'), exigirContaAtiva];
const authDriver = [verificarToken, permitirTipo('motorista'), exigirContaAtiva];

router.post('/estimar', ...authPassenger, validar(corridaSchema), asyncHandler(corridaController.estimar));
router.post('/solicitar', ...authPassenger, validar(corridaSchema), idempotency(), asyncHandler(corridaController.solicitarCorrida));
router.get('/ofertas', ...authDriver, asyncHandler(corridaController.listarOfertas));
router.get('/:id', verificarToken, validarParams(idSchema), asyncHandler(corridaController.verCorrida));
router.post('/:id/recusar', ...authDriver, validarParams(idSchema), idempotency(), asyncHandler(corridaController.recusarCorrida));
router.post('/:id/aceitar', ...authDriver, validarParams(idSchema), idempotency(), asyncHandler(corridaController.aceitarCorrida));
router.post('/:id/iniciar', ...authDriver, validarParams(idSchema), validar(codigoEmbarqueSchema), idempotency(), asyncHandler(corridaController.iniciarEmbarque));
router.post('/:id/finalizar', ...authDriver, validarParams(idSchema), validar(finalizacaoSchema), idempotency(), asyncHandler(corridaController.finalizarCorrida));
router.post('/:id/cancelar', verificarToken, exigirContaAtiva, validarParams(idSchema), idempotency(), asyncHandler(corridaController.cancelarCorrida));

module.exports = router;
