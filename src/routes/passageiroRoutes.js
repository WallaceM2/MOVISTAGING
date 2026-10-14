const express = require('express');
const router = express.Router();
const passageiroController = require('../controllers/passageiroController');
const { limiteAuth } = require('../middlewares/rateLimiter');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const { cadastroPassageiroSchema, loginSchema, respostaDebitoSchema, contestacaoTaxaCancelamentoSchema } = require('../validators/passageiroValidator');
const { z } = require('zod');
const upload = require('../middlewares/upload');
const verificarToken = require('../middlewares/autenticacao');
const { permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const idempotency = require('../middlewares/idempotency');

router.post('/passageiros', limiteAuth, validar(cadastroPassageiroSchema), asyncHandler(passageiroController.cadastrar));
router.post('/passageiros/login', limiteAuth, validar(loginSchema), asyncHandler(passageiroController.login));
router.get('/passageiros/perfil', verificarToken, permitirTipo('passageiro'), asyncHandler(passageiroController.perfil));
router.get('/passageiros', verificarToken, permitirTipo('admin'), asyncHandler(passageiroController.listar));
router.post('/passageiros/documentos', verificarToken, permitirTipo('passageiro'), exigirContaAtiva, upload.fields([
  { name: 'rg', maxCount: 1 }, { name: 'cnh', maxCount: 1 }, { name: 'foto_perfil', maxCount: 1 },
]), require('../middlewares/upload').validarAssinaturaArquivo, asyncHandler(passageiroController.uploadDocumentos));
router.post('/passageiros/quitar-debito', verificarToken, permitirTipo('passageiro'), exigirContaAtiva, idempotency(), asyncHandler(passageiroController.quitarDebito));
router.get('/passageiros/debitos', verificarToken, permitirTipo('passageiro'), asyncHandler(passageiroController.listarDebitos));
router.post('/passageiros/debitos/:corridaId/resposta', verificarToken, permitirTipo('passageiro'), exigirContaAtiva,
  validar.validarParams(z.object({ corridaId: z.coerce.number().int().positive() })), validar(respostaDebitoSchema), idempotency(), asyncHandler(passageiroController.responderDebito));
router.post('/passageiros/taxas-cancelamento/:corridaId/contestar', verificarToken, permitirTipo('passageiro'), exigirContaAtiva,
  validar.validarParams(z.object({ corridaId: z.coerce.number().int().positive() })), validar(contestacaoTaxaCancelamentoSchema), idempotency(), asyncHandler(passageiroController.contestarTaxaCancelamento));

module.exports = router;
