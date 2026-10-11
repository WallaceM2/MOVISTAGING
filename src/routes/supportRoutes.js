const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/supportController');
const { verificarToken, permitirTipo } = require('../middlewares/autenticacao');
const validar = require('../middlewares/validar');
const asyncHandler = require('../middlewares/asyncHandler');
const idempotency = require('../middlewares/idempotency');
const { createTicketSchema, messageSchema, triageSchema } = require('../validators/supportValidator');

const router = express.Router();
const requesterOnly = [verificarToken, permitirTipo('motorista', 'passageiro')];
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const validateParams = validar.validarParams;

router.get('/suporte/faq', controller.listFaq);
router.post('/suporte/triagem', validar(triageSchema), controller.triage);

// Support stays reachable for authenticated users whose ride account is suspended or restricted.
router.post('/suporte/chamados', ...requesterOnly, validar(createTicketSchema), idempotency(), asyncHandler(controller.createTicket));
router.get('/suporte/chamados', ...requesterOnly, asyncHandler(controller.listRequesterTickets));
router.get('/suporte/chamados/:id', ...requesterOnly, validateParams(idSchema), asyncHandler(controller.getRequesterTicket));
router.post('/suporte/chamados/:id/mensagens', ...requesterOnly, validateParams(idSchema), validar(messageSchema), idempotency(), asyncHandler(controller.addRequesterMessage));

module.exports = router;
