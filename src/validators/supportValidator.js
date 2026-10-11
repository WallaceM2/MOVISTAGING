const { z } = require('./commonValidator');

const category = z.enum(['corrida', 'pagamento', 'conta', 'seguranca', 'outro']);
const status = z.enum(['aberto', 'em_atendimento', 'aguardando_usuario', 'resolvido', 'fechado']);

const createTicketSchema = z.object({
  corrida_id: z.coerce.number().int().positive().optional(),
  categoria: category,
  assunto: z.string().trim().min(4).max(160),
  mensagem: z.string().trim().min(20, 'Descreva o que aconteceu com pelo menos 20 caracteres.').max(4000),
}).strict();

const messageSchema = z.object({
  mensagem: z.string().trim().min(1).max(4000),
}).strict();

const updateStatusSchema = z.object({
  status,
}).strict();

const adminFilterSchema = z.object({
  status: status.optional(),
  categoria: category.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(1000000).optional(),
}).strict();

const triageSchema = z.object({
  pergunta: z.string().trim().min(3).max(1000),
}).strict();

module.exports = { createTicketSchema, messageSchema, updateStatusSchema, adminFilterSchema, triageSchema };
