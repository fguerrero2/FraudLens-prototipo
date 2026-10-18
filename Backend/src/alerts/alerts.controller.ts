import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { currentTenant } from '../common/context/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
class UpdateAlertDto {
  @IsIn(['open', 'investigating', 'resolved']) status: string;
  @IsOptional() @IsString() @MaxLength(120) assigned_to?: string;
}
@Controller('alerts')
export class AlertsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() @Permissions('alerts.read') list() {
    return this.prisma.alert.findMany({ where: { tenantId: currentTenant() }, orderBy: { createdAt: 'desc' }, take: 100, include: { transaction: { select: { externalId: true, riskScore: true, decision: true } } } });
  }
  @Put(':id') @Permissions('alerts.update') async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlertDto, @Req() req) {
    const alert = await this.prisma.alert.update({ where: { id, tenantId: currentTenant() }, data: { status: dto.status, assignedTo: dto.assigned_to, resolvedAt: dto.status === 'resolved' ? new Date() : null } });
    await this.prisma.auditLog.create({ data: { tenantId: currentTenant(), actor: req.actor, actorRole: 'tenant', action: 'alert.updated', resourceType: 'alert', resourceId: id, outcome: 'success', metadata: JSON.stringify(dto) } });
    return alert;
  }
}
