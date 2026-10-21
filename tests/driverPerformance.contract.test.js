const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const model = fs.readFileSync(path.join(__dirname, '../src/models/Motorista.js'), 'utf8');

test('driver performance is based on the latest 100 eligible offers and accepted trips', () => {
  assert.match(model, /FROM corrida_ofertas[\s\S]*?status IN \('aceita', 'recusada', 'expirada'\)[\s\S]*?ORDER BY COALESCE\(respondida_em, expira_em\) DESC, id DESC[\s\S]*?LIMIT 100/);
  assert.match(model, /FROM corridas[\s\S]*?status = 'concluida'[\s\S]*?cancelada_por_tipo = 'motorista'[\s\S]*?ORDER BY aceita_em DESC, id DESC[\s\S]*?LIMIT 100/);
  assert.match(model, /taxa_aceitacao_pct/);
  assert.match(model, /taxa_finalizacao_pct/);
  assert.doesNotMatch(model, /INTERVAL\s+'30 days'/);
});

test('driver completion rate counts driver-caused cancellations except after the recorded three-minute pickup wait', () => {
  assert.match(model, /status = 'cancelada'\s+AND cancelada_por_tipo = 'motorista'[\s\S]*motorista_chegou_em[\s\S]*INTERVAL '3 minutes'/);
  assert.doesNotMatch(model, /status = 'cancelada'\s*\)/);
});
