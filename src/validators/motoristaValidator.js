const { z, cpf, email, telefone, senha, dateOfBirth } = require('./commonValidator');

const cadastroMotoristaSchema = z.object({
  nome: z.string().trim().min(2).max(100),
  sobrenome: z.string().trim().min(2).max(100),
  email,
  telefone,
  senha,
  data_nascimento: dateOfBirth(),
  nacionalidade: z.string().trim().max(80).optional(),
  cpf,
  rg: z.string().trim().max(30).optional(),
  cnh: z.string().trim().max(30).optional(),
  categoria_cnh: z.string().trim().max(10).optional(),
  regiao: z.string().trim().max(80).optional(),
  estado: z.string().trim().length(2).toUpperCase(),
  cidade: z.string().trim().max(100).optional(),
  categoria: z.enum(['moto', 'carro']),
  placa_veiculo: z.string().trim().min(7).max(10).transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')).refine((value) => /^[A-Z0-9]{7}$/.test(value), 'Placa inválida.'),
  marca_veiculo: z.string().trim().min(2).max(80),
  modelo_veiculo: z.string().trim().min(1).max(100),
  cor_veiculo: z.string().trim().min(2).max(50),
  ano_modelo_veiculo: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1),
  // A conta só pode ser criada quando o usuário marca a opção de aceite no frontend.
  aceita_termos: z.literal(true, { error: 'É necessário aceitar os Termos e políticas para criar a conta.' }),
}).strict();

const loginSchema = z.object({ email, senha: z.string().min(1).max(128) }).strict();

module.exports = { cadastroMotoristaSchema, loginSchema };
