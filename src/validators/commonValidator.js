const { z } = require('zod');
const env = require('../config/env');
const { isValidCpf } = require('../utils/validators');

const cpf = z.string().min(11).max(14).refine(isValidCpf, 'CPF inválido.');
const email = z.string().trim().toLowerCase().email('Email inválido.').max(254);
const telefone = z.string().min(10).max(20).regex(/^[0-9()+\-\s]+$/, 'Telefone inválido.');
const senha = z.string().min(8, 'Senha precisa ter no mínimo 8 caracteres.').max(128);

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const coordenadas = z.object({
  origem_lat: z.coerce.number().min(-90).max(90),
  origem_lng: z.coerce.number().min(-180).max(180),
  destino_lat: z.coerce.number().min(-90).max(90),
  destino_lng: z.coerce.number().min(-180).max(180),
});

function dateOfBirth() {
  return z.string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Data deve estar no formato DD/MM/AAAA.')
    .refine((value) => {
      const [dia, mes, ano] = value.split('/').map(Number);
      const date = new Date(Date.UTC(ano, mes - 1, dia));
      return date.getUTCFullYear() === ano && date.getUTCMonth() === mes - 1 && date.getUTCDate() === dia;
    }, 'Data de nascimento inválida.')
    .transform((value) => {
      const [dia, mes, ano] = value.split('/');
      return `${ano}-${mes}-${dia}`;
    })
    .refine((iso) => {
      const date = new Date(`${iso}T00:00:00Z`);
      const now = new Date();
      const cutoff = new Date(Date.UTC(now.getUTCFullYear() - env.MINIMUM_AGE, now.getUTCMonth(), now.getUTCDate()));
      return !Number.isNaN(date.getTime()) && date <= cutoff;
    }, `O usuário precisa ter pelo menos ${env.MINIMUM_AGE} anos.`);
}

module.exports = { z, cpf, email, telefone, senha, idParamSchema, coordenadas, dateOfBirth };
