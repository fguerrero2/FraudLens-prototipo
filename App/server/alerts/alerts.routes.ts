import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { currentTenant } from '../common/context/tenant-context';
import { Route } from '../http/router';
import { PrismaService } from '../prisma/prisma.service';

class UpdateAlertDto {
  @IsIn(['open', 'investigating', 'resolved']) status: string;
  @IsOptional() @IsString() @MaxLength(120) assigned_to?: string;
}

export const alertsRoutes = (prisma: PrismaService): Route[] => [
  {
    method: 'GET', path: '/alerts', summary: 'Listar las últimas 100 alertas', permissions: ['alerts.read'],
    handler: () => prisma.alert.findMany({ where: { tenantId: currentTenant() }, orderBy: { createdAt: 'desc' }, take: 100, include: { transaction: { select: { externalId: true, riskScore: true, decision: true } } } }),
  },
  {
    method: 'PUT', path: '/alerts/:id', summary: 'Actualizar estado o responsable de una alerta', permissions: ['alerts.update'], uuidParams: ['id'], body: UpdateAlertDto,
    async handler({ params: { id }, body, actor }) {
      const dto = body as UpdateAlertDto;
      const alert = await prisma.alert.update({ where: { id, tenantId: currentTenant() }, data: { status: dto.status, assignedTo: dto.assigned_to, resolvedAt: dto.status === 'resolved' ? new Date() : null } });
      await prisma.auditLog.create({ data: { tenantId: currentTenant(), actor: actor!, actorRole: 'tenant', action: 'alert.updated', resourceType: 'alert', resourceId: id, outcome: 'success', metadata: JSON.stringify(dto) } });
      return alert;
    },
  },
];
