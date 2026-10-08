const pool = require('../config/database');
const bcrypt = require('bcrypt');
const AppError = require('../errors/AppError');

async function criar(dados, db = pool) {
  const { nome, sobrenome, email, telefone, senha, data_nascimento, nacionalidade, cpf, rg, cnh, regiao, estado, cidade } = dados;
  const senha_hash = await bcrypt.hash(senha, 12);
  const { rows } = await db.query(`
    INSERT INTO passageiros (
      nome, sobrenome, email, telefone, senha_hash, data_nascimento,
      nacionalidade, cpf, rg, cnh, regiao, estado, cidade, status_conta
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ativa')
    RETURNING id, nome, sobrenome, email, status_conta, criado_em;
  `, [nome, sobrenome, email, telefone, senha_hash, data_nascimento, nacionalidade, cpf, rg, cnh, regiao, estado, cidade]);
  return rows[0];
}

async function listarTodos({ limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(`
    SELECT id, nome, sobrenome, email, telefone, status_conta, nota_media, total_avaliacoes, criado_em
    FROM passageiros ORDER BY criado_em DESC LIMIT $1 OFFSET $2;
  `, [limit, offset]);
  return rows;
}

async function buscarPorEmail(email) {
  const { rows } = await pool.query('SELECT * FROM passageiros WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
  return rows[0];
}

async function buscarPorId(id) {
  const { rows } = await pool.query(`
    SELECT id, nome, sobrenome, email, telefone, cpf, rg, cnh,
           status_conta, conta_verificada, foto_perfil_url,
           rg_foto_url, cnh_foto_url, nota_media, total_avaliacoes,
           debito_pendente, criado_em, atualizado_em
    FROM passageiros WHERE id = $1 LIMIT 1;
  `, [id]);
  return rows[0];
}

async function atualizarStatus(id, novoStatus) {
  const validos = new Set(['ativa', 'suspensa', 'banida']);
  if (!validos.has(novoStatus)) throw new AppError('Status de passageiro inválido.', 400, 'INVALID_STATUS');
  const { rows } = await pool.query(`
    UPDATE passageiros SET status_conta = $1, atualizado_em = NOW()
    WHERE id = $2 RETURNING id, nome, sobrenome, email, status_conta;
  `, [novoStatus, id]);
  return rows[0];
}

async function atualizarDocumentos(id, campos) {
  const permitidos = new Set(['rg_foto_url', 'cnh_foto_url', 'foto_perfil_url']);
  const colunas = Object.keys(campos).filter((c) => permitidos.has(c));
  if (!colunas.length) return null;
  const sets = colunas.map((coluna, i) => `${coluna} = $${i + 1}`).join(', ');
  const valores = colunas.map((coluna) => campos[coluna]);
  const { rows } = await pool.query(`
    UPDATE passageiros SET ${sets}, atualizado_em = NOW()
    WHERE id = $${valores.length + 1}
    RETURNING id, nome, rg_foto_url, cnh_foto_url, foto_perfil_url;
  `, [...valores, id]);
  return rows[0];
}

module.exports = { criar, listarTodos, buscarPorEmail, buscarPorId, atualizarStatus, atualizarDocumentos };
