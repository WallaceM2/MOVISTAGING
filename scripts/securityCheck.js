const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`SECURITY_CHECK_FAIL: ${message}`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(src);
const forbidden = [
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /\bnew\s+Function\s*\(/, label: 'new Function()' },
  { pattern: /require\(['"]child_process['"]\)/, label: 'child_process import inside application source' },
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of forbidden) if (rule.pattern.test(content)) fail(`${rule.label} detectado em ${path.relative(root, file)}`);
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) fail(`sintaxe inválida em ${path.relative(root, file)}`);
}

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
if (!/(^|\n)\.env(?:\n|$)/m.test(gitignore)) fail('.env não está protegido pelo .gitignore');
if (!/(^|\n)node_modules\/?(?:\n|$)/m.test(gitignore)) fail('node_modules não está protegido pelo .gitignore');

const env = require(path.join(root, 'src/config/env'));
if (env.JWT_ACCESS_TTL === '24h' || env.JWT_ACCESS_TTL === '7d') fail('JWT_ACCESS_TTL excessivo');
if (env.isProduction && env.JWT_SECRET.length < 64) fail('JWT_SECRET fraco em produção');
if (env.isProduction && env.CORS_ORIGINS.some((o) => o.includes('seudominio.com'))) fail('CORS placeholder em produção');

const serverSource = fs.readFileSync(path.join(src, 'server.js'), 'utf8');
const authSource = fs.readFileSync(path.join(src, 'services/authService.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(root, 'migrations', '006_driver_document_reverification.sql'), 'utf8');
const boardingMigration = fs.readFileSync(path.join(root, 'migrations', '007_secure_boarding_code.sql'), 'utf8');
const safetyMigration = fs.readFileSync(path.join(root, 'migrations', '008_push_and_trip_sharing.sql'), 'utf8');
if (!serverSource.includes("app.disable('x-powered-by')")) fail('x-powered-by não está desabilitado');
if (!serverSource.includes("httpServer.requestTimeout")) fail('request timeout não configurado');
if (!authSource.includes("algorithms: ['HS256']")) fail('algoritmo JWT não está fixado explicitamente');
if (!migrationSource.includes('cnh_verificada_em := NULL')) fail('revalidação de CNH não está protegida na migration 006');
if (!migrationSource.includes('veiculo_verificado_em := NULL')) fail('revalidação de veículo não está protegida na migration 006');
if (!boardingMigration.includes('codigo_embarque_tentativas') || !boardingMigration.includes('codigo_embarque_bloqueado_ate')) fail('limite e bloqueio de tentativas do código de embarque ausentes na migration 007');
if (!safetyMigration.includes('token_hash CHAR(64)') || !safetyMigration.includes('expo_push_token VARCHAR(255) NOT NULL UNIQUE')) fail('compartilhamento seguro ou armazenamento de push não está protegido na migration 008');

if (failures) process.exit(1);
console.log('Security foundation checks: OK');
