const express = require('express');
const router = express.Router();
const controller = require('../controllers/documentoController');
const { verificarToken, permitirTipo, exigirContaAtiva, exigirContaAtivaSemAprovacao } = require('../middlewares/autenticacao');
const { validarParams } = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const upload = require('../middlewares/upload');
const { z } = require('zod');

const paramsSchema = z.object({ tipo: z.enum(['motorista','passageiro']), id: z.coerce.number().int().positive(), documento: z.enum(['rg','cnh','foto_perfil','documento_veiculo']) });
router.post('/documentos/cnh', verificarToken, permitirTipo('motorista'), exigirContaAtivaSemAprovacao, upload.single('foto'), upload.validarAssinaturaArquivo, asyncHandler(controller.enviarCnh));
router.get('/documentos/:tipo/:id/:documento', verificarToken, permitirTipo('motorista', 'passageiro', 'admin'), exigirContaAtiva, validarParams(paramsSchema), asyncHandler(controller.gerarUrl));
module.exports = router;
