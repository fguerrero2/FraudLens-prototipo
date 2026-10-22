import { currentTenant } from '../common/context/tenant-context';
import { Route } from '../http/router';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from './tenants.service';
import { CreateApiClientDto, CreateRoleDto, CreateTenantAdminDto, CreateTenantDto, CreateUserDto, MembershipDto, RenameTenantDto, TenantReportQueryDto, UpdateMembershipDto, UpdateTenantAdminDto, UpdateTenantDto } from './tenants.dto';

const REPORT_TYPES = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain; charset=utf-8' };

export const tenantsRoutes = (tenants: TenantsService, prisma: PrismaService): Route[] => [
  { method: 'GET', path: '/platform/tenants', summary: 'Listar organizaciones', platformRoles: ['SUPER_ADMIN', 'PLATFORM_SUPPORT'], handler: () => prisma.identity.tenant.findMany({ orderBy: { createdAt: 'desc' } }) },
  { method: 'POST', path: '/platform/tenants', summary: 'Crear una organización', platformRoles: ['SUPER_ADMIN'], body: CreateTenantDto, handler: ({ body, identity }) => tenants.createTenant(body, identity) },
  { method: 'PUT', path: '/platform/tenants/:id', summary: 'Renombrar, suspender o cambiar el plan de una organización', platformRoles: ['SUPER_ADMIN'], uuidParams: ['id'], body: UpdateTenantDto, handler: ({ params, body, identity }) => tenants.updateTenant(params.id, body, identity) },
  { method: 'POST', path: '/platform/tenants/:id/admins', summary: 'Crear o asignar el administrador de una organización', platformRoles: ['SUPER_ADMIN'], uuidParams: ['id'], body: CreateTenantAdminDto, handler: ({ params, body, identity }) => tenants.createTenantAdmin(params.id, body, identity) },
  { method: 'PUT', path: '/platform/tenants/:id/admins/:userId', summary: 'Modificar o desactivar un administrador de organización', platformRoles: ['SUPER_ADMIN'], uuidParams: ['id', 'userId'], body: UpdateTenantAdminDto, handler: ({ params, body, identity }) => tenants.updateTenantAdmin(params.id, params.userId, body, identity) },
  {
    method: 'GET', path: '/platform/report/tenants', summary: 'Reporte de organizaciones en JSON, Excel o texto', platformRoles: ['SUPER_ADMIN'], query: TenantReportQueryDto,
    responses: { '200': { description: 'JSON por defecto; con format=xlsx o txt, archivo adjunto', content: { 'application/json': { schema: {} }, [REPORT_TYPES.xlsx]: { schema: { type: 'string', format: 'binary' } }, 'text/plain': { schema: { type: 'string' } } } } },
    async handler({ query, identity }) {
      const format = (query as TenantReportQueryDto).format ?? 'json';
      const rows = await tenants.tenantReport(identity, format);
      if (format === 'json') return rows;
      const file = await tenants.tenantReportFile(rows, format);
      return new Response(new Uint8Array(file), { headers: { 'Content-Type': REPORT_TYPES[format], 'Content-Disposition': `attachment; filename="organizaciones-${new Date().toISOString().slice(0, 10)}.${format}"` } });
    },
  },
  { method: 'GET', path: '/platform/history', summary: 'Historial de cambios de usuarios y organizaciones', platformRoles: ['SUPER_ADMIN'], handler: () => tenants.platformHistory() },
  { method: 'GET', path: '/tenant', summary: 'Ver la organización activa', permissions: ['tenant.read'], handler: () => prisma.identity.tenant.findUnique({ where: { id: currentTenant() } }) },
  { method: 'PUT', path: '/tenant', summary: 'Renombrar la organización activa', permissions: ['tenant.update'], body: RenameTenantDto, handler: ({ body, identity }) => tenants.renameTenant(body.name, identity) },
  { method: 'GET', path: '/users', summary: 'Listar miembros de la organización', permissions: ['users.read'], handler: () => tenants.members() },
  { method: 'GET', path: '/users/history', summary: 'Historial de cambios de miembros', permissions: ['users.read', 'audit.read'], handler: () => tenants.tenantHistory() },
  { method: 'POST', path: '/users', summary: 'Crear un usuario y su membresía', permissions: ['users.create'], body: CreateUserDto, handler: ({ body, identity }) => tenants.createUser(body, identity) },
  { method: 'POST', path: '/memberships', summary: 'Agregar un usuario existente a la organización', permissions: ['users.create'], body: MembershipDto, handler: ({ body, identity }) => tenants.addMember(body, identity) },
  { method: 'PUT', path: '/memberships/:id', summary: 'Cambiar rol o estado de un miembro', permissions: ['users.update', 'users.disable'], uuidParams: ['id'], body: UpdateMembershipDto, handler: ({ params, body, identity }) => tenants.updateMember(params.id, body, identity) },
  { method: 'GET', path: '/roles', summary: 'Listar roles de la organización', permissions: ['roles.read'], handler: () => tenants.roles() },
  { method: 'POST', path: '/roles', summary: 'Crear un rol personalizado', permissions: ['roles.create'], body: CreateRoleDto, handler: ({ body, identity }) => tenants.createRole(body, identity) },
  { method: 'PUT', path: '/roles/:id', summary: 'Modificar un rol personalizado', permissions: ['roles.update'], uuidParams: ['id'], body: CreateRoleDto, handler: ({ params, body, identity }) => tenants.updateRole(params.id, body, identity) },
  { method: 'GET', path: '/api-clients', summary: 'Listar integraciones M2M', permissions: ['api_clients.read'], handler: () => tenants.apiClients() },
  { method: 'POST', path: '/api-clients', summary: 'Crear una integración M2M (el secreto se muestra una sola vez)', permissions: ['api_clients.create'], body: CreateApiClientDto, handler: ({ body, identity }) => tenants.createApiClient(body, identity) },
  { method: 'PUT', path: '/api-clients/:id/revoke', summary: 'Revocar una integración M2M', permissions: ['api_clients.revoke'], uuidParams: ['id'], handler: ({ params, identity }) => tenants.revokeApiClient(params.id, identity) },
];
