const express = require('express');
const router = express.Router();
const controller = require('../controllers/avaliacaoController');
const { verificarToken, permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const validar = require('../middlewares/validar');
const { validarParams } = validar;
const asyncHandler = require('../middlewares/asyncHandler');
const { avaliacaoSchema } = require('../validators/avaliacaoValidator');
const { z } = require('zod');

router.post('/avaliacoes', verificarToken, permitirTipo('motorista', 'passageiro'), exigirContaAtiva, validar(avaliacaoSchema), asyncHandler(controller.criar));
router.get('/avaliacoes/:tipo/:id', verificarToken, permitirTipo('motorista', 'passageiro', 'admin'), validarParams(z.object({ tipo: z.enum(['motorista','passageiro']), id: z.coerce.number().int().positive() })), asyncHandler(controller.listarPorAvaliado));
module.exports = router;
