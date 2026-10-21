const { z } = require('./commonValidator');
const driverComplimentSchema = z.enum([
  'atencioso',
  'veiculo_limpo',
  'boa_rota',
  'atendimento_excelente',
  'viagem_confortavel',
  'direcao_segura',
]);
const avaliacaoSchema = z.object({
  corrida_id: z.coerce.number().int().positive(),
  avaliado_tipo: z.enum(['motorista', 'passageiro']),
  avaliado_id: z.coerce.number().int().positive(),
  nota: z.coerce.number().int().min(1).max(5),
  tag: z.string().trim().max(60).optional(),
  tags: z.array(driverComplimentSchema).max(6).optional(),
  comentario: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.tags?.length && value.avaliado_tipo !== 'motorista') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tags'], message: 'Os elogios estão disponíveis para avaliações de motoristas.' });
  }
  if (value.tags?.length && value.nota !== 5) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tags'], message: 'Os elogios positivos estão disponíveis para avaliações de 5 estrelas.' });
  }
});
module.exports = { avaliacaoSchema, driverComplimentSchema };
