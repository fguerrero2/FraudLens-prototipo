import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { IsString, MinLength } from 'class-validator';
import { createRouter, Route } from '../server/http/router';
import { currentTenant } from '../server/common/context/tenant-context';
import { AuthService } from '../server/auth/auth.service';
import { hashToken } from '../server/auth/credentials';

const tenantId = '00000000-0000-4000-8000-000000000001';
class NameDto { @IsString() @MinLength(2) name: string; }

function setup(identity: any = { userId: 'u1', tenantId, actor: 'ana@example.com', permissions: ['x.read'], platformRoles: [] }) {
  const configs: unknown[] = [];
  const tx = { $queryRaw: async (_strings: TemplateStringsArray, value: unknown) => { configs.push(value); return []; } };
  const prisma: any = { init: async () => {}, identity: { $transaction: async (fn: (db: unknown) => unknown) => fn(tx) } };
  const guard: any = { canActivate: async (rule: any, req: any) => { if (!rule.public) { req.identity = identity; req.actor = identity.actor; } return true; } };
  const routes: Route[] = [
    { method: 'GET', path: '/health', summary: 'test', public: true, handler: () => ({ status: 'ok' }) },
    { method: 'GET', path: '/items/fixed', summary: 'test', handler: () => 'fixed' },
    { method: 'GET', path: '/items/:id', summary: 'test', uuidParams: ['id'], handler: ({ params }) => ({ id: params.id, tenant: currentTenant() }) },
    { method: 'POST', path: '/items', summary: 'test', body: NameDto, handler: ({ body }) => ({ name: body.name, extra: body.extra }) },
    { method: 'GET', path: '/empty', summary: 'test', handler: () => null },
  ];
  return { dispatch: createRouter(routes, { guard, prisma }), configs };
}
const call = (dispatch: (r: Request) => Promise<Response>, path: string, init?: RequestInit) => dispatch(new Request(`http://localhost/api/v1${path}`, init));

test('Router keeps the NestJS contract: 201 on POST, whitelist validation, error body and 404', async () => {
  const { dispatch } = setup();
  const created = await call(dispatch, '/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ana', extra: 'dropped' }) });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { name: 'Ana' });
  const invalid = await call(dispatch, '/items', { method: 'POST', body: JSON.stringify({ name: 'A' }) });
  assert.equal(invalid.status, 400);
  const body = await invalid.json();
  assert.equal(body.message, 'Faltan datos obligatorios o son invalidos');
  assert.equal(body.fields[0].field, 'name');
  assert.equal(body.path, '/api/v1/items');
  const missing = await call(dispatch, '/nope');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'Not Found');
  const empty = await call(dispatch, '/empty');
  assert.equal(empty.status, 200);
  assert.equal(await empty.text(), '');
});

test('Router validates UUID params, prefers declared static routes and runs handlers inside the tenant RLS context', async () => {
  const { dispatch, configs } = setup();
  assert.equal(await (await call(dispatch, '/items/fixed')).json(), 'fixed');
  const bad = await call(dispatch, '/items/not-a-uuid');
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /uuid is expected/);
  const id = '00000000-0000-4000-8000-0000000000aa';
  assert.deepEqual(await (await call(dispatch, `/items/${id}`)).json(), { id, tenant: tenantId });
  assert.ok(configs.includes(tenantId), 'set_config(app.tenant_id) runs before the handler');
});

test('Business routes fail closed without an organization selected', async () => {
  const { dispatch } = setup({ userId: 'u1', actor: 'root', permissions: [], platformRoles: ['SUPER_ADMIN'] });
  const response = await call(dispatch, '/items/00000000-0000-4000-8000-0000000000aa');
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /Seleccione una organización/);
});

test('QR login survives different instances: stored hashed, approved once and consumed once', async () => {
  const rows = new Map<string, any>();
  const db: any = {
    qrChallenge: {
      deleteMany: async ({ where }) => {
        if (where.expiresAt) return { count: 0 };
        const row = rows.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        rows.delete(where.id); return { count: 1 };
      },
      create: async ({ data }) => { rows.set(data.id, { status: 'PENDING', ...data }); return data; },
      updateMany: async ({ where, data }) => {
        const row = rows.get(where.id);
        if (!row || row.status !== where.status || row.expiresAt <= where.expiresAt.gt) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
      findUnique: async ({ where }) => rows.get(where.id) ?? null,
    },
    authEvent: { create: async () => ({}) },
    session: { create: async () => ({}) },
    user: { findUniqueOrThrow: async () => ({ id: 'u1', email: 'ana@example.com', name: 'Ana', platformRoles: [] }) },
    tenantMembership: { findMany: async () => [] },
  };
  // Two service instances share only the database, like two Vercel function instances.
  const first = new AuthService({ identity: db } as any), second = new AuthService({ identity: db } as any);
  const { challenge_id } = await first.createQrChallenge();
  assert.ok(!rows.has(challenge_id) && rows.has(hashToken(challenge_id)), 'only the hash is stored');
  assert.deepEqual(await second.getQrChallengeStatus(challenge_id), { status: 'PENDING' });
  await second.authorizeQrChallenge({ userId: 'u1', actor: 'ana', permissions: [], platformRoles: [] }, challenge_id);
  await assert.rejects(first.authorizeQrChallenge({ userId: 'u2', actor: 'eve', permissions: [], platformRoles: [] }, challenge_id), /inválido o expirado/);
  const approved = await first.getQrChallengeStatus(challenge_id);
  assert.equal(approved.status, 'APPROVED');
  assert.ok('access_token' in approved && 'refresh_token' in approved);
  assert.deepEqual(await second.getQrChallengeStatus(challenge_id), { status: 'EXPIRED' });
});
