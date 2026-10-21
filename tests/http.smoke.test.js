const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server');

test('HTTP smoke: health, not-found e CORS são determinísticos', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));

  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/i);
  const homeHtml = await home.text();
  assert.match(homeHtml, /MOVI — Sua cidade em movimento/);
  assert.ok(homeHtml.includes('href="movi://"'));
  assert.ok(homeHtml.includes('data-app-launch="parceiro"'));

  const siteScript = await fetch(`${base}/site.js`);
  assert.equal(siteScript.status, 200);
  const siteJs = await siteScript.text();
  assert.match(siteJs, /parceiro:\s*Object\.freeze\(\{\s*deepLink:\s*'movi-motorista:\/\/'/);

  const siteCss = await fetch(`${base}/site.css`);
  assert.equal(siteCss.status, 200);
  assert.match(siteCss.headers.get('content-type'), /text\/css/i);

  const logo = await fetch(`${base}/assets/movi-logo-oficial.png`);
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type'), /image\/png/i);

  const live = await fetch(`${base}/health/live`);
  assert.equal(live.status, 200);
  assert.equal((await live.json()).status, 'UP');
  assert.match(live.headers.get('x-request-id'), /^[a-f0-9-]{16,128}$/i);

  const notFound = await fetch(`${base}/rota-que-nao-existe`);
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).codigo, 'NOT_FOUND');

  const denied = await fetch(`${base}/health/live`, { headers: { Origin: 'https://origem-invalida.example' } });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).codigo, 'CORS_ORIGIN_DENIED');
});
