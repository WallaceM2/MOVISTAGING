const express = require('express');
const { z } = require('zod');
const router = express.Router();
const motoristaController = require('../controllers/motoristaController');
const verificarToken = require('../middlewares/autenticacao');
const { permitirTipo, exigirContaAtiva, exigirContaAtivaSemAprovacao } = require('../middlewares/autenticacao');
const { limiteAuth } = require('../middlewares/rateLimiter');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const { cadastroMotoristaSchema, loginSchema } = require('../validators/motoristaValidator');
const upload = require('../middlewares/upload');
const locationController = require('../controllers/motoristaLocationController');
const locationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  direcao: z.number().finite().min(0).lt(360).optional(),
  corrida_id: z.number().int().positive().optional(),
}).strict();

router.post('/motoristas', limiteAuth, validar(cadastroMotoristaSchema), asyncHandler(motoristaController.cadastrar));
router.post('/motoristas/login', limiteAuth, validar(loginSchema), asyncHandler(motoristaController.login));
router.get('/motoristas/perfil', verificarToken, permitirTipo('motorista'), asyncHandler(motoristaController.perfil));
router.post('/motoristas/localizacao', verificarToken, permitirTipo('motorista'), exigirContaAtiva, validar(locationSchema), asyncHandler(locationController.atualizar));
router.get('/motoristas', verificarToken, permitirTipo('admin'), asyncHandler(motoristaController.listar));
router.post('/motoristas/documentos', verificarToken, permitirTipo('motorista'), exigirContaAtivaSemAprovacao, upload.fields([
  { name: 'rg', maxCount: 1 }, { name: 'cnh', maxCount: 1 }, { name: 'foto_perfil', maxCount: 1 }, { name: 'documento_veiculo', maxCount: 1 },
]), require('../middlewares/upload').validarAssinaturaArquivo, asyncHandler(motoristaController.uploadDocumentos));

module.exports = router;
