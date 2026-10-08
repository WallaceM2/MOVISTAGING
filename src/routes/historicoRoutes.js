const express = require('express');
const router = express.Router();
const controller = require('../controllers/historicoController');
const { verificarToken, permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const asyncHandler = require('../middlewares/asyncHandler');
router.get('/extrato', verificarToken, permitirTipo('motorista', 'passageiro'), exigirContaAtiva, asyncHandler(controller.consultarExtrato));
module.exports = router;
