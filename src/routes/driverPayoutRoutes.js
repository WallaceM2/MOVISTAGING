const express = require('express');
const router = express.Router();
const controller = require('../controllers/driverPayoutController');
const { verificarToken, permitirTipo, exigirContaAtivaSemAprovacao } = require('../middlewares/autenticacao');
const asyncHandler = require('../middlewares/asyncHandler');
const validar = require('../middlewares/validar');
const idempotency = require('../middlewares/idempotency');
const { payoutAccountSchema, payoutPinSchema } = require('../validators/driverPayoutValidator');

const driverOnly = [verificarToken, permitirTipo('motorista'), exigirContaAtivaSemAprovacao];
router.get('/motoristas/recebimento', ...driverOnly, asyncHandler(controller.getAccount));
router.put('/motoristas/recebimento', ...driverOnly, validar(payoutAccountSchema), idempotency(), asyncHandler(controller.saveAccount));
router.put('/motoristas/saques/pin', ...driverOnly, validar(payoutPinSchema), idempotency(), asyncHandler(controller.setPin));

module.exports = router;
