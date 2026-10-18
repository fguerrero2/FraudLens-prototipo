import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenant, Identity, tenantContext } from '../common/context/tenant-context';
import { hashPassword, hashToken, token } from '../auth/credentials';
import { ROLE_PERMISSIONS } from '../auth/role-presets';
import { CreateApiClientDto, CreateRoleDto, CreateTenantDto, CreateUserDto, MembershipDto, UpdateMembershipDto, UpdateTenantDto } from './tenants.dto';

@Injectable()
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
      const admin = await db.role.findFirstOrThrow({ where: { tenantId: tenant.id, name: 'TENANT_ADMIN' } });
      await db.tenantMembership.create({ data: { tenantId: tenant.id, userId: identity.userId!, roleId: admin.id } });
      await db.$queryRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
      await db.thresholdConfig.create({ data: { tenantId: tenant.id, updatedBy: identity.actor } });
      await db.auditLog.create({ data: { tenantId: tenant.id, actor: identity.actor, actorRole: 'SUPER_ADMIN', action: 'tenant.created', resourceType: 'tenant', resourceId: tenant.id, outcome: 'success', metadata: '{}' } });
      return tenant;
    });
  }
  async updateTenant(id: string, dto: UpdateTenantDto, identity: Identity) {
    return this.prisma.identity.$transaction(async db => {
      await db.$queryRaw`SELECT set_config('app.tenant_id', ${id}, true)`;
      const tenant = await db.tenant.update({ where: { id }, data: dto });
      await db.auditLog.create({ data: { tenantId: id, actor: identity.actor, actorRole: 'SUPER_ADMIN', action: 'tenant.updated', resourceType: 'tenant', resourceId: id, outcome: 'success', metadata: JSON.stringify(dto) } });
      return tenant;
    });
  }
  async audit(identity: Identity, action: string, resourceType: string, resourceId?: string) {
    await this.prisma.auditLog.create({ data: { tenantId: currentTenant(), actor: identity.actor, actorRole: identity.platformRoles.join(',') || 'tenant', action, resourceType, resourceId, outcome: 'success', metadata: '{}' } });
  }
  private get db() { currentTenant(); return tenantContext.getStore()!.db; }
  async roles() { return this.db.role.findMany({ where: { tenantId: currentTenant() }, include: { permissions: { include: { permission: true } } } }); }
  async validateRole(id: string) {
    const role = await this.db.role.findFirst({ where: { id, tenantId: currentTenant() } });
    if (!role) throw new BadRequestException('Rol ajeno a la organización');
  }
  async members() {
    return this.db.tenantMembership.findMany({ where: { tenantId: currentTenant() }, include: { user: { select: { id: true, email: true, name: true, status: true } }, role: { select: { id: true, name: true } } } });
  }
  async createUser(dto: CreateUserDto, identity: Identity) {
    await this.validateRole(dto.role_id);
    const email = dto.email.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('El usuario ya existe; agregue una membresía');
    const result = await this.db.user.create({ data: { email, name: dto.name, passwordHash: hashPassword(dto.password), memberships: { create: { tenantId: currentTenant(), roleId: dto.role_id } } }, select: { id: true, email: true, name: true } });
    await this.audit(identity, 'user.created', 'user', result.id);
    return result;
  }
  async addMember(dto: MembershipDto, identity: Identity) {
    await this.validateRole(dto.role_id);
    const user = await this.db.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || user.status !== 'active') throw new NotFoundException('Usuario no disponible');
    const result = await this.db.tenantMembership.create({ data: { tenantId: currentTenant(), userId: user.id, roleId: dto.role_id } });
    await this.audit(identity, 'membership.created', 'membership', result.id);
    return result;
  }
  async updateMember(id: string, dto: UpdateMembershipDto, identity: Identity) {
    if (dto.role_id) await this.validateRole(dto.role_id);
    if (id === identity.userId) throw new BadRequestException('No puede modificar su propia membresía');
    const result = await this.db.tenantMembership.update({ where: { tenantId_userId: { tenantId: currentTenant(), userId: id } }, data: { roleId: dto.role_id, status: dto.status } });
    await this.audit(identity, 'membership.updated', 'membership', result.id);
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
    const result = await this.db.tenant.update({ where: { id: currentTenant() }, data: { name } });
    await this.audit(identity, 'tenant.updated', 'tenant', currentTenant());
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
