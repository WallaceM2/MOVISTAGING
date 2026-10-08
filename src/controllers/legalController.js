const fs = require('fs');
const path = require('path');
const { registrarAceites, currentRequiredDocuments } = require('../services/legalConsentService');
const AppError = require('../errors/AppError');
const { sanitizeIp, safeUserAgent } = require('../utils/http');

async function listarDocumentosAtuais(req, res) {
  if (!['passageiro', 'motorista'].includes(req.usuario.tipo)) throw new AppError('Documentos legais de consumidor/parceiro não se aplicam à conta administrativa.', 400, 'LEGAL_DOCUMENTS_NOT_AVAILABLE');
  res.json({ documentos: currentRequiredDocuments(req.usuario.tipo) });
}



function listarDocumentosPublicos(req, res) {
  const usuarioTipo = req.params.tipo;
  if (!['passageiro', 'motorista'].includes(usuarioTipo)) {
    throw new AppError('Tipo de cadastro inválido.', 400, 'INVALID_LEGAL_PROFILE');
  }

  const filesByType = {
    termos_uso: usuarioTipo === 'passageiro' ? 'TERMOS_DE_USO_PASSAGEIRO.md' : 'TERMOS_DO_MOTORISTA_PARCEIRO.md',
    aviso_privacidade: 'AVISO_DE_PRIVACIDADE.md',
    seguranca_confianca: 'POLITICA_DE_SEGURANCA_E_CONFIANCA.md',
  };
  const titles = {
    termos_uso: usuarioTipo === 'passageiro' ? 'Termos de Uso do Passageiro' : 'Termos do Motorista Parceiro',
    aviso_privacidade: 'Aviso de Privacidade',
    seguranca_confianca: 'Política de Segurança e Confiança',
  };

  const documentos = currentRequiredDocuments(usuarioTipo).map((doc) => {
    const filename = filesByType[doc.documentoTipo];
    const fullPath = path.join(__dirname, '..', '..', 'legal', filename);
    return {
      ...doc,
      titulo: titles[doc.documentoTipo],
      conteudo: fs.readFileSync(fullPath, 'utf8'),
    };
  });

  res.json({ usuario_tipo: usuarioTipo, documentos });
}

async function aceitar(req, res) {
  if (!['passageiro', 'motorista'].includes(req.usuario.tipo)) throw new AppError('Aceite legal indisponível para este perfil.', 400, 'LEGAL_CONSENT_NOT_AVAILABLE');
  const documentos = await registrarAceites({
    usuarioTipo: req.usuario.tipo,
    usuarioId: req.usuario.id,
    documentos: req.body.documentos,
    ip: sanitizeIp(req),
    userAgent: safeUserAgent(req),
  });
  res.status(201).json({ sucesso: true, mensagem: 'Documentos legais aceitos e registrados.', documentos });
}

module.exports = { listarDocumentosAtuais, listarDocumentosPublicos, aceitar };
