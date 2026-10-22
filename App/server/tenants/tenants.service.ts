import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../http/errors';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenant, Identity, isSuperAdmin, SUPER_ADMIN, TENANT_ADMIN, tenantContext } from '../common/context/tenant-context';
import { hashPassword, hashToken, token } from '../auth/credentials';
import { ROLE_PERMISSIONS } from '../auth/role-presets';
import { CreateApiClientDto, CreateRoleDto, CreateTenantAdminDto, CreateTenantDto, CreateUserDto, MembershipDto, UpdateMembershipDto, UpdateTenantAdminDto, UpdateTenantDto } from './tenants.dto';
import { recordHistory } from './history';

// Platform Administrators are never listed nor managed from an organization.
const notSuperAdmin = { platformRoles: { none: { role: SUPER_ADMIN } } };

export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}
  async createTenant(dto: CreateTenantDto, identity: Identity) {
    return this.prisma.identity.$transaction(async db => {
      const tenant = await db.tenant.create({ data: dto });
      for (const [name, codes] of Object.entries(ROLE_PERMISSIONS)) {
        const role = await db.role.create({ data: { tenantId: tenant.id, name } });
        for (const code of codes) {
          const permission = await db.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
          await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
        }
      }
      await db.$queryRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
      await db.thresholdConfig.create({ data: { tenantId: tenant.id, updatedBy: identity.actor } });
      await db.auditLog.create({ data: { tenantId: tenant.id, actor: identity.actor, actorRole: SUPER_ADMIN, action: 'tenant.created', resourceType: 'tenant', resourceId: tenant.id, outcome: 'success', metadata: '{}' } });
      await recordHistory(db, identity, { action: 'tenant.created', resourceType: 'tenant', resourceId: tenant.id, tenantId: tenant.id, metadata: { name: tenant.name, slug: tenant.slug } });
      return tenant;
    });
  }
  async updateTenant(id: string, dto: UpdateTenantDto, identity: Identity) {
    return this.prisma.identity.$transaction(async db => {
      await db.$queryRaw`SELECT set_config('app.tenant_id', ${id}, true)`;
      const before = await db.tenant.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Organización inexistente');
      const tenant = await db.tenant.update({ where: { id }, data: dto });
      const action = dto.status && dto.status !== before.status ? (dto.status === 'active' ? 'tenant.activated' : 'tenant.suspended') : 'tenant.updated';
      await db.auditLog.create({ data: { tenantId: id, actor: identity.actor, actorRole: SUPER_ADMIN, action, resourceType: 'tenant', resourceId: id, outcome: 'success', metadata: JSON.stringify(dto) } });
      await recordHistory(db, identity, { action, resourceType: 'tenant', resourceId: id, tenantId: id, metadata: { before: { name: before.name, status: before.status, plan: before.plan }, changes: dto } });
      return tenant;
    });
  }
  async createTenantAdmin(tenantId: string, dto: CreateTenantAdminDto, identity: Identity) {
    return this.prisma.identity.$transaction(async db => {
      const role = await db.role.findUnique({ where: { tenantId_name: { tenantId, name: TENANT_ADMIN } } });
      if (!role) throw new NotFoundException('Organización inexistente');
      const email = dto.email.trim().toLowerCase();
      let user = await db.user.findUnique({ where: { email }, include: { platformRoles: true } });
      if (user?.platformRoles.some(r => r.role === SUPER_ADMIN)) throw new BadRequestException('El Administrador ya tiene acceso a todas las organizaciones');
      if (!user) {
        if (!dto.name || !dto.password) throw new BadRequestException('Indique nombre y contraseña inicial para el nuevo usuario');
        user = await db.user.create({ data: { email, name: dto.name, passwordHash: hashPassword(dto.password) }, include: { platformRoles: true } });
        await recordHistory(db, identity, { action: 'user.created', resourceType: 'user', resourceId: user.id, tenantId, metadata: { email, name: user.name } });
      }
      const existing = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
      const membership = await db.tenantMembership.upsert({ where: { tenantId_userId: { tenantId, userId: user.id } }, update: { roleId: role.id, status: 'active' }, create: { tenantId, userId: user.id, roleId: role.id } });
      await recordHistory(db, identity, { action: existing ? 'membership.updated' : 'membership.created', resourceType: 'membership', resourceId: membership.id, tenantId, metadata: { email, role: TENANT_ADMIN, status: 'active' } });
      return { id: user.id, email: user.email, name: user.name, role: TENANT_ADMIN };
    });
  }
  async updateTenantAdmin(tenantId: string, userId: string, dto: UpdateTenantAdminDto, identity: Identity) {
    return this.prisma.identity.$transaction(async db => {
      const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, include: { role: true, user: true } });
      if (!membership || membership.role.name !== TENANT_ADMIN) throw new NotFoundException('Administrador de organización inexistente');
      if (dto.name && dto.name !== membership.user.name) {
        await db.user.update({ where: { id: userId }, data: { name: dto.name } });
        await recordHistory(db, identity, { action: 'user.updated', resourceType: 'user', resourceId: userId, tenantId, metadata: { email: membership.user.email, before: { name: membership.user.name }, changes: { name: dto.name } } });
      }
      if (dto.status && dto.status !== membership.status) {
        await db.tenantMembership.update({ where: { id: membership.id }, data: { status: dto.status } });
        await recordHistory(db, identity, { action: dto.status === 'active' ? 'membership.activated' : 'membership.disabled', resourceType: 'membership', resourceId: membership.id, tenantId, metadata: { email: membership.user.email, role: TENANT_ADMIN } });
      }
      return { id: userId, name: dto.name ?? membership.user.name, status: dto.status ?? membership.status };
    });
  }
  // Every organization with its organization administrators. Each query or export is logged.
  async tenantReport(identity: Identity, format: 'json' | 'xlsx' | 'txt' = 'json') {
    const tenants = await this.prisma.identity.tenant.findMany({ orderBy: { name: 'asc' }, include: { memberships: { where: { role: { name: TENANT_ADMIN }, user: notSuperAdmin }, include: { user: { select: { name: true, email: true } } } } } });
    const rows = tenants.map(t => ({ id: t.id, name: t.name, slug: t.slug, status: t.status, plan: t.plan, createdAt: t.createdAt, admins: t.memberships.map(m => ({ name: m.user.name, email: m.user.email, status: m.status })) }));
    await recordHistory(this.prisma.identity, identity, { action: format === 'json' ? 'tenant_report.viewed' : 'tenant_report.exported', resourceType: 'tenant_report', metadata: { format, organizations: rows.length } });
    return rows;
  }
  async tenantReportFile(rows: Awaited<ReturnType<TenantsService['tenantReport']>>, format: 'xlsx' | 'txt'): Promise<Buffer> {
    const flat = rows.flatMap(t => (t.admins.length ? t.admins : [null]).map(a => [t.name, t.slug, t.status, t.plan, t.createdAt.toISOString().slice(0, 10), a?.name ?? '—', a?.email ?? '—', a?.status ?? '—']));
    const headers = ['Organización', 'Identificador', 'Estado', 'Plan', 'Creada', 'Administrador', 'Email', 'Estado del administrador'];
    if (format === 'txt') {
      const widths = headers.map((h, i) => Math.max(h.length, ...flat.map(r => r[i].length)));
      const line = (r: string[]) => r.map((v, i) => v.padEnd(widths[i])).join(' | ').trimEnd();
      return Buffer.from([`Reporte de organizaciones · ${new Date().toISOString()}`, '', line(headers), widths.map(w => '-'.repeat(w)).join('-+-'), ...flat.map(line), ''].join('\n'), 'utf8');
    }
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Organizaciones');
    sheet.addRow(headers).font = { bold: true };
    flat.forEach(r => sheet.addRow(r));
    sheet.columns.forEach((column, i) => { column.width = Math.min(48, Math.max(headers[i].length, ...flat.map(r => r[i].length)) + 2); });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  async platformHistory() {
    return this.prisma.identity.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
  }
  async tenantHistory() {
    const entries = await this.db.platformAuditLog.findMany({ where: { tenantId: currentTenant(), resourceType: { in: ['user', 'membership'] } }, orderBy: { createdAt: 'desc' }, take: 200 });
    // Organization admins do not see who the platform Administrator is.
    return entries.map(e => e.actorRole === SUPER_ADMIN ? { ...e, actor: SUPER_ADMIN } : e);
  }
  async audit(identity: Identity, action: string, resourceType: string, resourceId?: string) {
    await this.prisma.auditLog.create({ data: { tenantId: currentTenant(), actor: identity.actor, actorRole: identity.platformRoles.join(',') || 'tenant', action, resourceType, resourceId, outcome: 'success', metadata: '{}' } });
  }
  private get db() { currentTenant(); return tenantContext.getStore()!.db; }
  async roles() { return this.db.role.findMany({ where: { tenantId: currentTenant() }, include: { permissions: { include: { permission: true } } } }); }
  // Only the platform Administrator grants or changes the organization admin role.
  async validateRole(id: string, identity: Identity) {
    const role = await this.db.role.findFirst({ where: { id, tenantId: currentTenant() } });
    if (!role) throw new BadRequestException('Rol ajeno a la organización');
    if (role.name === TENANT_ADMIN && !isSuperAdmin(identity)) throw new ForbiddenException('Solo el Administrador puede asignar el rol de administrador de organización');
    return role;
  }
  async members() {
    return this.db.tenantMembership.findMany({ where: { tenantId: currentTenant(), user: notSuperAdmin }, include: { user: { select: { id: true, email: true, name: true, status: true } }, role: { select: { id: true, name: true } } } });
  }
  async createUser(dto: CreateUserDto, identity: Identity) {
    const role = await this.validateRole(dto.role_id, identity);
    const email = dto.email.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('El usuario ya existe; agregue una membresía');
    const result = await this.db.user.create({ data: { email, name: dto.name, passwordHash: hashPassword(dto.password), memberships: { create: { tenantId: currentTenant(), roleId: dto.role_id } } }, select: { id: true, email: true, name: true } });
    await this.audit(identity, 'user.created', 'user', result.id);
    await recordHistory(this.db, identity, { action: 'user.created', resourceType: 'user', resourceId: result.id, tenantId: currentTenant(), metadata: { email, name: dto.name, role: role.name } });
    return result;
  }
  async addMember(dto: MembershipDto, identity: Identity) {
    const role = await this.validateRole(dto.role_id, identity);
    const user = await this.db.user.findFirst({ where: { email: dto.email.trim().toLowerCase(), ...notSuperAdmin } });
    if (!user || user.status !== 'active') throw new NotFoundException('Usuario no disponible');
    const result = await this.db.tenantMembership.create({ data: { tenantId: currentTenant(), userId: user.id, roleId: dto.role_id } });
    await this.audit(identity, 'membership.created', 'membership', result.id);
    await recordHistory(this.db, identity, { action: 'membership.created', resourceType: 'membership', resourceId: result.id, tenantId: currentTenant(), metadata: { email: user.email, role: role.name } });
    return result;
  }
  async updateMember(id: string, dto: UpdateMembershipDto, identity: Identity) {
    if (id === identity.userId) throw new BadRequestException('No puede modificar su propia membresía');
    const membership = await this.db.tenantMembership.findFirst({ where: { tenantId: currentTenant(), userId: id, user: notSuperAdmin }, include: { role: true, user: { select: { email: true } } } });
    if (!membership) throw new NotFoundException('Miembro inexistente');
    if (membership.role.name === TENANT_ADMIN && !isSuperAdmin(identity)) throw new ForbiddenException('Solo el Administrador puede modificar a un administrador de organización');
    const role = dto.role_id ? await this.validateRole(dto.role_id, identity) : membership.role;
    const result = await this.db.tenantMembership.update({ where: { id: membership.id }, data: { roleId: dto.role_id, status: dto.status } });
    await this.audit(identity, 'membership.updated', 'membership', result.id);
    const action = dto.status && dto.status !== membership.status ? (dto.status === 'active' ? 'membership.activated' : 'membership.disabled') : 'membership.updated';
    await recordHistory(this.db, identity, { action, resourceType: 'membership', resourceId: result.id, tenantId: currentTenant(), metadata: { email: membership.user.email, before: { role: membership.role.name, status: membership.status }, changes: { role: role.name, status: result.status } } });
    return result;
  }
  async createRole(dto: CreateRoleDto, identity: Identity) {
    if (!dto.permissions.every(code => identity.permissions.includes(code))) throw new ForbiddenException('No puede delegar permisos que no posee');
    const permissions = await this.db.permission.findMany({ where: { code: { in: dto.permissions } } });
    if (permissions.length !== new Set(dto.permissions).size) throw new BadRequestException('Permiso desconocido');
    const role = await this.db.role.create({ data: { tenantId: currentTenant(), type: 'custom', name: dto.name, permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
    await this.audit(identity, 'role.created', 'role', role.id);
    return role;
  }
  async updateRole(id: string, dto: CreateRoleDto, identity: Identity) {
    const role = await this.db.role.findFirst({ where: { id, tenantId: currentTenant(), type: 'custom' } });
    if (!role) throw new BadRequestException('Solo se modifican roles personalizados del tenant');
    if (!dto.permissions.every(code => identity.permissions.includes(code))) throw new ForbiddenException('No puede delegar permisos que no posee');
    const permissions = await this.db.permission.findMany({ where: { code: { in: dto.permissions } } });
    if (permissions.length !== new Set(dto.permissions).size) throw new BadRequestException('Permiso desconocido');
    const result = await this.db.role.update({ where: { id }, data: { name: dto.name, permissions: { deleteMany: {}, create: permissions.map(p => ({ permissionId: p.id })) } } });
    await this.audit(identity, 'role.updated', 'role', id);
    return result;
  }
  async renameTenant(name: string, identity: Identity) {
    const before = await this.db.tenant.findUniqueOrThrow({ where: { id: currentTenant() } });
    const result = await this.db.tenant.update({ where: { id: currentTenant() }, data: { name } });
    await this.audit(identity, 'tenant.updated', 'tenant', currentTenant());
    await recordHistory(this.db, identity, { action: 'tenant.updated', resourceType: 'tenant', resourceId: currentTenant(), tenantId: currentTenant(), metadata: { before: { name: before.name }, changes: { name } } });
    return result;
  }
  async apiClients() { return this.prisma.apiClient.findMany({ where: { tenantId: currentTenant() }, select: { id: true, name: true, permissions: true, status: true, lastUsedAt: true, createdAt: true } }); }
  async createApiClient(dto: CreateApiClientDto, identity: Identity) {
    const allowed = ['transactions.create', 'transactions.read', 'dashboard.read'];
    if (!dto.permissions.length || !dto.permissions.every(p => allowed.includes(p))) throw new BadRequestException('Permisos M2M inválidos');
    const secret = token();
    const client = await this.prisma.apiClient.create({ data: { tenantId: currentTenant(), name: dto.name, credential: { create: { tenantId: currentTenant(), secretHash: hashToken(secret) } }, permissions: [...new Set(dto.permissions)] }, select: { id: true, name: true, permissions: true } });
    await this.audit(identity, 'api_client.created', 'api_client', client.id);
    return { ...client, secret }; // The secret is returned only once.
  }
  async revokeApiClient(id: string, identity: Identity) {
    const client = await this.prisma.apiClient.update({ where: { id, tenantId: currentTenant() }, data: { status: 'revoked' }, select: { id: true, status: true } });
    await this.audit(identity, 'api_client.revoked', 'api_client', id);
    return client;
  }
}
