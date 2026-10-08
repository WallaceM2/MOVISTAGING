const { z, coordenadas, idParamSchema } = require('./commonValidator');

const corridaSchema = z.object({
  origem: z.string().trim().min(3).max(300),
  destino: z.string().trim().min(3).max(300),
  ...coordenadas.shape,
  categoria: z.enum(['carro', 'moto']),
  forma_pagamento: z.enum(['dinheiro', 'cartao', 'pix']).default('dinheiro'),
}).strict();

const finalizacaoSchema = z.object({
  status_pagamento: z.enum(['pago', 'parcial', 'nao_pago']),
  valor_recebido_motorista: z.coerce.number().min(0).nullable().optional(),
  observacao_pagamento: z.string().trim().max(500).optional(),
}).strict();

const codigoEmbarqueSchema = z.object({
  codigo_embarque: z.string().trim().regex(/^[0-9A-Fa-f]{6}$/, 'Informe o código de embarque de 6 caracteres.'),
}).strict();

const avaliacao = idParamSchema;

module.exports = { corridaSchema, finalizacaoSchema, codigoEmbarqueSchema, avaliacao };
