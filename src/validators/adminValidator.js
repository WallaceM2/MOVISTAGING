const { z, email } = require('./commonValidator');
const loginSchema = z.object({ email, senha: z.string().min(1).max(128) }).strict();
const statusMotoristaSchema = z.object({ status: z.enum(['em_analise', 'aprovado', 'reprovado', 'ativa', 'suspensa', 'banida']) }).strict();
const statusPassageiroSchema = z.object({ status: z.enum(['ativa', 'suspensa', 'banida']) }).strict();
const verificarMotoristaSchema = z.object({
  categoria_cnh: z.string().trim().max(10).optional(),
  ear_confirmada: z.boolean().optional(),
  antecedentes_verificados: z.boolean().optional(),
  validar_cnh: z.boolean().default(false),
  validar_veiculo: z.boolean().default(false),
  validar_antecedentes: z.boolean().default(false),
}).strict();
module.exports = { loginSchema, statusMotoristaSchema, statusPassageiroSchema, verificarMotoristaSchema };
