import { BadRequestException, Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { resolve, sep } from 'node:path';
import { AnomalyModel } from '../risk/anomaly-model';
import { Permissions, PlatformRoles } from '../common/decorators/permissions.decorator';
import { currentTenant } from '../common/context/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
class RegisterModelDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(2) @MaxLength(120) version: string;
  @IsIn(['heuristic', 'anomaly']) model_type: string;
  @IsOptional() @IsString() @MaxLength(500) artifact_path?: string;
}
class SelectModelDto { @IsUUID() model_id: string; }
@Controller()
export class MlController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('models') @Permissions('settings.read') models() { return this.prisma.identity.mlModel.findMany({ where: { status: 'active' }, select: { id: true, name: true, version: true, modelType: true, metrics: true } }); }
  @Get('platform/models') @PlatformRoles('SUPER_ADMIN', 'PLATFORM_SUPPORT') platformModels() { return this.prisma.identity.mlModel.findMany(); }
  @Post('platform/models') @PlatformRoles('SUPER_ADMIN') async register(@Body() dto: RegisterModelDto, @Req() req) {
    let artifactPath: string | undefined;
    if (dto.model_type === 'anomaly') {
      const root = resolve(process.env.ML_ARTIFACT_ROOT || 'models');
      artifactPath = resolve(root, dto.artifact_path ?? '');
      if (!dto.artifact_path || !artifactPath.startsWith(root + sep)) throw new BadRequestException('Artefacto fuera del directorio de modelos');
      try { if (AnomalyModel.load(artifactPath).version !== dto.version) throw new Error('Versión incompatible'); } catch { throw new BadRequestException('Artefacto inválido o versión incompatible'); }
    } else if (dto.version !== 'heuristic-v1') throw new BadRequestException('La versión del motor heurístico es heuristic-v1');
    return this.prisma.identity.$transaction(async db => {
      const model = await db.mlModel.create({ data: { name: dto.name, version: dto.version, modelType: dto.model_type, artifactPath } });
      await db.authEvent.create({ data: { userId: req.identity.userId, action: `model.registered:${model.id}` } });
      return model;
    });
  }
  @Get('settings/model') @Permissions('settings.read') model() { return this.prisma.tenantModel.findUnique({ where: { tenantId: currentTenant() }, include: { model: { select: { id: true, name: true, version: true } } } }); }
  @Put('settings/model') @Permissions('settings.update') async select(@Body() dto: SelectModelDto, @Req() req) {
    const model = await this.prisma.identity.mlModel.findFirst({ where: { id: dto.model_id, status: 'active' } });
    if (!model) throw new BadRequestException('Modelo no disponible');
    const assignment = await this.prisma.tenantModel.upsert({ where: { tenantId: currentTenant() }, create: { tenantId: currentTenant(), modelId: model.id }, update: { modelId: model.id, enabled: true } });
    await this.prisma.auditLog.create({ data: { tenantId: currentTenant(), actor: req.actor, actorRole: 'tenant', action: 'model.changed', resourceType: 'model', resourceId: model.id, outcome: 'success', metadata: JSON.stringify({ version: model.version }) } });
    return assignment;
  }
  @Get('platform/audit') @PlatformRoles('SUPER_ADMIN', 'PLATFORM_SUPPORT') audit() { return this.prisma.identity.authEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }); }
}
