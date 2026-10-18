const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

let response;
const calls = [];
const source = fs.readFileSync(path.join(__dirname, '../src/features/corrida/corridaService.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const serviceModule = { exports: {} };
const localRequire = (specifier) => {
  if (specifier === '@/api/http') {
    return {
      apiFetch: (...args) => {
        calls.push(args);
        return Promise.resolve(response);
      },
      idempotencyKey: (scope) => `${scope}-finance-contract-test-key`,
    };
  }
  return require(specifier);
};
new Function('require', 'exports', 'module', compiled)(localRequire, serviceModule.exports, serviceModule);

test.beforeEach(() => {
  response = undefined;
  calls.length = 0;
});

test('extrato preserva ganhos, carteira e repasse pendente em campos separados', async () => {
  response = {
    saldo_total: '-3.00',
    ganhos_acumulados: '34.00',
    ganhos_ultimas_24h: '34.00',
    repasse_pendente: '24.00',
    total_viagens: 1,
    corridas_concluidas: 1,
    valor_total_corridas: '40.00',
    historico: [],
    pagina: { limit: 50, offset: 0 },
  };

  const result = await serviceModule.exports.getDriverStatement(50, 0);

  assert.equal(calls[0][0], '/api/extrato?limit=50&offset=0');
  assert.equal(result.ganhos_ultimas_24h, '34.00');
  assert.equal(result.repasse_pendente, '24.00');
  assert.equal(result.saldo_total, '-3.00');
  const home = fs.readFileSync(path.join(__dirname, '../app/(app)/home.tsx'), 'utf8');
  const statement = fs.readFileSync(path.join(__dirname, '../app/(app)/historico.tsx'), 'utf8');
  const menu = fs.readFileSync(path.join(__dirname, '../src/components/DriverMenuDrawer.tsx'), 'utf8');
  assert.match(home, /GANHOS NAS ÚLTIMAS 24H/);
  assert.match(home, /statement\.data\?\.ganhos_ultimas_24h/);
  assert.match(statement, /GANHOS NAS ÚLTIMAS 24H/);
  assert.match(statement, /não faz parte do saldo disponível da carteira/);
  assert.match(menu, /Meus ganhos[\s\S]*navigate\("\/\(app\)\/meus-ganhos"\)/);
});

test('Meus ganhos prepara cadastro e PIN, sem alegar saque Pix concluído', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../app/(app)/meus-ganhos.tsx'), 'utf8');
  const payoutService = fs.readFileSync(path.join(__dirname, '../src/features/financeiro/saqueService.ts'), 'utf8');
  assert.match(payoutService, /\/api\/motoristas\/recebimento/);
  assert.match(payoutService, /\/api\/motoristas\/saques\/pin/);
  assert.match(screen, /Solicitar saque · indisponível/);
  assert.match(screen, /armazenados cifrados/);
  assert.doesNotMatch(screen, /PIX ENVIADO COM SUCESSO/);
  assert.doesNotMatch(screen, /Movimentações de corridas/);
});

test('Radar exibe badge vermelho com quantidade real consultada no V3', () => {
  const layout = fs.readFileSync(path.join(__dirname, '../app/(app)/_layout.tsx'), 'utf8');
  assert.match(layout, /queryFn: getRadarRides/);
  assert.match(layout, /tabBarBadge: radarBadge/);
  assert.match(layout, /#E53945/);
  assert.match(layout, /name !== "radar"/);
});
