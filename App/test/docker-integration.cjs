// Read-only smoke test against a running service. Uses an existing human test account.
// docker compose exec -e TEST_EMAIL=... -e TEST_PASSWORD=... backend node test/docker-integration.cjs
const assert = require('node:assert/strict');
async function main() {
  const base = process.env.TEST_API_URL || 'http://localhost:3000/api/v1';
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/transactions`)).status, 401);
  assert.equal((await fetch(`${base}/transactions`, { headers: { 'x-api-key': 'analyst_dev_key_change_me' } })).status, 401);
  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD for an existing test account');
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }) });
  assert.equal(login.status, 201);
  const session = await login.json();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const me = await fetch(`${base}/auth/me`, { headers });
  assert.equal(me.status, 200);
  const profile = await me.json();
  if (profile.tenant_id && profile.permissions.includes('transactions.read')) assert.equal((await fetch(`${base}/transactions`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers })).status, 201);
  assert.equal((await fetch(`${base}/auth/me`, { headers })).status, 401);
  console.log('PASS: health, authentication, rejection of legacy keys, tenant-scoped read and session revocation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
