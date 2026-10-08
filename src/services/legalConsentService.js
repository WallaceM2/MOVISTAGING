const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/database');
const AppError = require('../errors/AppError');
const env = require('../config/env');

const DOCUMENTS = Object.freeze({
  passageiro: {
    termos_uso: { version: process.env.TERMS_PASSENGER_VERSION || '1.0', file: 'TERMOS_DE_USO_PASSAGEIRO.md' },
    aviso_privacidade: { version: process.env.PRIVACY_VERSION || '1.0', file: 'AVISO_DE_PRIVACIDADE.md' },
    seguranca_confianca: { version: process.env.SAFETY_POLICY_VERSION || '1.0', file: 'POLITICA_DE_SEGURANCA_E_CONFIANCA.md' },
  },
  motorista: {
    termos_uso: { version: process.env.TERMS_DRIVER_VERSION || '1.0', file: 'TERMOS_DO_MOTORISTA_PARCEIRO.md' },
    aviso_privacidade: { version: process.env.PRIVACY_VERSION || '1.0', file: 'AVISO_DE_PRIVACIDADE.md' },
    seguranca_confianca: { version: process.env.SAFETY_POLICY_VERSION || '1.0', file: 'POLITICA_DE_SEGURANCA_E_CONFIANCA.md' },
  },
});

function getDocumentDefinition(usuarioTipo, documentoTipo) {
  const definition = DOCUMENTS[usuarioTipo]?.[documentoTipo];
  if (!definition) throw new AppError('Documento legal inválido para este perfil.', 400, 'INVALID_LEGAL_DOCUMENT');
  return definition;
}

function hashDocument(file) {
  const fullPath = path.join(__dirname, '..', '..', 'legal', file);
  const content = fs.readFileSync(fullPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function currentDocument(usuarioTipo, documentoTipo) {
  const definition = getDocumentDefinition(usuarioTipo, documentoTipo);
  return { documentoTipo, versao: definition.version, conteudoHash: hashDocument(definition.file) };
}

function currentRequiredDocuments(usuarioTipo) {
  if (!DOCUMENTS[usuarioTipo]) return [];
  return Object.keys(DOCUMENTS[usuarioTipo]).map((documentoTipo) => currentDocument(usuarioTipo, documentoTipo));
}

async function registrarAceites({ usuarioTipo, usuarioId, documentos, ip, userAgent, client: externalClient = null }) {
  const allowed = new Map(currentRequiredDocuments(usuarioTipo).map((doc) => [doc.documentoTipo, doc]));
  const received = new Map((documentos || []).map((doc) => [doc.documento_tipo, doc]));
  const required = [...allowed.values()];
  const missing = required.filter((doc) => {
    const submitted = received.get(doc.documentoTipo);
    return !submitted || submitted.versao !== doc.versao;
  });
  if (missing.length) {
    throw new AppError(`Aceite obrigatório ausente ou desatualizado: ${missing.map((doc) => `${doc.documentoTipo} v${doc.versao}`).join(', ')}.`, 409, 'LEGAL_CONSENT_REQUIRED');
  }

  // Permite registrar o aceite dentro da mesma transação da criação da conta.
  const client = externalClient || await pool.connect();
  const ownsTransaction = !externalClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    for (const doc of required) {
      await client.query(`
        INSERT INTO movi_aceites_termos (usuario_tipo, usuario_id, documento_tipo, versao, conteudo_hash, ip, user_agent)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (usuario_tipo, usuario_id, documento_tipo, versao) DO NOTHING
      `, [usuarioTipo, usuarioId, doc.documentoTipo, doc.versao, doc.conteudoHash, ip || null, userAgent || null]);
    }
    if (ownsTransaction) await client.query('COMMIT');
    return required;
  } catch (error) {
    if (ownsTransaction) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    throw error;
  } finally {
    if (ownsTransaction) client.release();
  }
}

async function possuiTodosAceitesAtuais(usuarioTipo, usuarioId) {
  const required = currentRequiredDocuments(usuarioTipo);
  if (!required.length) return true;
  const result = await pool.query(`
    SELECT documento_tipo, versao, conteudo_hash
    FROM movi_aceites_termos
    WHERE usuario_tipo = $1 AND usuario_id = $2
  `, [usuarioTipo, usuarioId]);
  const accepted = new Map(result.rows.map((row) => [`${row.documento_tipo}:${row.versao}`, row]));
  return required.every((doc) => accepted.has(`${doc.documentoTipo}:${doc.versao}`) && accepted.get(`${doc.documentoTipo}:${doc.versao}`).conteudo_hash === doc.conteudoHash);
}

module.exports = { currentRequiredDocuments, registrarAceites, possuiTodosAceitesAtuais };
