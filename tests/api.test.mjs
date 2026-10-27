import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../api/calc.mjs';

const origin = 'https://cetus-price-cal.vercel.app';
const env = { APPS_SCRIPT_URL: 'https://script.google.com/macros/s/TEST_BACKEND/exec', APPS_SCRIPT_API_KEY: 'test-server-only-key', VERCEL: '1' };
const token = '11111111-2222-3333-4444-55555555555566666666-7777-8888-9999-aaaaaaaaaaaa';
function request(method, args = [], cookie = '', other = {}) {
  return new Request(origin + '/api/calc', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...other }, body: JSON.stringify({ method, args }) });
}
function setup(data = { admin: false, cars: [] }) {
  const calls = [];
  const handler = createHandler({ env, fetchImpl: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return Response.json({ ok: true, data }); } });
  return { calls, handler };
}
test('standalone HTML contains the complete app without private URLs or redirect', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /function renderEstimate/); assert.match(html, /Add components/); assert.match(html, /fetch\('\/api\/calc'/);
  for (const forbidden of ['script.google.com', 'google.script.run', 'http-equiv="refresh"', 'spreadsheets/d/', 'APPS_SCRIPT_API_KEY']) assert(!html.includes(forbidden), forbidden);
});
test('catalogue uses server-only connection and ignores client-provided tokens', async () => {
  const { handler, calls } = setup(); const result = await handler(request('calcRead', ['forged-token', true]));
  assert.equal(result.status, 200); assert.deepEqual(calls[0].body.args, ['', true]); assert.equal(calls[0].body.key, env.APPS_SCRIPT_API_KEY);
  const text = await result.text(); assert(!text.includes(env.APPS_SCRIPT_URL)); assert(!text.includes(env.APPS_SCRIPT_API_KEY));
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});
test('login stores real session only in a secure HttpOnly cookie', async () => {
  const { handler, calls } = setup(token); const response = await handler(request('calcLogin', ['test-password']));
  assert.deepEqual(calls[0].body.args, ['test-password']); assert.equal((await response.json()).data, 'authenticated');
  const set = response.headers.get('set-cookie'); for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=3600']) assert(set.includes(flag));
});
test('catalogue writes require cookie and forward actual server session', async () => {
  const { handler, calls } = setup({ admin: true });
  assert.equal((await handler(request('calcWrite', ['forged', 'revision', { type: 'price' }]))).status, 401); assert.equal(calls.length, 0);
  const response = await handler(request('calcWrite', ['forged', 'revision', { type: 'price' }], 'cetus_editor_session=' + token));
  assert.equal(response.status, 200); assert.equal(calls[0].body.args[0], token);
});
test('quote response does not expose the spreadsheet URL', async () => {
  const { handler } = setup({ id: 'CQ-TEST', total: 80051.2, tabName: 'Estimate', url: 'https://docs.google.com/spreadsheets/d/PRIVATE_SHEET/edit#gid=7' });
  const response = await handler(request('calcSaveQuote', ['fake', { tabName: 'Estimate' }], 'cetus_editor_session=' + token));
  assert.deepEqual((await response.json()).data, { id: 'CQ-TEST', total: 80051.2, tabName: 'Estimate' });
});
test('logout expires the cookie', async () => {
  const { handler } = setup(true); const response = await handler(request('calcLogout', [], 'cetus_editor_session=' + token)); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});
test('logout still clears the browser session during an upstream outage', async () => {
  const handler = createHandler({ env, fetchImpl: async () => { throw Error('offline'); } });
  const response = await handler(request('calcLogout', [], 'cetus_editor_session=' + token));
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});
test('cross-origin requests, arbitrary methods, missing configuration are rejected', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request('calcRead', [], '', { origin: 'https://other.example' }))).status, 403);
  assert.equal((await handler(request('calcSetup_', []))).status, 400); assert.equal(calls.length, 0);
  assert.equal((await createHandler({ env: {} })(request('calcRead'))).status, 503);
});
test('upstream failures reveal no private IDs and writes are not retried', async () => {
  let calls = 0;
  const handler = createHandler({ env, fetchImpl: async () => { calls++; return Response.json({ ok: false, error: { message: 'Service Spreadsheets failed while accessing document with ID PRIVATE_SHEET_ID.' } }); } });
  const response = await handler(request('calcSaveQuote', ['', {}], 'cetus_editor_session=' + token)); const text = await response.text();
  assert.equal(calls, 1); assert(!text.includes('PRIVATE_SHEET_ID')); assert(!text.includes(env.APPS_SCRIPT_URL));
});
test('timeouts, invalid upstream JSON and bad connection key are handled', async () => {
  assert.equal((await createHandler({ env, fetchImpl: async () => { throw Error('timeout'); } })(request('calcRead'))).status, 503);
  assert.equal((await createHandler({ env, fetchImpl: async () => new Response('<html>error</html>') })(request('calcRead'))).status, 502);
  assert.equal((await createHandler({ env, fetchImpl: async () => Response.json({ ok: false, error: { code: 'BRIDGE_AUTH' } }) })(request('calcRead'))).status, 503);
});
