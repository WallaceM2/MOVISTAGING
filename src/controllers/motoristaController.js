const Motorista = require('../models/Motorista');
const { autenticarSenha } = require('../services/authService');
const { normalizeEmail, normalizeCpf, normalizePhone, isValidCpf } = require('../utils/validators');
const { uploadPrivateFile, deletePrivateFile } = require('../services/storageService');
const AppError = require('../errors/AppError');
const { parsePagination } = require('../utils/pagination');
const { sanitizeIp, safeUserAgent } = require('../utils/http');
const pool = require('../config/database');
const { registrarAceites, currentRequiredDocuments } = require('../services/legalConsentService');

async function cadastrar(req, res) {
  const body = {
    ...req.body,
    email: normalizeEmail(req.body.email),
    cpf: normalizeCpf(req.body.cpf),
    telefone: normalizePhone(req.body.telefone),
  };
  if (!isValidCpf(body.cpf)) throw new AppError('CPF inválido.', 400, 'INVALID_CPF');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const novoMotorista = await Motorista.criar(body, client);

    await registrarAceites({
      usuarioTipo: 'motorista',
      usuarioId: novoMotorista.id,
      documentos: currentRequiredDocuments('motorista').map((doc) => ({ documento_tipo: doc.documentoTipo, versao: doc.versao })),
      ip: sanitizeIp(req),
      userAgent: safeUserAgent(req),
      client,
    });

    await client.query('COMMIT');
    res.status(201).json({ mensagem: 'Motorista cadastrado com sucesso! Aguardando análise documental.', motorista: novoMotorista });
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
  const motoristas = await Motorista.listarTodos({ limit, offset });
  res.json({ dados: motoristas, pagina: { limit, offset } });
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const { usuario, accessToken, refreshToken } = await autenticarSenha({
    tipo: 'motorista', email, senha: req.body.senha, buscarPorEmail: Motorista.buscarPorEmail,
    ip: sanitizeIp(req), userAgent: safeUserAgent(req),
  });
  res.json({
    mensagem: 'Login realizado com sucesso!',
    token: accessToken,
    refresh_token: refreshToken,
    motorista: {
      id: usuario.id, nome: usuario.nome, sobrenome: usuario.sobrenome, email: usuario.email,
      status_cadastro: usuario.status_cadastro, status_conta: usuario.status_conta,
    },
  });
}

async function perfil(req, res) {
  const motorista = await Motorista.buscarPorId(req.usuario.id);
  if (!motorista) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
  res.json({ motorista });
}

async function uploadDocumentos(req, res) {
  const antes = await Motorista.buscarPorId(req.usuario.id);
  const arquivos = req.files || {};
  const campos = {};
  const documentos = {};
  const antigos = [];
  const armazenados = [];

  try {
    for (const [campo, itens] of Object.entries(arquivos)) {
      const file = itens[0];
      const previousColumn = { rg: 'rg_foto_url', cnh: 'cnh_foto_url', foto_perfil: 'foto_perfil_url', documento_veiculo: 'documento_veiculo_url' }[campo];
      if (previousColumn && antes?.[previousColumn]) antigos.push(antes[previousColumn]);
      const stored = await uploadPrivateFile({ buffer: file.buffer, mimetype: file.mimetype, tipoUsuario: 'motoristas', usuarioId: req.usuario.id, campo });
      armazenados.push(stored.storagePath);
      const column = { rg: 'rg_foto_url', cnh: 'cnh_foto_url', foto_perfil: 'foto_perfil_url', documento_veiculo: 'documento_veiculo_url' }[campo];
      if (column) campos[column] = stored.storagePath;
      if (campo === 'documento_veiculo') campos.documento_veiculo_tipo = file.mimetype;
      documentos[campo] = stored.storagePath;
    }
    if (!Object.keys(campos).length) throw new AppError('Nenhum documento foi enviado.', 400, 'DOCUMENTS_REQUIRED');
    const motorista = await Motorista.atualizarDocumentos(req.usuario.id, campos);
    if (!motorista) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
    await Promise.allSettled(antigos.map((antigo) => deletePrivateFile(antigo)));
    res.status(200).json({ mensagem: 'Documentos enviados com sucesso! Aguardando análise.', motorista, documentos });
  } catch (error) {
    await Promise.allSettled(armazenados.map((arquivo) => deletePrivateFile(arquivo)));
    throw error;
  }
}

module.exports = { cadastrar, listar, login, perfil, uploadDocumentos };
