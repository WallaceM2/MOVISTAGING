const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const calls = [];
let response;
const httpMock = {
  apiFetch: (...args) => {
    calls.push(args);
    return Promise.resolve(response);
  },
};
const idempotencyMock = { createIdempotencyKey: (scope) => `${scope}-contract-test-key` };
const source = fs.readFileSync(path.join(__dirname, '../src/features/suporte/supportService.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const serviceModule = { exports: {} };
const localRequire = (specifier) => {
  if (specifier === '@/api/http') return httpMock;
  if (specifier === '@/utils/idempotency') return idempotencyMock;
  return require(specifier);
};
new Function('require', 'exports', 'module', compiled)(localRequire, serviceModule.exports, serviceModule);

const { createSupportTicket, getSupportTicket, listSupportFaq, listSupportTickets, sendSupportMessage, triageSupportQuestion } = serviceModule.exports;

test.beforeEach(() => {
  calls.length = 0;
  response = undefined;
});

test('FAQ uses the public support contract and triage posts the question', async () => {
  const faq = { artigos: [{ id: 'pagamento_dinheiro', categoria: 'pagamento', titulo: 'Pagamento em dinheiro', resposta: 'Consulte os detalhes da corrida.' }] };
  const triage = { artigo_id: 'pagamento_dinheiro', categoria_sugerida: 'pagamento', titulo: 'Pagamento em dinheiro', resposta: 'Consulte os detalhes da corrida.', sugerir_chamado: true, resolvido_pelo_bot: false };
  response = faq;
  assert.deepEqual(await listSupportFaq(), faq);
  response = triage;
  assert.deepEqual(await triageSupportQuestion('Como consulto o pagamento?'), triage);

  assert.equal(calls[0][0], '/api/suporte/faq');
  assert.equal(calls[1][0], '/api/suporte/triagem');
  assert.deepEqual(calls[1][1], { method: 'POST', body: JSON.stringify({ pergunta: 'Como consulto o pagamento?' }) });
});

test('ticket listing and detail use the V3 paths and response envelopes', async () => {
  const list = { dados: [{ id: 41, corrida_id: null, categoria: 'conta', assunto: 'Acesso', status: 'aberto', prioridade: 'normal', criado_em: '2026-10-13T12:00:00.000Z' }], pagina: { limit: 20, offset: 0 } };
  const detail = { chamado: { ...list.dados[0], mensagens: [] } };
  response = list;
  assert.deepEqual(await listSupportTickets(), list);
  response = detail;
  assert.deepEqual(await getSupportTicket(41), detail);

  assert.equal(calls[0][0], '/api/suporte/chamados');
  assert.equal(calls[1][0], '/api/suporte/chamados/41');
});

test('ticket creation and replies post payloads with idempotency keys', async () => {
  const input = { categoria: 'corrida', assunto: 'Cancelamento', mensagem: 'Preciso entender o cancelamento da minha viagem.', corrida_id: 73 };
  const created = { mensagem: 'Chamado recebido.', chamado: { id: 51 }, previsao_resposta_humana_horas: { minimo: 24, maximo: 48 } };
  response = created;
  assert.deepEqual(await createSupportTicket(input), created);
  response = { mensagem: 'Mensagem registrada.' };
  assert.deepEqual(await sendSupportMessage(51, 'Tenho mais informações para enviar.'), { mensagem: 'Mensagem registrada.' });

  assert.equal(calls[0][0], '/api/suporte/chamados');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), input);
  assert.equal(calls[0][1].idempotencyKey, 'support-ticket-contract-test-key');
  assert.equal(calls[1][0], '/api/suporte/chamados/51/mensagens');
  assert.equal(calls[1][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1][1].body), { mensagem: 'Tenho mais informações para enviar.' });
  assert.equal(calls[1][1].idempotencyKey, 'support-message-contract-test-key');
});
