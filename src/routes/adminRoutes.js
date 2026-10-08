const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const verificarToken = require('../middlewares/autenticacao');
const { permitirTipo, exigirContaAtiva } = require('../middlewares/autenticacao');
const { limiteAuth } = require('../middlewares/rateLimiter');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const { loginSchema, statusMotoristaSchema, statusPassageiroSchema, verificarMotoristaSchema } = require('../validators/adminValidator');
const { validarParams } = validar;
const { z } = require('zod');
const idSchema = z.object({ id: z.coerce.number().int().positive() });

const adminOnly = [verificarToken, permitirTipo('admin'), exigirContaAtiva];
router.post('/admin/login', limiteAuth, validar(loginSchema), asyncHandler(adminController.login));
router.get('/admin/motoristas', ...adminOnly, asyncHandler(adminController.listarMotoristas));
router.get('/admin/passageiros', ...adminOnly, asyncHandler(adminController.listarPassageiros));
router.get('/admin/motoristas/:id', ...adminOnly, validarParams(idSchema), asyncHandler(adminController.verMotorista));
router.patch('/admin/motoristas/:id/verificacao', ...adminOnly, validarParams(idSchema), validar(verificarMotoristaSchema), asyncHandler(adminController.verificarMotorista));
router.patch('/admin/motoristas/:id/status', ...adminOnly, validarParams(idSchema), validar(statusMotoristaSchema), asyncHandler(adminController.atualizarStatusMotorista));
router.get('/admin/passageiros/:id', ...adminOnly, validarParams(idSchema), asyncHandler(adminController.verPassageiro));
router.patch('/admin/passageiros/:id/status', ...adminOnly, validarParams(idSchema), validar(statusPassageiroSchema), asyncHandler(adminController.atualizarStatusPassageiro));

module.exports = router;
