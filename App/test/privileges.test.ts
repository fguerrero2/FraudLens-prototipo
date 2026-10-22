import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { AuthService } from '../server/auth/auth.service';
import { TenantsService } from '../server/tenants/tenants.service';
import { Identity, tenantContext } from '../server/common/context/tenant-context';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
const adminRole = { id: 'role-admin', tenantId: tenantA, name: 'TENANT_ADMIN', permissions: [{ permission: { code: 'users.read' } }, { permission: { code: 'users.create' } }] };
const analystRole = { id: 'role-analyst', tenantId: tenantA, name: 'FRAUD_ANALYST', permissions: [] };
const superAdmin: Identity = { userId: 'super', tenantId: tenantA, actor: 'root@example.com', permissions: ['users.read', 'users.create', 'users.update'], platformRoles: ['SUPER_ADMIN'] };
const orgAdmin: Identity = { userId: 'org-admin', tenantId: tenantA, roleName: 'TENANT_ADMIN', actor: 'org@example.com', permissions: ['users.read', 'users.create', 'users.update'], platformRoles: [] };

function tenantDb() {
  const history: any[] = [], memberships: any[] = [];
  const db: any = {
    role: { findFirst: async ({ where }) => [adminRole, analystRole].find(r => r.id === where.id && r.tenantId === where.tenantId) ?? null },
    user: { findUnique: async () => null, create: async ({ data }) => ({ id: 'new-user', email: data.email, name: data.name }) },
    tenantMembership: {
      findMany: async args => { memberships.push(args); return []; },
      findFirst: async ({ where }) => where.userId === 'colleague' ? { id: 'm-1', status: 'active', role: adminRole, user: { email: 'colleague@example.com' } } : where.userId === 'analyst' ? { id: 'm-2', status: 'active', role: analystRole, user: { email: 'analyst@example.com' } } : null,
      update: async ({ where, data }) => ({ id: where.id, status: data.status ?? 'active' }),
    },
    auditLog: { create: async () => ({}) },
    platformAuditLog: { create: async ({ data }) => { history.push(data); return data; }, findMany: async () => history },
  };
  return { db, history, memberships, service: new TenantsService({ auditLog: db.auditLog, identity: db } as any) };
}
const inTenant = <T>(identity: Identity, db: any, fn: () => Promise<T>) => tenantContext.run({ identity, db }, fn);

test('Administrator has general access: TENANT_ADMIN permissions in any active organization and every organization listed', async () => {
  const db: any = {
    role: { findUnique: async ({ where }) => ({ ...adminRole, tenantId: where.tenantId_name.tenantId, tenant: { id: where.tenantId_name.tenantId, status: 'active' } }) },
    tenantMembership: { findUnique: async () => null, findMany: async () => [] },
    tenant: { findMany: async () => [{ id: tenantA, name: 'A' }, { id: tenantB, name: 'B' }] },
    user: { findUniqueOrThrow: async () => ({ id: 'super', email: 'root@example.com', name: 'Root', platformRoles: [{ role: 'SUPER_ADMIN' }] }) },
  };
  const auth = new AuthService({ identity: db } as any);
  const access = await auth.membership('super', tenantB, ['SUPER_ADMIN']);
  assert.deepEqual(access.role.permissions.map(p => p.permission.code), ['users.read', 'users.create']);
  await assert.rejects(auth.membership('someone', tenantB), /Sin acceso/);
  const profile = await auth.profile('super', tenantB);
  assert.equal(profile.role, 'SUPER_ADMIN');
  assert.deepEqual(profile.tenants.map(t => t.id), [tenantA, tenantB]);
});

test('Organization admins only manage non-admin members of their organization and never see Administrators', async () => {
  const { db, memberships, service } = tenantDb();
  await inTenant(orgAdmin, db, () => service.members());
  assert.equal(memberships[0].where.tenantId, tenantA);
  assert.deepEqual(memberships[0].where.user, { platformRoles: { none: { role: 'SUPER_ADMIN' } } });
  await inTenant(orgAdmin, db, async () => {
    await assert.rejects(service.createUser({ email: 'x@example.com', name: 'X', password: 'a-long-password', role_id: adminRole.id }, orgAdmin), /Solo el Administrador/);
    await assert.rejects(service.updateMember('colleague', { status: 'disabled' }, orgAdmin), /Solo el Administrador/);
    await assert.rejects(service.updateMember('analyst', { role_id: adminRole.id }, orgAdmin), /Solo el Administrador/);
    await assert.rejects(service.updateMember('super', { status: 'disabled' }, orgAdmin), /inexistente/);
    await service.updateMember('analyst', { status: 'disabled' }, orgAdmin);
  });
  await inTenant(superAdmin, db, () => service.updateMember('colleague', { status: 'disabled' }, superAdmin));
});

test('History records who changed users and hides the Administrator identity from organization admins', async () => {
  const { db, history, service } = tenantDb();
  await inTenant(orgAdmin, db, () => service.createUser({ email: 'Nuevo@Example.com', name: 'Nuevo', password: 'a-long-password', role_id: analystRole.id }, orgAdmin));
  await inTenant(superAdmin, db, () => service.updateMember('analyst', { status: 'disabled' }, superAdmin));
  assert.deepEqual(history.map(h => [h.action, h.actor, h.actorRole, h.tenantId]), [
    ['user.created', 'org@example.com', 'TENANT_ADMIN', tenantA],
    ['membership.disabled', 'root@example.com', 'SUPER_ADMIN', tenantA],
  ]);
  const visible = await inTenant(orgAdmin, db, () => service.tenantHistory());
  assert.deepEqual(visible.map(h => h.actor), ['org@example.com', 'SUPER_ADMIN']);
});

test('Organization report lists admins, logs each query and exports TXT and Excel', async () => {
  const history: any[] = [];
  const identity: any = {
    tenant: { findMany: async () => [{ id: tenantA, name: 'Banco A', slug: 'banco-a', status: 'active', plan: 'free', createdAt: new Date('2026-10-01'), memberships: [{ status: 'active', user: { name: 'Ana', email: 'ana@example.com' } }] }, { id: tenantB, name: 'Banco B', slug: 'banco-b', status: 'suspended', plan: 'free', createdAt: new Date('2026-10-02'), memberships: [] }] },
    platformAuditLog: { create: async ({ data }) => history.push(data) },
  };
  const service = new TenantsService({ identity } as any);
  const rows = await service.tenantReport(superAdmin, 'txt');
  assert.deepEqual(rows[0].admins, [{ name: 'Ana', email: 'ana@example.com', status: 'active' }]);
  assert.deepEqual(history.map(h => [h.action, h.metadata.format, h.actor]), [['tenant_report.exported', 'txt', 'root@example.com']]);
  const txt = (await service.tenantReportFile(rows, 'txt')).toString('utf8');
  assert.match(txt, /Banco A\s+\| banco-a\s+\| active\s+\| free\s+\| 2026-10-01 \| Ana\s+\| ana@example.com/);
  assert.match(txt, /Banco B .*\| —/);
  const xlsx = await service.tenantReportFile(rows, 'xlsx');
  assert.equal(xlsx.subarray(0, 2).toString(), 'PK');
});
