const { z } = require('zod');

const documento = z.object({
  documento_tipo: z.enum(['termos_uso', 'aviso_privacidade', 'seguranca_confianca']),
  versao: z.string().trim().min(1).max(30),
}).strict();

const aceiteSchema = z.object({
  documentos: z.array(documento).min(1).max(3),
}).strict();

module.exports = { aceiteSchema };
