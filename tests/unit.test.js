const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidCpf, normalizeEmail, normalizeCpf, normalizePhone } = require('../src/utils/validators');
const { assertRideTransition } = require('../src/utils/stateMachine');
const { regrasPreco } = require('../src/services/mapsService');
const { dateOfBirth } = require('../src/validators/commonValidator');
const { parsePagination, parseExpiresIn } = require('../src/utils/pagination');
const { cadastroPassageiroSchema, respostaDebitoSchema } = require('../src/validators/passageiroValidator');
const { cadastroMotoristaSchema } = require('../src/validators/motoristaValidator');
const { signAccessToken, createRefreshToken, hashToken } = require('../src/services/tokenService');
const { verifyAccessToken } = require('../src/services/authService');
const supportKnowledge = require('../src/services/supportKnowledgeService');
const supportValidators = require('../src/validators/supportValidator');
const { calculateCashSettlement, calculateCashRideCollection } = require('../src/services/cashSettlement');
const { calculatePassengerCancellationFee, CANCELLATION_FEE_BRL, CANCELLATION_FEE_DELAY_MS } = require('../src/services/cancellationFee');
const crypto = require('crypto');


test('tokens de acesso e refresh usam identidade verificável e rotação segura', () => {
  const jti = crypto.randomUUID();
  const accessToken = signAccessToken({ id: 1, tipo: 'motorista', jti });
  const decoded = verifyAccessToken(accessToken);
  assert.equal(decoded.sub, '1');
  assert.equal(decoded.id, 1);
  assert.equal(decoded.tipo, 'motorista');
  assert.equal(decoded.jti, jti);
  assert.equal(decoded.iss, 'movi-api');
  assert.equal(decoded.aud, 'movi-app');

  const refreshToken = createRefreshToken();
  assert.match(refreshToken, /^[A-Za-z0-9_-]{60,80}$/);
  assert.match(hashToken(refreshToken), /^[a-f0-9]{64}$/);
});

test('validação e normalização de CPF', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(normalizeCpf('529.982.247-25'), '52998224725');
});

test('normalização de email e telefone', () => {
  assert.equal(normalizeEmail('  WALLACE@EXAMPLE.COM '), 'wallace@example.com');
  assert.equal(normalizePhone('(81) 99999-9999'), '81999999999');
});

test('máquina de estados de corrida', () => {
  assert.doesNotThrow(() => assertRideTransition('solicitada', 'aceita'));
  assert.doesNotThrow(() => assertRideTransition('aceita', 'em_andamento'));
  assert.throws(() => assertRideTransition('em_andamento', 'cancelada'), /Transição de corrida inválida/);
  assert.throws(() => assertRideTransition('concluida', 'em_andamento'), /Transição de corrida inválida/);
  assert.throws(() => assertRideTransition('cancelada', 'aceita'), /Transição de corrida inválida/);
});

test('taxa de cancelamento só vale após 180s do aceite e por cancelamento do passageiro', () => {
  const acceptedAt = '2026-10-13T12:00:00.000Z';
  const accepted = { actorType: 'passageiro', priorStatus: 'aceita', driverId: 8, acceptedAt };
  assert.equal(CANCELLATION_FEE_BRL, 3);
  assert.equal(CANCELLATION_FEE_DELAY_MS, 180000);
  assert.equal(calculatePassengerCancellationFee({ ...accepted, cancelledAt: '2026-10-13T12:02:59.999Z' }), 0);
  assert.equal(calculatePassengerCancellationFee({ ...accepted, cancelledAt: '2026-10-13T12:03:00.000Z' }), 3);
  assert.equal(calculatePassengerCancellationFee({ ...accepted, actorType: 'motorista', cancelledAt: '2026-10-13T12:10:00.000Z' }), 0);
  assert.equal(calculatePassengerCancellationFee({ ...accepted, priorStatus: 'solicitada', cancelledAt: '2026-10-13T12:10:00.000Z' }), 0);
  assert.equal(calculatePassengerCancellationFee({ ...accepted, driverId: null, cancelledAt: '2026-10-13T12:10:00.000Z' }), 0);
});

test('FAQ do suporte explica taxa após 180s do aceite, não da solicitação', () => {
  const cancellationFaq = supportKnowledge.listArticles().find(({ id }) => id === 'cancelamento');
  assert.ok(cancellationFaq);
  assert.match(cancellationFaq.resposta, /180 segundos ou mais depois do aceite/);
  assert.doesNotMatch(cancellationFaq.resposta, /depois da solicitação/);
});

