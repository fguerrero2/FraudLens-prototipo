import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { Permissions, PlatformRoles } from '../common/decorators/permissions.decorator';
import { currentTenant } from '../common/context/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from './tenants.service';
import { CreateApiClientDto, CreateRoleDto, CreateTenantDto, CreateUserDto, MembershipDto, RenameTenantDto, UpdateMembershipDto, UpdateTenantDto } from './tenants.dto';
@Controller()
export class TenantsController {
  constructor(private readonly tenants: TenantsService, private readonly prisma: PrismaService) {}
  @Get('platform/tenants') @PlatformRoles('SUPER_ADMIN', 'PLATFORM_SUPPORT') list() { return this.prisma.identity.tenant.findMany({ orderBy: { createdAt: 'desc' } }); }
  @Post('platform/tenants') @PlatformRoles('SUPER_ADMIN') create(@Body() dto: CreateTenantDto, @Req() req) { return this.tenants.createTenant(dto, req.identity); }
  @Put('platform/tenants/:id') @PlatformRoles('SUPER_ADMIN') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto, @Req() req) { return this.tenants.updateTenant(id, dto, req.identity); }
  @Get('tenant') @Permissions('tenant.read') tenant() { return this.prisma.identity.tenant.findUnique({ where: { id: currentTenant() } }); }
  @Put('tenant') @Permissions('tenant.update') rename(@Body() dto: RenameTenantDto, @Req() req) { return this.tenants.renameTenant(dto.name, req.identity); }
  @Get('users') @Permissions('users.read') users() { return this.tenants.members(); }
  @Post('users') @Permissions('users.create') user(@Body() dto: CreateUserDto, @Req() req) { return this.tenants.createUser(dto, req.identity); }
  @Post('memberships') @Permissions('users.create') member(@Body() dto: MembershipDto, @Req() req) { return this.tenants.addMember(dto, req.identity); }
  @Put('memberships/:id') @Permissions('users.update', 'users.disable') updateMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMembershipDto, @Req() req) { return this.tenants.updateMember(id, dto, req.identity); }
  @Get('roles') @Permissions('roles.read') roles() { return this.tenants.roles(); }
  @Post('roles') @Permissions('roles.create') role(@Body() dto: CreateRoleDto, @Req() req) { return this.tenants.createRole(dto, req.identity); }
  @Put('roles/:id') @Permissions('roles.update') updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRoleDto, @Req() req) { return this.tenants.updateRole(id, dto, req.identity); }
  @Get('api-clients') @Permissions('api_clients.read') clients() { return this.tenants.apiClients(); }
  @Post('api-clients') @Permissions('api_clients.create') client(@Body() dto: CreateApiClientDto, @Req() req) { return this.tenants.createApiClient(dto, req.identity); }
  @Put('api-clients/:id/revoke') @Permissions('api_clients.revoke') revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req) { return this.tenants.revokeApiClient(id, req.identity); }
}
