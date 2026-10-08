const { z } = require('./commonValidator');
const avaliacaoSchema = z.object({
  corrida_id: z.coerce.number().int().positive(),
  avaliado_tipo: z.enum(['motorista', 'passageiro']),
  avaliado_id: z.coerce.number().int().positive(),
  nota: z.coerce.number().int().min(1).max(5),
  tag: z.string().trim().max(60).optional(),
  comentario: z.string().trim().max(1000).optional(),
}).strict();
module.exports = { avaliacaoSchema };
