const SupportTicket = require('../models/SupportTicket');
const knowledge = require('../services/supportKnowledgeService');
const { registrar } = require('../services/auditService');
const { parsePagination } = require('../utils/pagination');
const { AppError } = require('../errors');
const { adminFilterSchema } = require('../validators/supportValidator');

async function audit(req, action, targetId, metadata = {}) {
  try {
    await registrar({ actorType: req.usuario.tipo, actorId: req.usuario.id, action, targetType: 'suporte_chamado', targetId, metadata });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'support_audit_failed', action, message: error.message }));
  }
}

function listFaq(req, res) {
  res.json({ artigos: knowledge.listArticles() });
}

function triage(req, res) {
  res.json(knowledge.triage(req.body.pergunta));
}

async function createTicket(req, res) {
  const ticket = await SupportTicket.create({
    requesterType: req.usuario.tipo,
    requesterId: req.usuario.id,
    rideId: req.body.corrida_id ?? null,
    category: req.body.categoria,
    subject: req.body.assunto,
    message: req.body.mensagem,
  });
  await audit(req, 'suporte.chamado.criado', ticket.id, { categoria: ticket.categoria, corrida_id: ticket.corrida_id });
  res.status(201).json({
    mensagem: 'Chamado recebido. A previsão de primeira resposta humana é de 24 a 48 horas.',
    chamado: ticket,
    previsao_resposta_humana_horas: { minimo: 24, maximo: 48 },
  });
}

async function listRequesterTickets(req, res) {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const dados = await SupportTicket.listForRequester({ requesterType: req.usuario.tipo, requesterId: req.usuario.id, limit, offset });
  res.json({ dados, pagina: { limit, offset } });
}

async function getRequesterTicket(req, res) {
  const chamado = await SupportTicket.getForRequester({ ticketId: req.params.id, requesterType: req.usuario.tipo, requesterId: req.usuario.id });
  if (!chamado) throw new AppError('Chamado não encontrado.', 404, 'SUPPORT_TICKET_NOT_FOUND');
  res.json({ chamado });
}

async function addRequesterMessage(req, res) {
  await SupportTicket.addRequesterMessage({ ticketId: req.params.id, requesterType: req.usuario.tipo, requesterId: req.usuario.id, message: req.body.mensagem });
  await audit(req, 'suporte.chamado.mensagem_usuario', req.params.id);
  res.status(201).json({ mensagem: 'Mensagem adicionada ao chamado.' });
}

async function listAdminTickets(req, res) {
  const parsed = adminFilterSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError('Filtros de chamados inválidos.', 400, 'INVALID_SUPPORT_FILTER');
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
  const dados = await SupportTicket.listForAdmin({ limit, offset, status: parsed.data.status || null, category: parsed.data.categoria || null });
  res.json({ dados, pagina: { limit, offset } });
}

async function getAdminTicket(req, res) {
  const chamado = await SupportTicket.getForAdmin(req.params.id);
  if (!chamado) throw new AppError('Chamado não encontrado.', 404, 'SUPPORT_TICKET_NOT_FOUND');
  res.json({ chamado });
}

async function addAdminMessage(req, res) {
  await SupportTicket.addAdminMessage({ ticketId: req.params.id, adminId: req.usuario.id, message: req.body.mensagem });
  await audit(req, 'suporte.chamado.resposta_admin', req.params.id);
  res.status(201).json({ mensagem: 'Resposta enviada ao chamado.' });
}

async function updateAdminStatus(req, res) {
  const chamado = await SupportTicket.updateStatus({ ticketId: req.params.id, adminId: req.usuario.id, status: req.body.status });
  if (!chamado) throw new AppError('Chamado não encontrado.', 404, 'SUPPORT_TICKET_NOT_FOUND');
  await audit(req, 'suporte.chamado.status', chamado.id, { status: chamado.status });
  res.json({ chamado });
}

module.exports = {
  listFaq, triage, createTicket, listRequesterTickets, getRequesterTicket,
  addRequesterMessage, listAdminTickets, getAdminTicket, addAdminMessage, updateAdminStatus,
};
