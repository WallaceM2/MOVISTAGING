const Passageiro = require('../models/Passageiro');
const { autenticarSenha } = require('../services/authService');
const { normalizeEmail, normalizeCpf, normalizePhone, isValidCpf } = require('../utils/validators');
const { uploadPrivateFile, deletePrivateFile } = require('../services/storageService');
const AppError = require('../errors/AppError');
const { parsePagination } = require('../utils/pagination');
const { sanitizeIp, safeUserAgent } = require('../utils/http');
const pool = require('../config/database');
const { registrarAceites, currentRequiredDocuments } = require('../services/legalConsentService');

async function cadastrar(req, res) {
  const body = { ...req.body, email: normalizeEmail(req.body.email), cpf: normalizeCpf(req.body.cpf), telefone: normalizePhone(req.body.telefone) };
  if (!isValidCpf(body.cpf)) throw new AppError('CPF inválido.', 400, 'INVALID_CPF');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const novoPassageiro = await Passageiro.criar(body, client);

    // O aceite é gravado na mesma transação da criação da conta.
    // Se o aceite ou o hash dos documentos legais falhar, a conta também é desfeita.
    await registrarAceites({
      usuarioTipo: 'passageiro',
      usuarioId: novoPassageiro.id,
      documentos: currentRequiredDocuments('passageiro').map((doc) => ({ documento_tipo: doc.documentoTipo, versao: doc.versao })),
      ip: sanitizeIp(req),
      userAgent: safeUserAgent(req),
      client,
    });

    await client.query('COMMIT');
    res.status(201).json({ mensagem: 'Passageiro cadastrado com sucesso!', passageiro: novoPassageiro });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (error.code === '23505') throw new AppError('CPF ou email já cadastrado.', 409, 'DUPLICATE_ACCOUNT');
    throw error;
  } finally {
    client.release();
  }
}

async function listar(req, res) {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50 });
  res.json({ dados: await Passageiro.listarTodos({ limit, offset }), pagina: { limit, offset } });
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const { usuario, accessToken, refreshToken } = await autenticarSenha({
    tipo: 'passageiro', email, senha: req.body.senha, buscarPorEmail: Passageiro.buscarPorEmail,
    ip: sanitizeIp(req), userAgent: safeUserAgent(req),
  });
  res.json({
    mensagem: 'Login realizado com sucesso!', token: accessToken, refresh_token: refreshToken,
    passageiro: { id: usuario.id, nome: usuario.nome, sobrenome: usuario.sobrenome, email: usuario.email, status_conta: usuario.status_conta },
  });
}

async function perfil(req, res) {
  const passageiro = await Passageiro.buscarPorId(req.usuario.id);
  if (!passageiro) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
  res.json({ passageiro });
}

async function uploadDocumentos(req, res) {
  const antes = await Passageiro.buscarPorId(req.usuario.id);
  const arquivos = req.files || {};
  const campos = {};
  const documentos = {};
  const antigos = [];
  const armazenados = [];

  try {
    for (const [campo, itens] of Object.entries(arquivos)) {
      const file = itens[0];
      const previousColumn = { rg: 'rg_foto_url', cnh: 'cnh_foto_url', foto_perfil: 'foto_perfil_url' }[campo];
      if (previousColumn && antes?.[previousColumn]) antigos.push(antes[previousColumn]);
      const stored = await uploadPrivateFile({ buffer: file.buffer, mimetype: file.mimetype, tipoUsuario: 'passageiros', usuarioId: req.usuario.id, campo });
      armazenados.push(stored.storagePath);
      const column = { rg: 'rg_foto_url', cnh: 'cnh_foto_url', foto_perfil: 'foto_perfil_url' }[campo];
      if (column) campos[column] = stored.storagePath;
      documentos[campo] = stored.storagePath;
    }
    if (!Object.keys(campos).length) throw new AppError('Nenhum documento foi enviado.', 400, 'DOCUMENTS_REQUIRED');
    const passageiro = await Passageiro.atualizarDocumentos(req.usuario.id, campos);
    if (!passageiro) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
    await Promise.allSettled(antigos.map((antigo) => deletePrivateFile(antigo)));
    res.json({ mensagem: 'Documentos enviados com sucesso!', passageiro, documentos });
  } catch (error) {
    await Promise.allSettled(armazenados.map((arquivo) => deletePrivateFile(arquivo)));
    throw error;
  }
}

async function quitarDebito(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT debito_pendente FROM passageiros WHERE id = $1 FOR UPDATE', [req.usuario.id]);
    if (!result.rows[0]) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
    const debito = Number(result.rows[0].debito_pendente || 0);
    if (debito <= 0) throw new AppError('Não há débito pendente para quitar.', 400, 'NO_DEBT');

    // Não existe liquidação real nesta base. Só zera depois que o provedor confirmar via webhook.
    throw new AppError('Quitação automática ainda depende da integração com o provedor de pagamentos. Nenhum valor foi alterado.', 409, 'PAYMENT_PROVIDER_REQUIRED');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { cadastrar, listar, login, perfil, uploadDocumentos, quitarDebito };
