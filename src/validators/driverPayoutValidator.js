const { z, email, cpf, telefone } = require('./commonValidator');

const payoutAccountSchema = z.object({
  tipo_chave_pix: z.enum(['cpf', 'email', 'telefone', 'aleatoria']),
  chave_pix: z.string().trim().min(5).max(200),
  banco: z.string().trim().min(2).max(100),
  agencia: z.string().trim().min(1).max(20),
  conta: z.string().trim().min(2).max(30),
  tipo_conta: z.enum(['corrente', 'poupanca', 'pagamento']),
}).strict().superRefine((data, ctx) => {
  if (data.tipo_chave_pix === 'email' && !email.safeParse(data.chave_pix).success) ctx.addIssue({ code: 'custom', path: ['chave_pix'], message: 'Informe um e-mail válido para a chave Pix.' });
  if (data.tipo_chave_pix === 'cpf' && !cpf.safeParse(data.chave_pix).success) ctx.addIssue({ code: 'custom', path: ['chave_pix'], message: 'Informe um CPF válido para a chave Pix.' });
  if (data.tipo_chave_pix === 'telefone' && !telefone.safeParse(data.chave_pix).success) ctx.addIssue({ code: 'custom', path: ['chave_pix'], message: 'Informe um telefone válido para a chave Pix.' });
  if (data.tipo_chave_pix === 'aleatoria' && !/^[0-9a-f-]{32,36}$/i.test(data.chave_pix)) ctx.addIssue({ code: 'custom', path: ['chave_pix'], message: 'Informe uma chave Pix aleatória válida.' });
});

const payoutPinSchema = z.object({
  pin_atual: z.string().regex(/^\d{4}$/).optional(),
  novo_pin: z.string().regex(/^\d{4}$/, 'O PIN deve ter exatamente 4 dígitos.'),
}).strict();

module.exports = { payoutAccountSchema, payoutPinSchema };
