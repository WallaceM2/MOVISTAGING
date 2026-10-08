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
