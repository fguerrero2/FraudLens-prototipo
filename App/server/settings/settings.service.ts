import { currentTenant, tenantContext } from '../common/context/tenant-context';
import { BadRequestException } from '../http/errors';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateThresholdsDto } from './dto/update-thresholds.dto';
import { Thresholds } from './thresholds.types';

const DEFAULT_THRESHOLDS: Thresholds = {
  minAmountEnabled: true,
  minAmount: 10000,
  reviewThreshold: 60,
  blockThreshold: 85,
};

export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getThresholds() {
    const existing = await this.prisma.thresholdConfig.findUnique({ where: { tenantId: currentTenant() } });
    if (existing) return existing;
    return this.prisma.thresholdConfig.upsert({ where: { tenantId: currentTenant() }, update: {}, create: { tenantId: currentTenant(), ...DEFAULT_THRESHOLDS, updatedBy: 'seed' } });
  }

  async getHistory() {
    return this.prisma.thresholdConfigHistory.findMany({ where: { tenantId: currentTenant() }, orderBy: { changedAt: 'desc' }, take: 50 });
  }

  async updateThresholds(dto: UpdateThresholdsDto, actor: string) {
    await tenantContext.getStore()!.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${currentTenant() + ':settings'}, 0))`;
    const current = await this.getThresholds();

    const merged: Thresholds = {
      minAmountEnabled: dto.min_amount_enabled ?? current.minAmountEnabled,
      minAmount: dto.min_amount ?? current.minAmount,
      reviewThreshold: dto.review_threshold ?? current.reviewThreshold,
      blockThreshold: dto.block_threshold ?? current.blockThreshold,
    };

    if (merged.minAmount < 0) {
      throw new BadRequestException('El monto minimo de analisis no puede ser negativo');
    }
    if (merged.reviewThreshold < 0 || merged.reviewThreshold > 100 || merged.blockThreshold < 0 || merged.blockThreshold > 100) {
      throw new BadRequestException('Los umbrales de revision y bloqueo deben estar entre 0 y 100');
    }
    if (merged.blockThreshold <= merged.reviewThreshold) {
      throw new BadRequestException('El umbral de bloqueo debe ser mayor que el umbral de revision');
    }

    if (dto.timezone) {
      const [zone] = await tenantContext.getStore()!.db.$queryRaw<Array<{ valid: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${dto.timezone}) AS valid`;
      if (!zone.valid) throw new BadRequestException('Zona horaria desconocida');
    }
    await this.prisma.thresholdConfigHistory.create({
      data: {
        tenantId: currentTenant(),
        minAmountEnabled: current.minAmountEnabled,
        minAmount: current.minAmount,
        reviewThreshold: current.reviewThreshold,
        blockThreshold: current.blockThreshold,
        changedBy: actor,
      },
    });

    const updated = await this.prisma.thresholdConfig.update({
      where: { tenantId: currentTenant() },
      data: { ...merged, timezone: dto.timezone ?? current.timezone, defaultCurrency: dto.default_currency ?? current.defaultCurrency, updatedBy: actor },
    });
    {
      await this.prisma.auditLog.create({
        data: {
          tenantId: currentTenant(),
          actor,
          actorRole: 'admin',
          action: 'thresholds.updated',
          resourceType: 'threshold_config',
          outcome: 'success',
          metadata: JSON.stringify({ previous: current, updated }),
        },
      });
    }
    return updated;
  }

  async getAudit(limit = 100) {
    return this.prisma.auditLog.findMany({ where: { tenantId: currentTenant() }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 500) });
  }
}
