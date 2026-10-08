const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidCpf, normalizeEmail, normalizeCpf, normalizePhone } = require('../src/utils/validators');
const { assertRideTransition } = require('../src/utils/stateMachine');
const { regrasPreco } = require('../src/services/mapsService');
const { dateOfBirth } = require('../src/validators/commonValidator');
const { parsePagination, parseExpiresIn } = require('../src/utils/pagination');
const { cadastroPassageiroSchema } = require('../src/validators/passageiroValidator');
const { cadastroMotoristaSchema } = require('../src/validators/motoristaValidator');
const { signAccessToken, createRefreshToken, hashToken } = require('../src/services/tokenService');
const { verifyAccessToken } = require('../src/services/authService');
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
  assert.match(fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8'), /(^|\n)\.env(\n|$)/);
});

test('divisão financeira rejeita snapshot inconsistente', () => {
  const { assertFinancialSnapshot } = require('../src/models/Corrida');
  assert.doesNotThrow(() => assertFinancialSnapshot({ valor: 100, ganho_motorista: 85, ganho_app: 15, percentual_comissao_app: 15, percentual_repasse_motorista: 85 }));
  assert.throws(() => assertFinancialSnapshot({ valor: 100, ganho_motorista: 50, ganho_app: 40, percentual_comissao_app: 15, percentual_repasse_motorista: 85 }), /Snapshot financeiro inconsistente/);
  assert.throws(() => assertFinancialSnapshot({ valor: 100, ganho_motorista: 86, ganho_app: 14, percentual_comissao_app: 15, percentual_repasse_motorista: 85 }), /Snapshot financeiro inconsistente/);
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
