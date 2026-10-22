import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { resolve, sep } from 'node:path';
import { AnomalyModel } from '../risk/anomaly-model';
import { currentTenant } from '../common/context/tenant-context';
import { BadRequestException } from '../http/errors';
import { Route } from '../http/router';
import { PrismaService } from '../prisma/prisma.service';

class RegisterModelDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(2) @MaxLength(120) version: string;
  @IsIn(['heuristic', 'anomaly']) model_type: string;
  @IsOptional() @IsString() @MaxLength(500) artifact_path?: string;
}
class SelectModelDto { @IsUUID() model_id: string; }

export const mlRoutes = (prisma: PrismaService): Route[] => [
  {
    method: 'GET', path: '/models', summary: 'Listar modelos de riesgo disponibles', permissions: ['settings.read'],
    handler: () => prisma.identity.mlModel.findMany({ where: { status: 'active' }, select: { id: true, name: true, version: true, modelType: true, metrics: true } }),
  },
  { method: 'GET', path: '/platform/models', summary: 'Listar todos los modelos registrados', platformRoles: ['SUPER_ADMIN', 'PLATFORM_SUPPORT'], handler: () => prisma.identity.mlModel.findMany() },
  {
    method: 'POST', path: '/platform/models', summary: 'Registrar un modelo (heurístico o artefacto de anomalías)', platformRoles: ['SUPER_ADMIN'], body: RegisterModelDto,
    async handler({ body, identity }) {
      const dto = body as RegisterModelDto;
      let artifactPath: string | undefined;
      if (dto.model_type === 'anomaly') {
        // Artifacts are bundled through outputFileTracingIncludes (next.config.mjs), not traced from here.
        const root = resolve(/*turbopackIgnore: true*/ process.env.ML_ARTIFACT_ROOT || 'models');
        artifactPath = resolve(/*turbopackIgnore: true*/ root, dto.artifact_path ?? '');
        if (!dto.artifact_path || !artifactPath.startsWith(root + sep)) throw new BadRequestException('Artefacto fuera del directorio de modelos');
        try { if (AnomalyModel.load(artifactPath).version !== dto.version) throw new Error('Versión incompatible'); } catch { throw new BadRequestException('Artefacto inválido o versión incompatible'); }
      } else if (dto.version !== 'heuristic-v1') throw new BadRequestException('La versión del motor heurístico es heuristic-v1');
      return prisma.identity.$transaction(async db => {
        const model = await db.mlModel.create({ data: { name: dto.name, version: dto.version, modelType: dto.model_type, artifactPath } });
        await db.authEvent.create({ data: { userId: identity.userId, action: `model.registered:${model.id}` } });
        return model;
      });
    },
  },
  {
    method: 'GET', path: '/settings/model', summary: 'Ver el modelo asignado a la organización', permissions: ['settings.read'],
    handler: () => prisma.tenantModel.findUnique({ where: { tenantId: currentTenant() }, include: { model: { select: { id: true, name: true, version: true } } } }),
  },
  {
    method: 'PUT', path: '/settings/model', summary: 'Asignar un modelo a la organización', permissions: ['settings.update'], body: SelectModelDto,
    async handler({ body, actor }) {
      const model = await prisma.identity.mlModel.findFirst({ where: { id: (body as SelectModelDto).model_id, status: 'active' } });
      if (!model) throw new BadRequestException('Modelo no disponible');
      const assignment = await prisma.tenantModel.upsert({ where: { tenantId: currentTenant() }, create: { tenantId: currentTenant(), modelId: model.id }, update: { modelId: model.id, enabled: true } });
      await prisma.auditLog.create({ data: { tenantId: currentTenant(), actor: actor!, actorRole: 'tenant', action: 'model.changed', resourceType: 'model', resourceId: model.id, outcome: 'success', metadata: JSON.stringify({ version: model.version }) } });
      return assignment;
    },
  },
  { method: 'GET', path: '/platform/audit', summary: 'Últimos 100 eventos de autenticación y plataforma', platformRoles: ['SUPER_ADMIN', 'PLATFORM_SUPPORT'], handler: () => prisma.identity.authEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) },
];
