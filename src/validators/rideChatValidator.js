const { z } = require('zod');

const createMessageSchema = z.object({
  client_message_id: z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
  tipo: z.enum(['texto', 'imagem', 'audio']),
  mensagem: z.string().trim().max(1000).optional(),
}).superRefine((body, context) => {
  if (body.tipo === 'texto' && !body.mensagem) context.addIssue({ code: z.ZodIssueCode.custom, path: ['mensagem'], message: 'Escreva uma mensagem.' });
});

module.exports = { createMessageSchema };
