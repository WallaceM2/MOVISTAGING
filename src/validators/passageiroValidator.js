const { z, cpf, email, telefone, senha, dateOfBirth } = require('./commonValidator');

const cadastroPassageiroSchema = z.object({
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
  regiao: z.string().trim().max(80).optional(),
  estado: z.string().trim().length(2).toUpperCase(),
  cidade: z.string().trim().max(100).optional(),
  // A conta só pode ser criada quando o usuário marca a opção de aceite no frontend.
  aceita_termos: z.literal(true, { error: 'É necessário aceitar os Termos de Uso e declarar ciência do Aviso de Privacidade e da Política de Segurança e Confiança para criar a conta.' }),
}).strict();

const loginSchema = z.object({ email, senha: z.string().min(1).max(128) }).strict();

module.exports = { cadastroPassageiroSchema, loginSchema };
