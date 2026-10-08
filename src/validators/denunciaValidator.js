const { z } = require('./commonValidator');

const denunciaSchema = z.object({
  corrida_id: z.coerce.number().int().positive(),
  denunciado_id: z.coerce.number().int().positive(),
  motivo: z.enum(['direcao_perigosa', 'assedio', 'agressao', 'roubo', 'fraude', 'outro']),
  descricao: z.string().trim().max(2000).optional(),
}).strict();

module.exports = { denunciaSchema };