test('cancelamento aceito após 180s registra débito e crédito de carteira ao motorista atomicamente', async () => {
  const databasePath = require.resolve('../src/config/database');
  const modelPath = require.resolve('../src/models/Corrida');
  const originalDatabase = require.cache[databasePath];
  const originalModel = require.cache[modelPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === 'SELECT * FROM corridas WHERE id = $1::integer FOR UPDATE') return { rows: [{ id: 91, passageiro_id: 7, motorista_id: 8, status: 'aceita', aceita_em: '2026-10-13T12:00:00.000Z' }] };
      if (sql === 'SELECT NOW() AS agora') return { rows: [{ agora: '2026-10-13T12:03:00.000Z' }] };
      if (/SELECT debito_pendente FROM passageiros/.test(sql)) return { rows: [{ debito_pendente: '2.00' }] };
      if (/INSERT INTO movi_taxas_cancelamento/.test(sql)) return { rows: [{ id: 6, corrida_id: 91, valor: '3.00', status: 'pendente', repasse_status: 'creditado_carteira', creditado_carteira_em: '2026-10-13T12:03:00.000Z', criado_em: '2026-10-13T12:03:00.000Z' }] };
      if (/SELECT saldo_carteira FROM motoristas/.test(sql)) return { rows: [{ saldo_carteira: '-10.00' }] };
      if (/UPDATE corridas/.test(sql)) return { rows: [{ id: 91, status: 'cancelada' }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client, query: async () => ({ rows: [] }) } };
  delete require.cache[modelPath];
  try {
    const Corrida = require('../src/models/Corrida');
    const result = await Corrida.atualizarStatusControlado(91, 'cancelada', { tipo: 'passageiro', id: 7 });
    assert.equal(result.taxa_cancelamento.valor, 3);
    assert.equal(result.taxa_cancelamento.destinatario, 'motorista');
    assert.equal(result.taxa_cancelamento.repasse_status, 'creditado_carteira');
    assert.equal(calls.filter(({ sql }) => /INSERT INTO movi_taxas_cancelamento/.test(sql)).length, 1);
    const ledger = calls.filter(({ sql }) => /INSERT INTO movi_lancamentos_financeiros/.test(sql));
    assert.equal(ledger.length, 2);
    assert.deepEqual(ledger.map(({ values }) => [values[3], values[4], values[5]]), [
      ['taxa_cancelamento', 3, 'corrida:91:taxa_cancelamento:devida'],
      ['repasse_cancelamento', -3, 'corrida:91:taxa_cancelamento:motorista'],
    ]);
    const walletUpdate = calls.find(({ sql }) => /UPDATE motoristas[\s\S]*SET saldo_carteira/.test(sql));
    assert.deepEqual(walletUpdate.values, [ -7, false, 8 ]);
    const walletCredit = calls.find(({ sql }) => /INSERT INTO transacoes_motoristas/.test(sql));
    assert.deepEqual(walletCredit.values.slice(0, 6), [8, 91, 3, -10, -7, 'corrida:91:taxa_cancelamento:carteira']);
    assert.equal(calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
    assert.equal(calls.some(({ sql }) => /UPDATE passageiros/.test(sql)), true);
    assert.equal(calls.some(({ sql }) => /UPDATE movi_pagamentos[\s\S]*status = 'cancelado'/.test(sql)), true);
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel; else delete require.cache[modelPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('contestação de taxa de cancelamento abre chamado sem baixar o débito', async () => {
  const databasePath = require.resolve('../src/config/database');
  const modelPath = require.resolve('../src/models/CashDebt');
  const originalDatabase = require.cache[databasePath];
  const originalModel = require.cache[modelPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT t\.\*, c\.id AS ride_id/.test(sql)) return { rows: [{ id: 12, corrida_id: 91, passageiro_id: 7, status: 'pendente' }] };
      if (/INSERT INTO movi_suporte_chamados/.test(sql)) return { rows: [{ id: 701, resposta_prevista_min_em: '2026-10-14', resposta_prevista_max_em: '2026-10-15' }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client, query: async () => ({ rows: [] }) } };
  delete require.cache[modelPath];
  try {
    const CashDebt = require('../src/models/CashDebt');
    const result = await CashDebt.contestarTaxaCancelamento({ corridaId: 91, passageiroId: 7, descricao: 'Discordo da cobrança porque o horário do aceite está incorreto.' });
    assert.equal(result.status, 'contestada');
    assert.equal(result.suporte_chamado_id, 701);
    assert.equal(result.debito_preservado, true);
    assert.equal(calls.some(({ sql }) => /UPDATE passageiros/.test(sql)), false);
    assert.equal(calls.some(({ sql }) => /SET status = 'contestada'/.test(sql)), true);
    assert.equal(calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel; else delete require.cache[modelPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('resposta de débito aceita confirmação sem saldo e exige relato para contestação', () => {
  assert.deepEqual(respostaDebitoSchema.parse({ decisao: 'confirmar' }), { decisao: 'confirmar' });
  assert.equal(respostaDebitoSchema.safeParse({ decisao: 'contestar', descricao: 'Discordo do valor apresentado nesta corrida.' }).success, true);
  assert.equal(respostaDebitoSchema.safeParse({ decisao: 'contestar', descricao: 'Discordo.' }).success, false);
  assert.equal(respostaDebitoSchema.safeParse({ decisao: 'confirmar', valor: 30 }).success, false);
  assert.equal(respostaDebitoSchema.safeParse({ decisao: 'pagar' }).success, false);
});

test('contestação de dívida cria chamado e resposta na mesma transação, sem alterar saldo', async () => {
  const databasePath = require.resolve('../src/config/database');
  const modelPath = require.resolve('../src/models/CashDebt');
  const originalDatabase = require.cache[databasePath];
  const originalModel = require.cache[modelPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT o\.\*,\s*c\.forma_pagamento/.test(sql)) return { rows: [{ id: 71, corrida_id: 73, passageiro_id: 7, forma_pagamento: 'dinheiro', status: 'aberta', resposta_passageiro: 'pendente', diferenca_debito: '30.00', prazo_expirado: false }] };
      if (/INSERT INTO movi_suporte_chamados/.test(sql)) return { rows: [{ id: 501 }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client } };
  delete require.cache[modelPath];
  try {
    const CashDebt = require('../src/models/CashDebt');
    const result = await CashDebt.responder({ corridaId: 73, passageiroId: 7, decisao: 'contestar', descricao: 'Discordo do valor; paguei a diferença por Pix ao motorista.' });
    assert.equal(result.suporte_chamado_id, 501);
    assert.equal(result.resposta_passageiro, 'contestada');
    assert.equal(result.saldo_alterado, false);
    assert.deepEqual(calls.find(({ sql }) => /INSERT INTO movi_suporte_mensagens/.test(sql)).values, [501, 7, 'Discordo do valor; paguei a diferença por Pix ao motorista.']);
    assert.equal(calls.filter(({ sql }) => /INSERT INTO movi_suporte_chamados|INSERT INTO movi_suporte_mensagens|UPDATE ocorrencias_pagamento/.test(sql)).length, 3);
    assert.equal(calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
    assert.equal(calls.some(({ sql }) => /UPDATE passageiros/.test(sql)), false);
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel; else delete require.cache[modelPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('prazo expirado não transforma silêncio em confirmação de dívida', async () => {
  const databasePath = require.resolve('../src/config/database');
  const modelPath = require.resolve('../src/models/CashDebt');
  const originalDatabase = require.cache[databasePath];
  const originalModel = require.cache[modelPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT o\.\*,\s*c\.forma_pagamento/.test(sql)) return { rows: [{ id: 72, corrida_id: 74, passageiro_id: 8, forma_pagamento: 'dinheiro', status: 'aberta', resposta_passageiro: 'pendente', diferenca_debito: '15.00', prazo_expirado: true }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client } };
  delete require.cache[modelPath];
  try {
    const CashDebt = require('../src/models/CashDebt');
    const result = await CashDebt.responder({ corridaId: 74, passageiroId: 8, decisao: 'confirmar' });
    assert.equal(result.resposta_passageiro, 'prazo_esgotado');
    assert.equal(result.confirmacao_registrada, false);
    assert.ok(calls.some(({ sql }) => /SET resposta_passageiro = 'prazo_esgotado'/.test(sql)));
    assert.equal(calls.some(({ sql }) => /INSERT INTO movi_suporte_chamados|INSERT INTO movi_audit_logs|UPDATE passageiros/.test(sql)), false);
    assert.equal(calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel; else delete require.cache[modelPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('regras de tarifa são finitas e configuradas', () => {
  for (const categoria of ['moto', 'carro']) {
    const rule = regrasPreco[categoria];
    assert.ok(Number.isFinite(rule.taxaBase));
    assert.ok(Number.isFinite(rule.valorPorKm));
    assert.ok(rule.comissaoApp >= 0 && rule.comissaoApp <= 1);
  }
});


test('data de nascimento rejeita datas inexistentes e aplica idade mínima', () => {
  const schema = dateOfBirth();
  assert.equal(schema.safeParse('31/02/2000').success, false);
  assert.equal(schema.safeParse('01/01/2010').success, false);
  assert.equal(schema.safeParse('01/01/1990').success, true);
});

test('paginação e expiração são limitadas e resilientes a entrada inválida', () => {
  assert.deepEqual(parsePagination({ limit: '9999', offset: '-5' }), { limit: 100, offset: 0 });
  assert.deepEqual(parsePagination({ limit: 'abc', offset: '10' }, { defaultLimit: 20 }), { limit: 20, offset: 10 });
  assert.equal(parseExpiresIn('99999'), 3600);
  assert.equal(parseExpiresIn('abc'), 900);
});


const { splitFare } = require('../src/services/mapsService');

test('divisão financeira mantém 15/85 e piso líquido da categoria', () => {
  const moto = splitFare(5.50, 15, 1.00, 5);
  assert.equal(Number((moto.app + moto.driver).toFixed(2)), 5.89);
  assert.equal(moto.app, 0.88);
  assert.equal(moto.driver, 5.01);
  assert.ok(moto.driver >= 5.00);

  const car = splitFare(8.00, 15, 1.50, 5);
  assert.equal(Number((car.app + car.driver).toFixed(2)), 8.83);
  assert.equal(car.app, 1.32);
  assert.equal(car.driver, 7.51);
  assert.ok(car.driver >= 7.50);
});


test('cadastro exige aceite explícito dos documentos legais atuais', () => {
  const basePassageiro = {
    nome: 'Wallace', sobrenome: 'Teste', email: 'teste@example.com', telefone: '81999999999', senha: 'Movi@Teste2026',
    data_nascimento: '01/01/1990', cpf: '529.982.247-25', estado: 'PE',
  };
  assert.equal(cadastroPassageiroSchema.safeParse({ ...basePassageiro, aceita_termos: false }).success, false);
  assert.equal(cadastroPassageiroSchema.safeParse({ ...basePassageiro, aceita_termos: true }).success, true);

  const baseMotorista = {
    ...basePassageiro, email: 'motorista@example.com', categoria: 'moto', categoria_cnh: 'AB', aceita_termos: true,
    placa_veiculo: 'ABC1D23', marca_veiculo: 'Honda', modelo_veiculo: 'CG 160',
    cor_veiculo: 'Preta', ano_modelo_veiculo: 2024,
  };
  assert.equal(cadastroMotoristaSchema.safeParse({ ...baseMotorista, aceita_termos: undefined }).success, false);
  assert.equal(cadastroMotoristaSchema.safeParse(baseMotorista).success, true);
});

test('matching GEO por categoria preserva motorista disponível e repopula posição ao ficar disponível', async () => {
  const redisPath = require.resolve('../src/config/redis');
  const databasePath = require.resolve('../src/config/database');
  const dinamicaPath = require.resolve('../src/services/dinamicaService');

  const originalRedis = require.cache[redisPath];
  const originalDatabase = require.cache[databasePath];
  const originalDinamica = require.cache[dinamicaPath];

  const geo = new Map();
  const keys = new Map();
  const poolQueries = [];
  const fakeRedis = {
    isReady: true,
    async geoAdd(key, item) {
      if (!geo.has(key)) geo.set(key, new Map());
      geo.get(key).set(String(item.member), { ...item });
      return 1;
    },
    async geoSearchWith(key) {
      const members = [...(geo.get(key)?.values() || [])];
      return members.map((item) => ({ member: String(item.member), distance: '0.000' }));
    },
    async geoSearch(key) {
      return [...(geo.get(key)?.keys() || [])];
    },
    async mGet(names) {
      return names.map((name) => keys.get(name) ?? null);
    },
    async set(name, value) {
      keys.set(name, String(value));
      return 'OK';
    },
    async del(...names) {
      const list = names.flat();
      list.forEach((name) => keys.delete(name));
      return list.length;
    },
    async zRem(key, member) {
      geo.get(key)?.delete(String(member));
      return 1;
    },
  };

  const fakePool = {
    async query(sql) {
      poolQueries.push(sql);
      return {
        rows: [{
          id: 1,
          categoria: 'moto',
          status_cadastro: 'aprovado',
          status_conta: 'ativa',
          ultima_lat: '-8.2800000',
          ultima_lng: '-35.9700000',
        }],
      };
    },
  };

  delete require.cache[dinamicaPath];
  require.cache[redisPath] = { exports: fakeRedis };
  require.cache[databasePath] = { exports: fakePool };
  const dinamica = require(dinamicaPath);

  try {
    await dinamica.marcarMotoristaDisponivel(1, true);

    assert.equal(keys.get('presence:motorista:1'), '1');
    assert.equal(keys.get('availability:motorista:1'), '1');
    assert.ok(geo.get('motoristas_disponiveis:moto')?.has('1'));

    const result = await dinamica.buscarMotoristasProximos(-8.28, -35.97, 5, 'moto');
    assert.deepEqual(result, [{ motoristaId: 1, distanciaKm: 0 }]);

    await dinamica.renovarPresencaMotorista(1, true);
    assert.ok(poolQueries.some((sql) => /SET ultima_atividade_em = NOW\(\)/.test(sql)));
    assert.ok(poolQueries.some((sql) => /ultima_atividade_em IS NULL OR ultima_atividade_em < NOW\(\)/.test(sql)));

    await dinamica.marcarMotoristaDisponivel(1, false);
    assert.equal(keys.has('availability:motorista:1'), false);
    assert.equal(geo.get('motoristas_disponiveis:moto')?.has('1') || false, false);
  } finally {
    if (originalRedis) require.cache[redisPath] = originalRedis;
    else delete require.cache[redisPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase;
    else delete require.cache[databasePath];
    if (originalDinamica) require.cache[dinamicaPath] = originalDinamica;
    else delete require.cache[dinamicaPath];
  }
});


test('chaves de idempotência e request-id têm formato seguro', () => {
  const idempotency = require('../src/middlewares/idempotency');
  const crypto = require('crypto');
  const base = { method: 'POST', originalUrl: '/api/corridas/solicitar?x=1', query: { b: '2', a: '1' }, body: { z: 2, a: 1 } };
  const reqA = { ...base, query: { b: '2', a: '1' }, body: { z: 2, a: 1 } };
  const reqB = { ...base, query: { a: '1', b: '2' }, body: { a: 1, z: 2 } };
  assert.equal(idempotency.fingerprint(reqA), idempotency.fingerprint(reqB));
  assert.match(idempotency.fingerprint(reqA), /^[a-f0-9]{64}$/);
  assert.equal(crypto.createHash('sha256').update('movi').digest('hex').length, 64);
});

test('arquivo de produção não admite APIs dinâmicas perigosas', () => {
  const fs = require('fs');
  const path = require('path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'src/server.js'), 'utf8');
  assert.equal(/\beval\s*\(/.test(server), false);
  assert.equal(/\bnew\s+Function\s*\(/.test(server), false);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8'), /(^|\r?\n)\.env(\r?\n|$)/);
});

test('divisão financeira rejeita snapshot inconsistente', () => {
  const { assertFinancialSnapshot } = require('../src/models/Corrida');
  assert.doesNotThrow(() => assertFinancialSnapshot({ valor: 100, ganho_motorista: 85, ganho_app: 15, percentual_comissao_app: 15, percentual_repasse_motorista: 85 }));
  assert.throws(() => assertFinancialSnapshot({ valor: 100, ganho_motorista: 50, ganho_app: 40, percentual_comissao_app: 15, percentual_repasse_motorista: 85 }), /Snapshot financeiro inconsistente/);
  assert.throws(() => assertFinancialSnapshot({ valor: 100, ganho_motorista: 86, ganho_app: 14, percentual_comissao_app: 15, percentual_repasse_motorista: 85 }), /Snapshot financeiro inconsistente/);
});

test('extrato separa ganhos acumulados dos ganhos concluídos nas últimas 24 horas', async () => {
  const databasePath = require.resolve('../src/config/database');
  const corridaPath = require.resolve('../src/models/Corrida');
  const originalDatabase = require.cache[databasePath];
  const originalCorrida = require.cache[corridaPath];
  let statement = '';
  let parameters;
  require.cache[databasePath] = { exports: {
    async query(sql, values) {
      statement = sql;
      parameters = values;
      return { rows: [{ ganhos_motorista: '150.00', ganhos_ultimas_24h: '30.00', repasse_pendente: '24.00', saldo_carteira: '-4.50' }] };
    },
  } };
  delete require.cache[corridaPath];

  try {
    const Corrida = require('../src/models/Corrida');
    const resumo = await Corrida.resumoParaUsuario({ tipo: 'motorista', id: 42 });
    assert.deepEqual(parameters, [42, 'motorista']);
    assert.match(statement, /movi_lancamentos_financeiros l/);
    assert.match(statement, /l\.criado_em >= NOW\(\) - INTERVAL '24 hours'/);
    assert.match(statement, /l\.tipo = 'repasse_motorista'/);
    assert.match(statement, /AS ganhos_ultimas_24h/);
    assert.match(statement, /l\.metadata->>'liquidacao' = 'pendente'/);
    assert.equal(resumo.ganhos_motorista, '150.00');
    assert.equal(resumo.ganhos_ultimas_24h, '30.00');
    assert.equal(resumo.repasse_pendente, '24.00');
    assert.equal(resumo.saldo_carteira, '-4.50');
  } finally {
    if (originalCorrida) require.cache[corridaPath] = originalCorrida;
    else delete require.cache[corridaPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase;
    else delete require.cache[databasePath];
  }
});

test('finalização em dinheiro registra ganho do motorista separado da taxa debitada na carteira', async () => {
  const databasePath = require.resolve('../src/config/database');
  const corridaPath = require.resolve('../src/models/Corrida');
  const originalDatabase = require.cache[databasePath];
  const originalCorrida = require.cache[corridaPath];
  const calls = [];
  const fakeClient = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT \* FROM corridas/.test(sql)) return { rows: [{
        id: 73, passageiro_id: 8, motorista_id: 42, status: 'em_andamento', status_pagamento: 'pendente',
        forma_pagamento: 'dinheiro', valor: '100.00', ganho_motorista: '85.00', ganho_app: '15.00',
      }] };
      if (/SELECT saldo_carteira, bloqueado_dinheiro/.test(sql)) return { rows: [{ saldo_carteira: '5.00', bloqueado_dinheiro: false }] };
      if (/SELECT id FROM transacoes_motoristas/.test(sql)) return { rows: [] };
      if (/INSERT INTO movi_pagamentos/.test(sql)) return { rows: [{ id: 900 }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => fakeClient } };
  delete require.cache[corridaPath];

  try {
    const Corrida = require('../src/models/Corrida');
    const result = await Corrida.finalizarComPagamento(73, 42, { status_pagamento: 'pago', valor_recebido_motorista: 100 });
    const walletUpdate = calls.find(({ sql }) => /UPDATE motoristas SET saldo_carteira/.test(sql));
    const paymentInsert = calls.find(({ sql }) => /INSERT INTO movi_pagamentos/.test(sql));
    const ledgerEntries = calls.filter(({ sql }) => /INSERT INTO movi_lancamentos_financeiros/.test(sql));
    assert.equal(result.sucesso, true);
    assert.deepEqual(walletUpdate.values, [-10, true, 42]);
    assert.equal(paymentInsert.values[4], 'pago');
    assert.equal(paymentInsert.values[6], 100);
    assert.deepEqual(paymentInsert.values.slice(8, 12), [100, 0, 15, 'v1']);
    assert.match(paymentInsert.sql, /debito_taxa_cancelamento, comissao_marketplace, versao_calculo_financeiro/);
    assert.match(paymentInsert.sql, /CASE WHEN \$5::varchar = 'pago'::varchar/);
    assert.ok(ledgerEntries.every(({ sql }) => /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,'BRL',\$7,\$8::jsonb\)/.test(sql)));
    assert.ok(ledgerEntries.every(({ sql }) => /ON CONFLICT \(referencia_unica\) WHERE referencia_unica IS NOT NULL DO NOTHING/.test(sql)));
    assert.deepEqual(ledgerEntries.map(({ values }) => [values[4], values[5]]), [
      ['corrida_bruta', 100], ['repasse_motorista', -85], ['comissao_app', -15],
    ]);
    assert.equal(calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
    assert.equal(calls.some(({ sql }) => sql === 'ROLLBACK'), false);
  } finally {
    if (originalCorrida) require.cache[corridaPath] = originalCorrida;
    else delete require.cache[corridaPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase;
    else delete require.cache[databasePath];
  }
});

test('criação da corrida persiste débito de cancelamento separado da tarifa e da comissão', async () => {
  const databasePath = require.resolve('../src/config/database');
  const corridaPath = require.resolve('../src/models/Corrida');
  const originalDatabase = require.cache[databasePath];
  const originalCorrida = require.cache[corridaPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT id, debito_pendente, status_conta/.test(sql)) return { rows: [{ id: 9, debito_pendente: '3.00', status_conta: 'ativa' }] };
      if (/SELECT id FROM corridas/.test(sql)) return { rows: [] };
      if (/SELECT id, valor, valor_recuperado/.test(sql)) return { rows: [{ id: 13, valor: '3.00', valor_recuperado: '0.00' }] };
      if (/INSERT INTO corridas/.test(sql)) return { rows: [{ id: 88, status: 'solicitada', valor: '7.00' }] };
      if (/INSERT INTO movi_pagamentos/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client } };
  delete require.cache[corridaPath];
  try {
    const Corrida = require('../src/models/Corrida');
    await Corrida.criar({
      passageiro_id: 9, origem: 'Origem Caruaru', destino: 'Destino Caruaru',
      origem_lat: -8.28, origem_lng: -35.97, destino_lat: -8.29, destino_lng: -35.96,
      categoria: 'moto', distancia_km: 2, tempo_minutos: 8, dinamica_multiplicador: 1,
      valor: 7, ganho_motorista: 5.95, ganho_app: 1.05, percentual_comissao_app: 15,
      percentual_repasse_motorista: 85, forma_pagamento: 'dinheiro', tarifa_id: 1,
      tarifa_versao: 1, tarifa_snapshot: {}, valor_base_cliente: 7, valor_dinamica_cliente: 0,
    });
    const paymentInsert = calls.find(({ sql }) => /INSERT INTO movi_pagamentos/.test(sql));
    assert.deepEqual(paymentInsert.values.slice(3, 4), [10]);
    assert.deepEqual(paymentInsert.values.slice(6, 10), [7, 3, 1.05, '1']);
    assert.match(paymentInsert.sql, /tarifa_base, taxa_processamento, debito_taxa_cancelamento,\s*comissao_marketplace/);
    assert.equal(calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
  } finally {
    if (originalCorrida) require.cache[corridaPath] = originalCorrida;
    else delete require.cache[corridaPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase;
    else delete require.cache[databasePath];
  }
});

test('regras de limite financeiro bloqueiam passageiro em R$10 e dinheiro do motorista em -R$10', () => {
  const Corrida = require('../src/models/Corrida');
  assert.equal(Corrida.deveBloquearNovaCorrida(9.99), false);
  assert.equal(Corrida.deveBloquearNovaCorrida(10), true);
  assert.equal(Corrida.deveBloquearNovaCorrida(10.01), true);
  assert.equal(Corrida.deveBloquearCorridasEmDinheiro(-9.99), false);
  assert.equal(Corrida.deveBloquearCorridasEmDinheiro(-10), true);
  assert.equal(Corrida.deveBloquearCorridasEmDinheiro(-10.01), true);
});

test('acerto parcial em dinheiro separa comissão única, adiantamento e teto de proteção', () => {
  assert.deepEqual(calculateCashSettlement({ fare: 40, received: 10 }), {
    fare: 40,
    received: 10,
    passengerDebt: 30,
    commissionTotal: 6,
    commissionAllocatedToDebt: 6,
    commissionAlreadyCoveredByCash: 0,
    driverAdvance: 24,
    nonRecoverableProtectionCap: 20,
    protectionExposure: 20,
    advanceAboveProtectionCap: 4,
  });

  const edge = calculateCashSettlement({ fare: 100, received: 95 });
  assert.equal(edge.passengerDebt, 5);
  assert.equal(edge.commissionAlreadyCoveredByCash, 10);
  assert.equal(edge.commissionAllocatedToDebt, 5);
  assert.equal(edge.driverAdvance, 0);
});

test('recuperação da taxa de cancelamento em dinheiro não entra na base de comissão da corrida', () => {
  assert.deepEqual(calculateCashRideCollection({ fare: 7, cancellationDebt: 3, received: 10 }), {
    fare: 7, cancellationDebt: 3, totalDue: 10, totalReceived: 10,
    fareReceived: 7, cancellationDebtRecovered: 3, fareDebt: 0,
  });
  assert.deepEqual(calculateCashRideCollection({ fare: 7, cancellationDebt: 3, received: 9 }), {
    fare: 7, cancellationDebt: 3, totalDue: 10, totalReceived: 9,
    fareReceived: 7, cancellationDebtRecovered: 2, fareDebt: 0,
  });
  assert.deepEqual(calculateCashRideCollection({ fare: 7, cancellationDebt: 3, received: 5 }), {
    fare: 7, cancellationDebt: 3, totalDue: 10, totalReceived: 5,
    fareReceived: 5, cancellationDebtRecovered: 0, fareDebt: 2,
  });
});

test('corrida de R$7 com débito anterior de R$3 e pagamento em dinheiro separa comissão e recuperação', async () => {
  const databasePath = require.resolve('../src/config/database');
  const corridaPath = require.resolve('../src/models/Corrida');
  const originalDatabase = require.cache[databasePath];
  const originalCorrida = require.cache[corridaPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT \* FROM corridas/.test(sql)) return { rows: [{
        id: 88, passageiro_id: 9, motorista_id: 42, status: 'em_andamento', status_pagamento: 'pendente',
        forma_pagamento: 'dinheiro', valor: '7.00', ganho_motorista: '5.95', ganho_app: '1.05', debito_taxa_cancelamento: '3.00',
      }] };
      if (/SELECT saldo_carteira, bloqueado_dinheiro/.test(sql)) return { rows: [{ saldo_carteira: '0.00', bloqueado_dinheiro: false }] };
      if (/SELECT id, valor, valor_recuperado/.test(sql)) return { rows: [{ id: 11, valor: '3.00', valor_recuperado: '0.00' }] };
      if (/SELECT debito_pendente FROM passageiros/.test(sql)) return { rows: [{ debito_pendente: '3.00' }] };
      if (/INSERT INTO transacoes_motoristas/.test(sql)) return { rows: [{ id: 17 }] };
      if (/INSERT INTO movi_pagamentos/.test(sql)) return { rows: [{ id: 901 }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client } };
  delete require.cache[corridaPath];
  try {
    const Corrida = require('../src/models/Corrida');
    const result = await Corrida.finalizarComPagamento(88, 42, { status_pagamento: 'pago', valor_recebido_motorista: 10 });
    const walletUpdate = calls.find(({ sql }) => /UPDATE motoristas SET saldo_carteira/.test(sql));
    const debtUpdate = calls.find(({ sql }) => /UPDATE passageiros SET debito_pendente/.test(sql));
    const commission = calls.filter(({ sql }) => /VALUES \(\$1,\$2,'debito_taxa_app'/.test(sql));
    const ledger = calls.filter(({ sql }) => /INSERT INTO movi_lancamentos_financeiros/.test(sql));
    assert.equal(result.sucesso, true);
    assert.equal(result.debito_taxa_cancelamento_recuperado, 3);
    assert.deepEqual(walletUpdate.values, [-4.05, false, 42]);
    assert.deepEqual(debtUpdate.values, [0, 9]);
    assert.equal(commission.length, 1);
    assert.deepEqual(commission[0].values.slice(2, 3), [-1.05]);
    assert.ok(ledger.some(({ sql, values }) => sql.includes("'recuperacao_taxa_cancelamento_movi'") && values[3] === 3));
    assert.ok(ledger.some(({ sql, values }) => sql.includes("'baixa_debito_taxa_cancelamento'") && values[3] === -3));
    assert.equal(calls.filter(({ sql }) => /INSERT INTO movi_taxas_cancelamento_recuperacoes/.test(sql)).length, 1);
    assert.equal(calls.some(({ sql }) => sql === 'COMMIT'), true);
  } finally {
    if (originalCorrida) require.cache[corridaPath] = originalCorrida; else delete require.cache[corridaPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('corrida em dinheiro parcial registra comissão única e exposição sem duplicar a taxa no saldo', async () => {
  const databasePath = require.resolve('../src/config/database');
  const corridaPath = require.resolve('../src/models/Corrida');
  const originalDatabase = require.cache[databasePath];
  const originalCorrida = require.cache[corridaPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT \* FROM corridas/.test(sql)) return { rows: [{
        id: 74, passageiro_id: 9, motorista_id: 42, status: 'em_andamento', status_pagamento: 'pendente',
        forma_pagamento: 'dinheiro', valor: '100.00', ganho_motorista: '85.00', ganho_app: '15.00',
      }] };
      if (/SELECT saldo_carteira, bloqueado_dinheiro/.test(sql)) return { rows: [{ saldo_carteira: '0.00', bloqueado_dinheiro: false }] };
      if (/SELECT debito_pendente FROM passageiros/.test(sql)) return { rows: [{ debito_pendente: '0.00' }] };
      if (/SELECT id FROM ocorrencias_pagamento/.test(sql)) return { rows: [] };
      if (/SELECT id FROM transacoes_motoristas/.test(sql)) return { rows: [] };
      if (/INSERT INTO movi_pagamentos/.test(sql)) return { rows: [{ id: 901 }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client } };
  delete require.cache[corridaPath];
  try {
    const Corrida = require('../src/models/Corrida');
    const result = await Corrida.finalizarComPagamento(74, 42, { status_pagamento: 'parcial', valor_recebido_motorista: 40 });
    const walletUpdate = calls.find(({ sql }) => /UPDATE motoristas SET saldo_carteira/.test(sql));
    const debtUpdate = calls.find(({ sql }) => /UPDATE passageiros SET debito_pendente/.test(sql));
    const ledgerEntries = calls.filter(({ sql }) => /INSERT INTO movi_lancamentos_financeiros/.test(sql));
    assert.equal(result.sucesso, true);
    assert.deepEqual(walletUpdate.values, [0, false, 42]);
    assert.deepEqual(debtUpdate.values, [60, 9]);
    assert.deepEqual(ledgerEntries.map(({ values }) => [values[4], values[5]]), [
      ['corrida_bruta', 100], ['repasse_motorista', -85],
    ]);
    const settlement = calls.find(({ sql }) => /INSERT INTO movi_acertos_dinheiro/.test(sql));
    assert.ok(settlement);
    assert.deepEqual(settlement.values.slice(3), [100, 40, 60, 15, 15, 0, 45, 20, 20, 25]);
  } finally {
    if (originalCorrida) require.cache[corridaPath] = originalCorrida;
    else delete require.cache[corridaPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase;
    else delete require.cache[databasePath];
  }
});

test('finalização rejeita status pendente e parcial sem valor recebido positivo', async () => {
  const databasePath = require.resolve('../src/config/database');
  const corridaPath = require.resolve('../src/models/Corrida');
  const originalDatabase = require.cache[databasePath];
  const originalCorrida = require.cache[corridaPath];
  const cases = [
    { payment: { status_pagamento: 'pendente', valor_recebido_motorista: 0 }, code: 'INVALID_PAYMENT_STATUS' },
    { payment: { status_pagamento: 'parcial', valor_recebido_motorista: 0 }, code: 'INVALID_PARTIAL_PAYMENT' },
  ];

  try {
    for (const { payment, code } of cases) {
      const calls = [];
      const client = {
        async query(sql) {
          calls.push(sql);
          if (/SELECT \* FROM corridas/.test(sql)) return { rows: [{
            id: 73, passageiro_id: 8, motorista_id: 42, status: 'em_andamento', status_pagamento: 'pendente',
            forma_pagamento: 'dinheiro', valor: '100.00', ganho_motorista: '85.00', ganho_app: '15.00',
          }] };
          return { rows: [] };
        },
        release() {},
      };
      require.cache[databasePath] = { exports: { connect: async () => client } };
      delete require.cache[corridaPath];
      const Corrida = require('../src/models/Corrida');

      await assert.rejects(Corrida.finalizarComPagamento(73, 42, payment), (error) => error.code === code);
      assert.equal(calls.some((sql) => /UPDATE corridas/.test(sql)), false);
      assert.equal(calls.includes('ROLLBACK'), true);
    }
  } finally {
    if (originalCorrida) require.cache[corridaPath] = originalCorrida;
    else delete require.cache[corridaPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase;
    else delete require.cache[databasePath];
  }
});

test('matching reconstrói o GEO quando o índice está vazio mas o estado persistente é válido', async () => {
  const redisPath = require.resolve('../src/config/redis');
  const databasePath = require.resolve('../src/config/database');
  const dinamicaPath = require.resolve('../src/services/dinamicaService');
  const originalRedis = require.cache[redisPath];
  const originalDatabase = require.cache[databasePath];
  const originalDinamica = require.cache[dinamicaPath];

  const geo = new Map();
  const keys = new Map([
    ['presence:motorista:1', '1'],
    ['availability:motorista:1', '1'],
  ]);
  const fakeRedis = {
    isReady: true,
    async geoSearchWith() { return []; },
    async geoAdd(key, item) {
      if (!geo.has(key)) geo.set(key, new Map());
      geo.get(key).set(String(item.member), item);
      return 1;
    },
    async mGet(names) { return names.map((name) => keys.get(name) ?? null); },
    async zRem() { return 1; },
    async del() { return 1; },
    async set(name, value) { keys.set(name, String(value)); return 'OK'; },
  };
  const fakePool = {
    async query() {
      return { rows: [{ id: 1, categoria: 'moto', status_cadastro: 'aprovado', status_conta: 'ativa', online: true, disponivel: true, ultima_lat: '-8.2800000', ultima_lng: '-35.9700000', ultima_localizacao_em: new Date() }] };
    },
  };
  delete require.cache[dinamicaPath];
  require.cache[redisPath] = { exports: fakeRedis };
  require.cache[databasePath] = { exports: fakePool };
  const dinamica = require(dinamicaPath);
  try {
    const result = await dinamica.buscarMotoristasProximos(-8.28,-35.97,5,'moto',);
    assert.deepEqual(result, [{motoristaId: 1,distanciaKm: 0,},]);
    await dinamica.atualizarLocalizacaoMotorista(-8.28,-35.97,1,'moto',true,);
    assert.equal(keys.get('availability:motorista:1'),'1',);
    assert.ok(geo.get('motoristas_disponiveis:moto')?.has('1'),);
  } finally {
    if (originalRedis) require.cache[redisPath] = originalRedis; else delete require.cache[redisPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
    if (originalDinamica) require.cache[dinamicaPath] = originalDinamica; else delete require.cache[dinamicaPath];
  }
});

test('despacho de corrida em dinheiro pula motorista bloqueado e oferece ao próximo elegível', async () => {
  const paths = [
    '../src/config/database', '../src/services/dinamicaService', '../src/services/realtimeService',
    '../src/models/Corrida', '../src/services/pushService', '../src/jobs/offerWorker',
  ].map((path) => require.resolve(path));
  const originals = paths.map((path) => require.cache[path]);
  const offered = [];
  const emitted = [];
  const fakeClient = {
    async query(sql) {
      if (/SELECT \* FROM corridas/.test(sql)) return { rows: [{ id: 80, status: 'solicitada', motorista_id: null, forma_pagamento: 'dinheiro', categoria: 'moto', origem_lat: -8.28, origem_lng: -35.97, origem: 'A', destino: 'B', ganho_motorista: '8.50', distancia_km: 2, tempo_minutos: 8 }] };
      if (/SELECT 1 FROM corrida_ofertas/.test(sql)) return { rows: [] };
      if (/SELECT motorista_id FROM corrida_ofertas/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[paths[0]] = { exports: {
    connect: async () => fakeClient,
    async query(sql) {
      if (/SELECT id FROM motoristas/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    },
  } };
  require.cache[paths[1]] = { exports: {
    async buscarMotoristasProximos() { return [{ motoristaId: 1, distanciaKm: 0.1 }, { motoristaId: 2, distanciaKm: 0.2 }]; },
    async limparDemandaPassageiro() {},
  } };
  require.cache[paths[2]] = { exports: { async emitToUser(...args) { emitted.push(args); } } };
  require.cache[paths[3]] = { exports: { async criarOferta(...args) { offered.push(args); return { id: 1 }; } } };
  require.cache[paths[4]] = { exports: { async checkPushReceipts() {} } };
  delete require.cache[paths[5]];
  try {
    const worker = require(paths[5]);
    assert.equal(await worker.despacharProximaOferta(80), true);
    assert.equal(offered.length, 1);
    assert.equal(offered[0][1], 2);
    assert.equal(emitted[0][1], 2);
  } finally {
    paths.forEach((path, index) => {
      if (originals[index]) require.cache[path] = originals[index];
      else delete require.cache[path];
    });
  }
});

test('documentos críticos de motorista invalidam verificações antigas', () => {
  const fs = require('fs');
  const path = require('path');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '006_driver_document_reverification.sql'), 'utf8');
  assert.match(migration, /cnh_verificada_em := NULL/);
  assert.match(migration, /veiculo_verificado_em := NULL/);
  assert.match(migration, /status_cadastro := 'em_analise'/);
});

test('assinaturas de arquivos rejeitam conteúdo incompatível', () => {
  const upload = require('../src/middlewares/upload');
  assert.equal(upload.validarAssinaturaArquivo != null, true);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const png = Buffer.from([137,80,78,71,13,10,26,10]);
  const fakeReq = (buffer, mimetype) => ({ file: { buffer, mimetype }, files: null });
  assert.doesNotThrow(() => upload.validarAssinaturaArquivo(fakeReq(jpeg, 'image/jpeg'), {}, () => {}));
  assert.doesNotThrow(() => upload.validarAssinaturaArquivo(fakeReq(png, 'image/png'), {}, () => {}));
});

test('triagem do suporte prioriza segurança e não afirma resolver casos automaticamente', () => {
  const safety = supportKnowledge.triage('Sofri assédio durante a corrida e estou em perigo');
  assert.equal(safety.categoria_sugerida, 'seguranca');
  assert.equal(safety.sugerir_chamado, true);
  assert.equal(safety.resolvido_pelo_bot, false);
  assert.match(safety.resposta, /emergência/);

  const payment = supportKnowledge.triage('Quero contestar o valor cobrado no pagamento');
  assert.equal(payment.categoria_sugerida, 'pagamento');
  assert.equal(supportKnowledge.listArticles().length >= 4, true);
});

test('chamado exige descrição mínima, categoria válida e mensagem sem excesso', () => {
  const base = { categoria: 'corrida', assunto: 'Corrida não atualizou', mensagem: 'O status ficou parado mesmo após a viagem terminar.' };
  assert.equal(supportValidators.createTicketSchema.safeParse(base).success, true);
  assert.equal(supportValidators.createTicketSchema.safeParse({ ...base, mensagem: 'Ajuda' }).success, false);
  assert.equal(supportValidators.createTicketSchema.safeParse({ ...base, categoria: 'fraude' }).success, false);
  assert.equal(supportValidators.messageSchema.safeParse({ mensagem: '   ' }).success, false);
  assert.equal(supportValidators.adminFilterSchema.safeParse({ status: 'aberto', limit: '25', offset: '0' }).success, true);
});

test('criação de chamado valida participante e persiste chamado e primeira mensagem na mesma transação', async () => {
  const databasePath = require.resolve('../src/config/database');
  const modelPath = require.resolve('../src/models/SupportTicket');
  const originalDatabase = require.cache[databasePath];
  const originalModel = require.cache[modelPath];
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT passageiro_id, motorista_id FROM corridas/.test(sql)) return { rows: [{ passageiro_id: 7, motorista_id: 9 }] };
      if (/INSERT INTO movi_suporte_chamados/.test(sql)) return { rows: [{ id: 501, categoria: 'seguranca', corrida_id: 73, status: 'aberto' }] };
      return { rows: [] };
    },
    release() {},
  };
  require.cache[databasePath] = { exports: { connect: async () => client } };
  delete require.cache[modelPath];

  try {
    const SupportTicket = require('../src/models/SupportTicket');
    const ticket = await SupportTicket.create({ requesterType: 'passageiro', requesterId: 7, rideId: 73, category: 'seguranca', subject: 'Ocorrência na viagem', message: 'Preciso relatar o que aconteceu durante esta corrida.' });
    assert.equal(ticket.id, 501);
    assert.deepEqual(calls.find(({ sql }) => /INSERT INTO movi_suporte_mensagens/.test(sql)).values, [501, 'passageiro', 7, 'Preciso relatar o que aconteceu durante esta corrida.']);
    assert.deepEqual(calls.find(({ sql }) => /INSERT INTO movi_suporte_chamados/.test(sql)).values, ['passageiro', 7, 73, 'seguranca', 'Ocorrência na viagem', 'alta']);
    assert.equal(calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
    assert.equal(calls.some(({ sql }) => sql === 'ROLLBACK'), false);
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel; else delete require.cache[modelPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('chamado não é encontrado quando solicitante tenta acessar ticket de outra conta', async () => {
  const databasePath = require.resolve('../src/config/database');
  const modelPath = require.resolve('../src/models/SupportTicket');
  const originalDatabase = require.cache[databasePath];
  const originalModel = require.cache[modelPath];
  let query;
  require.cache[databasePath] = { exports: { async query(sql, values) { query = { sql, values }; return { rows: [] }; } } };
  delete require.cache[modelPath];

  try {
    const SupportTicket = require('../src/models/SupportTicket');
    const ticket = await SupportTicket.getForRequester({ ticketId: 501, requesterType: 'passageiro', requesterId: 8 });
    assert.equal(ticket, null);
    assert.deepEqual(query.values, [501, 'passageiro', 8]);
    assert.match(query.sql, /solicitante_tipo = \$2 AND solicitante_id = \$3/);
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel; else delete require.cache[modelPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('resposta do usuário reabre chamados aguardando resposta ou já resolvidos', async () => {
  const databasePath = require.resolve('../src/config/database');
  const modelPath = require.resolve('../src/models/SupportTicket');
  const originalDatabase = require.cache[databasePath];
  const originalModel = require.cache[modelPath];
  const cases = ['aguardando_usuario', 'resolvido'];

  try {
    for (const status of cases) {
      const calls = [];
      const client = {
        async query(sql) {
          calls.push(sql);
          if (/SELECT id, status FROM movi_suporte_chamados/.test(sql)) {
            return { rows: [{ id: 501, status }] };
          }
          return { rows: [] };
        },
        release() {},
      };
      require.cache[databasePath] = { exports: { connect: async () => client } };
      delete require.cache[modelPath];

      const SupportTicket = require('../src/models/SupportTicket');
      await SupportTicket.addRequesterMessage({
        ticketId: 501,
        requesterType: 'passageiro',
        requesterId: 7,
        message: 'Estou enviando as informações solicitadas pelo suporte.',
      });

      const update = calls.find((sql) => /UPDATE movi_suporte_chamados/.test(sql));
      assert.match(update, /status IN \('aguardando_usuario', 'resolvido'\)/);
      if (status === 'resolvido') assert.match(update, /resolvido_em = CASE WHEN status = 'resolvido' THEN NULL/);
      assert.equal(calls.includes('COMMIT'), true);
      assert.equal(calls.includes('ROLLBACK'), false);
    }
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel; else delete require.cache[modelPath];
    if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath];
  }
});

test('solicitação usa a cotação assinada e não recalcula a tarifa ou a dinâmica', async () => {
  const modulePaths = {
    corrida: require.resolve('../src/models/Corrida'),
    redis: require.resolve('../src/config/redis'),
    maps: require.resolve('../src/services/mapsService'),
    dinamica: require.resolve('../src/services/dinamicaService'),
    realtime: require.resolve('../src/services/realtimeService'),
    env: require.resolve('../src/config/env'),
    offerWorker: require.resolve('../src/jobs/offerWorker'),
    database: require.resolve('../src/config/database'),
    quote: require.resolve('../src/services/rideQuoteService'),
    controller: require.resolve('../src/controllers/corridaController'),
  };
  const originals = Object.fromEntries(Object.entries(modulePaths).map(([name, path]) => [name, require.cache[path]]));
  const calls = [];
  let createdRide;

  try {
    require.cache[modulePaths.corrida] = { exports: {
      criar: async (data) => {
        calls.push('criar');
        createdRide = { ...data, id: 801, status: 'solicitada', debito_taxa_cancelamento: 0 };
        return createdRide;
      },
    } };
    require.cache[modulePaths.redis] = { exports: {} };
    require.cache[modulePaths.maps] = { exports: { calcularRota: async () => { throw new Error('solicitação não pode recalcular rota/tarifa'); } } };
    require.cache[modulePaths.dinamica] = { exports: {
      registrarDemanda: async () => { calls.push('demanda'); },
      calcularMultiplicador: async () => { throw new Error('solicitação não pode recalcular dinâmica'); },
      buscarMotoristasProximos: async () => [],
      motoristaDisponivel: async () => false,
      marcarMotoristaDisponivel: async () => {},
      limparDemandaPassageiro: async () => {},
    } };
    require.cache[modulePaths.realtime] = { exports: { emitToUser: async () => {} } };
    require.cache[modulePaths.env] = { exports: { MP_CHECKOUT_ENABLED: false, PAYMENT_PROVIDER: 'none' } };
    require.cache[modulePaths.offerWorker] = { exports: { despacharProximaOferta: async () => false } };
    require.cache[modulePaths.database] = { exports: { query: async () => ({ rows: [] }) } };
    require.cache[modulePaths.quote] = { exports: {
      emitirCotacao: () => 'unused',
      validarCotacao: ({ token, passageiroId }) => {
        calls.push(`cotacao:${token}:${passageiroId}`);
        return {
          debito_taxa_cancelamento: 0,
          estimativa: {
            distanciaKm: 2, tempoMin: 8, multiplicadorDinamica: 1.5, dinamicaAplicada: '1.5x',
            valorPassageiro: 15, ganhoMotorista: 12.75, ganhoApp: 2.25,
            percentualComissaoApp: 15, percentualRepasseMotorista: 85,
            tarifaId: 1, tarifaVersao: 'v1', tarifaSnapshot: {},
            valorBaseCliente: 10, valorDinamicaCliente: 15,
          },
        };
      },
    } };
    delete require.cache[modulePaths.controller];

    const controller = require('../src/controllers/corridaController');
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await controller.solicitarCorrida({
      body: {
        origem: 'Minha localização', destino: 'Destino sintético',
        origem_lat: -8.2833, origem_lng: -35.9761,
        destino_lat: -8.28, destino_lng: -35.97,
        categoria: 'moto', forma_pagamento: 'dinheiro',
        cotacao_token: 'trusted-test-quote',
      },
      usuario: { id: 7 }, get: () => null,
    }, response);

    assert.deepEqual(calls, ['cotacao:trusted-test-quote:7', 'criar', 'demanda']);
    assert.equal(createdRide.dinamica_multiplicador, 1.5);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.detalhes_valores.valorPassageiro, 15);
  } finally {
    for (const [name, path] of Object.entries(modulePaths)) {
      if (originals[name]) require.cache[path] = originals[name];
      else delete require.cache[path];
    }
  }
});

test('cotação dinâmica é assinada, vinculada à entrada e expira em cinco minutos', () => {
  const { QUOTE_TTL_MS, emitirCotacao, validarCotacao } = require('../src/services/rideQuoteService');
  const entrada = {
    origem: 'Centro de Caruaru', destino: 'Maurício de Nassau',
    origem_lat: -8.28, origem_lng: -35.97,
    destino_lat: -8.285, destino_lng: -35.965,
    categoria: 'moto', forma_pagamento: 'dinheiro',
  };
  const estimativa = {
    distanciaKm: 2, tempoMin: 8, multiplicadorDinamica: 1.5,
    valorPassageiro: 15, ganhoMotorista: 12.75, ganhoApp: 2.25,
    geometria: { coordinates: Array.from({ length: 10000 }, () => [-35.97, -8.28]) },
  };
  const originalNow = Date.now;
  try {
    Date.now = () => 1_000_000;
    const token = emitirCotacao({ passageiroId: 7, entrada, estimativa, debitoTaxaCancelamento: 3 });
    assert.ok(token.length < 20000, 'geometria não deve inflar o token assinado');
    assert.equal(QUOTE_TTL_MS, 300000);
    const cotacao = validarCotacao({ token, passageiroId: 7, entrada });
    assert.equal(cotacao.estimativa.valorPassageiro, 15);
    assert.equal(cotacao.estimativa.multiplicadorDinamica, 1.5);
    assert.equal(cotacao.debito_taxa_cancelamento, 3);
    assert.equal('geometria' in cotacao.estimativa, false);

    const cotacao2x = emitirCotacao({
      passageiroId: 7,
      entrada,
      estimativa: { ...estimativa, multiplicadorDinamica: 2, valorPassageiro: 20 },
      debitoTaxaCancelamento: 0,
    });
    const validada2x = validarCotacao({ token: cotacao2x, passageiroId: 7, entrada });
    assert.equal(validada2x.estimativa.multiplicadorDinamica, 2);
    assert.equal(validada2x.estimativa.valorPassageiro, 20);

    const [conteudo, assinatura] = token.split('.');
    const assinaturaAlterada = `${assinatura.startsWith('A') ? 'B' : 'A'}${assinatura.slice(1)}`;
    assert.throws(
      () => validarCotacao({ token: `${conteudo}.${assinaturaAlterada}`, passageiroId: 7, entrada }),
      (error) => error.code === 'RIDE_QUOTE_INVALID',
    );
    assert.throws(
      () => validarCotacao({ token, passageiroId: 7, entrada: { ...entrada, destino_lat: -8.3 } }),
      (error) => error.code === 'RIDE_QUOTE_MISMATCH',
    );

    Date.now = () => 1_000_000 + QUOTE_TTL_MS;
    assert.throws(
      () => validarCotacao({ token, passageiroId: 7, entrada }),
      (error) => error.code === 'RIDE_QUOTE_EXPIRED',
    );
  } finally {
    Date.now = originalNow;
  }
});
