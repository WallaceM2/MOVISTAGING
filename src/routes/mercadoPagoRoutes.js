const express = require('express');
const router = express.Router();
const controller = require('../controllers/mercadoPagoController');
const asyncHandler = require('../middlewares/asyncHandler');
const { verificarToken, permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');

router.post('/motoristas/mercadopago/vinculacao', verificarToken, permitirTipo('motorista'), exigirContaAtiva, asyncHandler(controller.iniciarVinculacao));
router.get('/motoristas/mercadopago/vinculacao', verificarToken, permitirTipo('motorista'), asyncHandler(controller.estadoVinculacao));
router.get('/pagamentos/mercadopago/oauth/callback', asyncHandler(controller.callbackOAuth));
router.post('/pagamentos/mercadopago/webhook', asyncHandler(controller.receberWebhook));

module.exports = router;
