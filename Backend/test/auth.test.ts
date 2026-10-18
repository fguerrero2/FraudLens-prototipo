import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../src/auth/auth.service';
import { AuthGuard } from '../src/common/guards/auth.guard';
import { hashPassword, hashToken, token, verifyPassword } from '../src/auth/credentials';
import { currentTenant, tenantContext } from '../src/common/context/tenant-context';

const userId = '00000000-0000-4000-8000-000000000003';
const tenantId = '00000000-0000-4000-8000-000000000001';
function fixture() {
  const sessions: any[] = [];
  const membership = { status: 'active', tenantId, tenant: { status: 'active' }, role: { tenantId, permissions: [{ permission: { code: 'transactions.read' } }] } };
  const user = { id: userId, status: 'active', email: 'ana@example.com', name: 'Ana', passwordHash: hashPassword('a-long-test-password'), platformRoles: [], memberships: [{ tenantId }] };
  const db: any = {
    authEvent: { create: async () => ({}) },
    user: { findUnique: async () => user },
    session: {
      create: async ({ data }) => { const session = { id: `session-${sessions.length}`, ...data, user }; sessions.push(session); return session; },
      findUnique: async ({ where }) => sessions.find(s => where.tokenHash ? s.tokenHash === where.tokenHash : s.refreshHash === where.refreshHash),
      update: async ({ where, data }) => Object.assign(sessions.find(s => s.id === where.id), data),
      updateMany: async ({ where, data }) => { const s = sessions.find(s => s.id === where.id && s.refreshHash === where.refreshHash && !s.revokedAt); if (!s) return { count: 0 }; Object.assign(s, data); return { count: 1 }; },
    },
    tenantMembership: { findUnique: async ({ where }) => where.tenantId_userId.tenantId === tenantId ? membership : null },
  };
  db.$transaction = async fn => fn(db);
  const auth = new AuthService({ identity: db } as any);
  return { auth, db, user, sessions, membership };
}

test('Passwords use salted scrypt hashes; API/session tokens are never stored verbatim', () => {
  const password = 'a-strong-password';
  const first = hashPassword(password), second = hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(verifyPassword(password, first), true);
  assert.equal(verifyPassword('wrong-password', first), false);
  const secret = token(); assert.notEqual(hashToken(secret), secret); assert.equal(hashToken(secret).length, 64);
});
test('Access token expiration, refresh rotation, replay rejection and logout revoke access', async () => {
  const { auth, sessions } = fixture();
  const issued = await (auth as any).issue(userId, tenantId);
  assert.notEqual(sessions[0].tokenHash, issued.access_token);
  assert.equal((await auth.authenticate(issued.access_token)).tenantId, tenantId);
  sessions[0].expiresAt = new Date(0);
  await assert.rejects(auth.authenticate(issued.access_token), /vencida/);
  const rotated = await auth.refresh(issued.refresh_token);
  await assert.rejects(auth.refresh(issued.refresh_token), /vencida/);
  const identity = await auth.authenticate(rotated.access_token);
  await auth.logout(identity);
  await assert.rejects(auth.authenticate(rotated.access_token), /vencida/);
  await assert.rejects(auth.refresh(rotated.refresh_token), /vencida/);
});
test('Tenant switches require active membership; suspension and role changes apply to existing sessions', async () => {
  const { auth, sessions, membership } = fixture();
  const issued = await (auth as any).issue(userId, tenantId);
  const identity = await auth.authenticate(issued.access_token);
  await assert.rejects(auth.selectTenant(identity, '00000000-0000-4000-8000-000000000002'), /Sin acceso/);
  assert.equal(sessions[0].tenantId, tenantId);
  membership.role.permissions = [];
  assert.deepEqual((await auth.authenticate(issued.access_token)).permissions, []);
  membership.tenant.status = 'suspended';
  await assert.rejects(auth.authenticate(issued.access_token), /Sin acceso/);
  const tenantless = await auth.authenticate(issued.access_token, true);
  assert.equal(tenantless.tenantId, undefined);
  assert.deepEqual(tenantless.permissions, []);
  await auth.logout(tenantless);
});
test('Global guard denies unauthenticated routes and enforces permissions without trusting tenant headers', async () => {
  const reflector = new Reflector();
  const identity = { userId, tenantId, actor: 'ana@example.com', permissions: ['transactions.read'], platformRoles: [] };
  const guard = new AuthGuard(reflector, { authenticate: async () => identity } as any, { identity: {} } as any);
  function handler() {};
  Reflect.defineMetadata('permissions', ['transactions.review'], handler);
  const req: any = { headers: { authorization: 'Bearer valid-token', 'x-tenant-id': 'another-tenant' }, url: '/transactions', method: 'GET' };
  const context: any = { getHandler: () => handler, getClass: () => class Controller {}, switchToHttp: () => ({ getRequest: () => req }) };
  await assert.rejects(guard.canActivate(context), /Permisos insuficientes/);
  Reflect.defineMetadata('permissions', ['transactions.read'], handler);
  assert.equal(await guard.canActivate(context), true);
  assert.equal(req.identity.tenantId, tenantId);
  req.headers = {};
  await assert.rejects(guard.canActivate(context), /Falta autenticación/);
});
test('Super admin does not implicitly bypass tenant permissions; business service fails without context', async () => {
  const reflector = new Reflector();
  function handler() {};
  Reflect.defineMetadata('permissions', ['transactions.read'], handler);
  const guard = new AuthGuard(reflector, { authenticate: async () => ({ platformRoles: ['SUPER_ADMIN'], permissions: [] }) } as any, {} as any);
  const context: any = { getHandler: () => handler, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer valid' } }) }) };
  await assert.rejects(guard.canActivate(context), /Permisos insuficientes/);
  assert.throws(() => currentTenant(), /Seleccione/);
  const values = await Promise.all([tenantId, '00000000-0000-4000-8000-000000000002'].map(id => tenantContext.run({ identity: { tenantId: id, actor: 'test', permissions: [], platformRoles: [] }, db: {} as any }, async () => { await Promise.resolve(); return currentTenant(); })));
  assert.notEqual(values[0], values[1]);
});
