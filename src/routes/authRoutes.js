const express = require('express');
const z = require('zod');
const router = express.Router();
const validar = require('../middlewares/validar');
const verificarToken = require('../middlewares/autenticacao');
const asyncHandler = require('../middlewares/asyncHandler');
const { limiteAuth } = require('../middlewares/rateLimiter');
const authController = require('../controllers/authController');
const idempotency = require('../middlewares/idempotency');

const refreshSchema = z.object({ refresh_token: z.string().min(20).max(500) }).strict();
const logoutSchema = z.object({ refresh_token: z.string().min(20).max(500) }).strict();
const changePasswordSchema = z.object({ senha_atual: z.string().min(1).max(128), nova_senha: z.string().min(8).max(128) }).strict();

router.post('/auth/refresh', limiteAuth, validar(refreshSchema), asyncHandler(authController.renovar));
router.post('/auth/logout', verificarToken, validar(logoutSchema), idempotency(), asyncHandler(authController.logout));
router.post('/auth/change-password', verificarToken, validar(changePasswordSchema), idempotency(), asyncHandler(authController.trocarSenha));

module.exports = router;
