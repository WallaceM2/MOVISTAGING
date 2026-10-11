const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const AppError = require('../src/errors/AppError');
const authService = require('../src/services/authService');
const { signAccessToken } = require('../src/services/tokenService');

const tickets = new Map();
const auditEntries = [];
let nextId = 1;

function requesterMessages(ticketId) {
  return [...(tickets.get(ticketId)?.mensagens || [])];
}

const supportModel = {
  async create(input) {
    const ticket = {
      id: nextId++,
      solicitante_tipo: input.requesterType,
      solicitante_id: input.requesterId,
      corrida_id: input.rideId,
      categoria: input.category,
      assunto: input.subject,
      status: 'aberto',
      prioridade: input.category === 'seguranca' ? 'alta' : 'normal',
      mensagens: [{ id: 1, autor_tipo: input.requesterType, mensagem: input.message }],
    };
    tickets.set(ticket.id, ticket);
    return ticket;
  },
  async listForRequester({ requesterType, requesterId }) {
    return [...tickets.values()].filter((ticket) => ticket.solicitante_tipo === requesterType && ticket.solicitante_id === requesterId);
  },
  async getForRequester({ ticketId, requesterType, requesterId }) {
    const ticket = tickets.get(Number(ticketId));
    if (!ticket || ticket.solicitante_tipo !== requesterType || ticket.solicitante_id !== requesterId) return null;
    return { ...ticket, mensagens: requesterMessages(Number(ticketId)) };
  },
  async addRequesterMessage({ ticketId, requesterType, requesterId, message }) {
    const ticket = tickets.get(Number(ticketId));
    if (!ticket || ticket.solicitante_tipo !== requesterType || ticket.solicitante_id !== requesterId) {
      throw new AppError('Chamado não encontrado.', 404, 'SUPPORT_TICKET_NOT_FOUND');
    }
    if (ticket.status === 'fechado') throw new AppError('Este chamado foi fechado.', 409, 'SUPPORT_TICKET_CLOSED');
    ticket.mensagens.push({ id: ticket.mensagens.length + 1, autor_tipo: requesterType, mensagem: message });
    if (['aguardando_usuario', 'resolvido'].includes(ticket.status)) ticket.status = 'em_atendimento';
    return true;
  },
  async listForAdmin() {
    return [...tickets.values()];
  },
  async getForAdmin(ticketId) {
    return tickets.get(Number(ticketId)) || null;
  },
  async addAdminMessage({ ticketId, adminId, message }) {
    const ticket = tickets.get(Number(ticketId));
    if (!ticket) throw new AppError('Chamado não encontrado.', 404, 'SUPPORT_TICKET_NOT_FOUND');
    if (ticket.status === 'fechado') throw new AppError('Este chamado foi fechado.', 409, 'SUPPORT_TICKET_CLOSED');
    ticket.mensagens.push({ id: ticket.mensagens.length + 1, autor_tipo: 'admin', autor_id: adminId, mensagem: message });
    ticket.status = 'em_atendimento';
    return true;
  },
  async updateStatus({ ticketId, status }) {
    const ticket = tickets.get(Number(ticketId));
    if (!ticket) return null;
    ticket.status = status;
    return ticket;
  },
};

const modelPath = require.resolve('../src/models/SupportTicket');
const auditPath = require.resolve('../src/services/auditService');
const idempotencyPath = require.resolve('../src/middlewares/idempotency');
require.cache[modelPath] = { exports: supportModel };
require.cache[auditPath] = {
  exports: {
    async registrar(entry) { auditEntries.push(entry); },
  },
};
require.cache[idempotencyPath] = {
  exports: () => (req, res, next) => next(),
};

const originalLookup = authService.buscarUsuarioPorTipo;
authService.buscarUsuarioPorTipo = async (type, id) => (type === 'admin' && id === 99 ? { id, status: 'ativa' } : null);
delete require.cache[require.resolve('../src/middlewares/autenticacao')];

const supportRoutes = require('../src/routes/supportRoutes');
const adminRoutes = require('../src/routes/adminRoutes');
const app = express();
app.use(express.json());
app.use('/api', supportRoutes);
app.use('/api', adminRoutes);
app.use((error, req, res, next) => {
  res.status(error.statusCode || 500).json({ erro: error.message, codigo: error.code });
});

const passengerToken = signAccessToken({ id: 7, tipo: 'passageiro' });
const otherPassengerToken = signAccessToken({ id: 8, tipo: 'passageiro' });
const adminToken = signAccessToken({ id: 99, tipo: 'admin' });

test('HTTP suporte: autenticação, isolamento, fila administrativa e retorno após resposta do usuário', async (t) => {
  tickets.clear();
  auditEntries.length = 0;
  nextId = 1;

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    authService.buscarUsuarioPorTipo = originalLookup;
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, { token, method = 'GET', body } = {}) => fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const anonymous = await request('/suporte/chamados', {
    method: 'POST',
    body: { categoria: 'corrida', assunto: 'Ajuda com corrida', mensagem: 'Preciso de ajuda com esta corrida.' },
  });
  assert.equal(anonymous.status, 401);

  const invalid = await request('/suporte/chamados', {
    token: passengerToken,
    method: 'POST',
    body: { categoria: 'corrida', assunto: 'Ajuda com corrida', mensagem: 'Ajuda' },
  });
  assert.equal(invalid.status, 400);

  const createdResponse = await request('/suporte/chamados', {
    token: passengerToken,
    method: 'POST',
    body: {
      categoria: 'seguranca',
      assunto: 'Preciso relatar uma ocorrência',
      mensagem: 'Preciso relatar uma ocorrência durante a corrida de teste.',
    },
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.previsao_resposta_humana_horas.minimo, 24);
  assert.equal(created.previsao_resposta_humana_horas.maximo, 48);
  const ticketId = created.chamado.id;

  const inaccessible = await request(`/suporte/chamados/${ticketId}`, { token: otherPassengerToken });
  assert.equal(inaccessible.status, 404);

  const forbiddenQueue = await request('/admin/suporte/chamados', { token: passengerToken });
  assert.equal(forbiddenQueue.status, 403);

  const queueResponse = await request('/admin/suporte/chamados?status=aberto&categoria=seguranca', { token: adminToken });
  assert.equal(queueResponse.status, 200);
  assert.equal((await queueResponse.json()).dados.length, 1);

  const adminReply = await request(`/admin/suporte/chamados/${ticketId}/mensagens`, {
    token: adminToken,
    method: 'POST',
    body: { mensagem: 'Recebemos seu relato e estamos analisando.' },
  });
  assert.equal(adminReply.status, 201);

  const waiting = await request(`/admin/suporte/chamados/${ticketId}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: { status: 'aguardando_usuario' },
  });
  assert.equal(waiting.status, 200);

  const userReply = await request(`/suporte/chamados/${ticketId}/mensagens`, {
    token: passengerToken,
    method: 'POST',
    body: { mensagem: 'Estou enviando os detalhes solicitados pelo suporte.' },
  });
  assert.equal(userReply.status, 201);

  const ticketResponse = await request(`/suporte/chamados/${ticketId}`, { token: passengerToken });
  assert.equal(ticketResponse.status, 200);
  const ticket = (await ticketResponse.json()).chamado;
  assert.equal(ticket.status, 'em_atendimento');
  assert.equal(ticket.mensagens.length, 3);
  assert.equal(auditEntries.length, 4);
  assert.equal(auditEntries.some((entry) => JSON.stringify(entry).includes('Recebemos seu relato')), false);
});
