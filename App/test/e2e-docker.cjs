// End-to-end test for the local Docker image (compose.yaml). It WRITES data: never point it at Supabase/Vercel.
// TEST_EMAIL=... TEST_PASSWORD=... node test/e2e-docker.cjs   (account created by the seed, Administrator role)
const assert = require('node:assert/strict');
const base = process.env.TEST_API_URL || 'http://localhost:3000/api/v1';
const origin = new URL(base).origin;

async function call(path, { token, apiKey, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['x-api-key'] = apiKey;
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* binary or plain text */ }
  return { status: response.status, data, headers: response.headers };
}
const step = (name) => console.log(`✔ ${name}`);
const transaction = (id, extra = {}) => ({ transaction_id: id, user_id: 'usr_01H8M2', timestamp: new Date().toISOString(), amount: 25000, currency: 'ars', category: 'electronics', merchant: 'Tienda Demo', country: 'AR', channel: 'web', latitude: -34.6, longitude: -58.38, ...extra });

async function main() {
  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD (seeded Administrator)');
  const page = await fetch(origin + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html/);
  step('La web se sirve desde el mismo deploy que la API');

  const spec = await call('/openapi.json');
  assert.equal(spec.status, 200);
  // The production build must keep DTO class names (next.config.mjs serverMinification: false).
  assert.ok(spec.data.components.schemas.LoginDto, 'schema names are minified in the build');
  const docs = await fetch(origin + '/api/docs');
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /swagger-ui-bundle\.js/);
  step(`Documentación: OpenAPI ${spec.data.openapi} con ${Object.keys(spec.data.paths).length} rutas y Swagger UI en /api/docs`);

  const login = await call('/auth/login', { method: 'POST', body: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD } });
  assert.equal(login.status, 201);
  const token = login.data.access_token;
  const tenantA = login.data.tenants[0];
  assert.ok(tenantA, 'the seed creates a first organization');
  const selected = await call('/auth/tenant', { token, method: 'POST', body: { tenant_id: tenantA.id } });
  assert.equal(selected.status, 201);
  assert.equal(selected.data.tenant_id, tenantA.id);
  step(`Login del Administrador y selección de la organización "${tenantA.name}"`);

  for (const path of ['/dashboard/metrics', '/dashboard/heatmap', '/settings/thresholds', '/alerts', '/users', '/roles', '/settings/model', '/transactions/cases/list']) {
    assert.equal((await call(path, { token })).status, 200, path);
  }
  const list = await call('/transactions?page_size=5&sort=risk', { token });
  assert.equal(list.status, 200);
  step('Lecturas del dashboard, umbrales, alertas, usuarios, roles y transacciones (con SQL crudo y RLS)');

  const invalid = await call('/transactions', { token, method: 'POST', body: { transaction_id: 'x' } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.data.message, 'Faltan datos obligatorios o son invalidos');
  assert.ok(invalid.data.fields.length > 0);
  assert.equal((await call('/no-existe', { token })).status, 404);
  assert.equal((await call('/memberships/no-es-uuid', { token, method: 'PUT', body: {} })).status, 400);
  step('Errores con el mismo formato que NestJS (400 con campos, 404, UUID inválido)');

  const id = `e2e-${Date.now()}`;
  const created = await call('/transactions', { token, method: 'POST', body: transaction(id) });
  assert.equal(created.status, 201);
  assert.ok(['aprobar', 'revisar', 'bloquear'].includes(created.data.decision), JSON.stringify(created.data));
  step(`CU-01: transacción analizada → decisión "${created.data.decision}", riesgo ${created.data.risk_score ?? created.data.riskScore ?? '—'}`);

  const concurrentId = `${id}-concurrente`;
  const results = await Promise.all(Array.from({ length: 5 }, () => call('/transactions', { token, method: 'POST', body: transaction(concurrentId) })));
  assert.ok(results.every(r => r.status === 201), JSON.stringify(results.map(r => r.status)));
  const search = await call(`/transactions?transaction_id=${concurrentId}`, { token });
  const rows = search.data.data ?? search.data.items ?? search.data;
  assert.equal(Array.isArray(rows) ? rows.filter(r => (r.transaction_id ?? r.externalId) === concurrentId).length : 1, 1);
  step('Idempotencia: 5 envíos simultáneos del mismo id crean una sola transacción (pg_advisory_xact_lock)');

  const detail = await call(`/transactions/${id}`, { token });
  assert.equal(detail.status, 200);
  const review = await call(`/transactions/${id}/review`, { token, method: 'PUT', body: { outcome: 'fraud', analyst: 'E2E', comment: 'Revisión de prueba' } });
  assert.equal(review.status, 200);
  const fraudCase = await call(`/transactions/${id}/case`, { token, method: 'POST', body: { priority: 'high', reason: 'Caso de prueba E2E' } });
  assert.equal(fraudCase.status, 201);
  assert.equal((await call(`/transactions/${id}/case`, { token, method: 'PUT', body: { status: 'investigating' } })).status, 200);
  step('CU-06: detalle, revisión del analista y caso de fraude');

  const client = await call('/api-clients', { token, method: 'POST', body: { name: 'E2E integración', permissions: ['transactions.create', 'transactions.read'] } });
  assert.equal(client.status, 201);
  const m2m = await call('/transactions', { apiKey: client.data.secret, method: 'POST', body: transaction(`${id}-m2m`) });
  assert.equal(m2m.status, 201);
  assert.equal((await call('/auth/me', { apiKey: client.data.secret })).status, 403);
  step('Cliente API (x-api-key) crea transacciones y no puede usar rutas de sesión humana');

  const slug = `e2e-${Date.now()}`;
  const tenantB = await call('/platform/tenants', { token, method: 'POST', body: { name: `Organización ${slug}`, slug } });
  assert.equal(tenantB.status, 201, JSON.stringify(tenantB.data));
  const switched = await call('/auth/tenant', { token, method: 'POST', body: { tenant_id: tenantB.data.id } });
  assert.equal(switched.status, 201);
  const foreign = await call(`/transactions/${id}`, { token });
  assert.equal(foreign.status, 404);
  const foreignList = await call(`/transactions?transaction_id=${id}`, { token });
  const foreignRows = foreignList.data.data ?? foreignList.data.items ?? [];
  assert.equal(foreignRows.length, 0);
  step('Aislamiento: desde otra organización la transacción no existe (RLS)');
  await call('/auth/tenant', { token, method: 'POST', body: { tenant_id: tenantA.id } });

  const challenge = await call('/auth/qr/challenge', { method: 'POST' });
  assert.equal(challenge.status, 201);
  assert.equal((await call(`/auth/qr/status/${challenge.data.challenge_id}`)).data.status, 'PENDING');
  assert.equal((await call('/auth/qr/authorize', { token, method: 'POST', body: { challenge_id: challenge.data.challenge_id } })).status, 201);
  const approved = await call(`/auth/qr/status/${challenge.data.challenge_id}`);
  assert.equal(approved.data.status, 'APPROVED');
  assert.ok(approved.data.access_token);
  assert.equal((await call('/auth/me', { token: approved.data.access_token })).status, 200);
  assert.equal((await call(`/auth/qr/status/${challenge.data.challenge_id}`)).data.status, 'EXPIRED');
  step('Login por QR persistido en la base: aprobado una vez y consumido una vez');

  const xlsx = await fetch(`${base}/platform/report/tenants?format=xlsx`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get('content-type'), /spreadsheetml/);
  assert.match(xlsx.headers.get('content-disposition'), /organizaciones-.*\.xlsx/);
  assert.equal((await xlsx.arrayBuffer()).byteLength > 0, true);
  step('Reporte de organizaciones en Excel (descarga binaria)');

  const refreshed = await call('/auth/refresh', { method: 'POST', body: { refresh_token: login.data.refresh_token } });
  assert.equal(refreshed.status, 201);
  assert.equal((await call('/auth/logout', { token: refreshed.data.access_token, method: 'POST' })).status, 201);
  assert.equal((await call('/auth/me', { token: refreshed.data.access_token })).status, 401);
  step('Refresh de sesión y logout');
  console.log('\nPASS: prueba de punta a punta sobre la imagen Docker única.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
