const pool = require('../config/database');
const { uploadPrivateFile, createSignedUrl, deletePrivateFile } = require('../services/storageService');
const AppError = require('../errors/AppError');
const { parseExpiresIn } = require('../utils/pagination');

const DOCUMENT_COLUMNS = Object.freeze({
  motorista: {
    rg: 'rg_foto_url', cnh: 'cnh_foto_url', foto_perfil: 'foto_perfil_url', documento_veiculo: 'documento_veiculo_url',
  },
  passageiro: {
    rg: 'rg_foto_url', cnh: 'cnh_foto_url', foto_perfil: 'foto_perfil_url',
  },
});

async function enviarCnh(req, res) {
  if (req.usuario.tipo !== 'motorista') throw new AppError('Acesso restrito a motoristas.', 403, 'FORBIDDEN');
  if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400, 'FILE_REQUIRED');
  const stored = await uploadPrivateFile({ buffer: req.file.buffer, mimetype: req.file.mimetype, tipoUsuario: 'motoristas', usuarioId: req.usuario.id, campo: 'cnh' });
  try {
    const result = await pool.query(`
      UPDATE motoristas SET cnh_foto_url = $1, status_cadastro = 'em_analise', cnh_verificada_em = NULL, atualizado_em = NOW()
      WHERE id = $2 RETURNING id, nome, status_cadastro, cnh_foto_url;
    `, [stored.storagePath, req.usuario.id]);
    if (!result.rows[0]) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
    res.json({ mensagem: 'Documento recebido! Aguarde a análise.', perfil: result.rows[0], documento: stored.storagePath });
  } catch (error) {
    await deletePrivateFile(stored.storagePath).catch(() => {});
    throw error;
  }
}

async function gerarUrl(req, res) {
  const { tipo, id, documento } = req.params;
  if (!DOCUMENT_COLUMNS[tipo] || !DOCUMENT_COLUMNS[tipo][documento]) throw new AppError('Documento inválido.', 400, 'INVALID_DOCUMENT');
  const owner = Number(id);
  if (req.usuario.tipo !== 'admin' && (req.usuario.tipo !== tipo || req.usuario.id !== owner)) throw new AppError('Acesso negado.', 403, 'FORBIDDEN');

  const table = tipo === 'motorista' ? 'motoristas' : 'passageiros';
  const column = DOCUMENT_COLUMNS[tipo][documento];
  const { rows } = await pool.query(`SELECT ${column} AS path FROM ${table} WHERE id = $1 LIMIT 1`, [owner]);
  if (!rows[0]?.path) throw new AppError('Documento não encontrado.', 404, 'DOCUMENT_NOT_FOUND');
  const expiresIn = parseExpiresIn(req.query.expires_in);
  const url = await createSignedUrl(rows[0].path, expiresIn);
  res.json({ url, expires_in: expiresIn });
}

module.exports = { enviarCnh, gerarUrl };
