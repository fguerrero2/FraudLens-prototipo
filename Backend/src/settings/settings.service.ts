import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateThresholdsDto } from './dto/update-thresholds.dto';
import { Thresholds } from './thresholds.types';

const DEFAULT_THRESHOLDS: Thresholds = {
  minAmountEnabled: true,
  minAmount: 10000,
  reviewThreshold: 60,
  blockThreshold: 85,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getThresholds() {
    const existing = await this.prisma.thresholdConfig.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    return this.prisma.thresholdConfig.create({ data: { id: 1, ...DEFAULT_THRESHOLDS, updatedBy: 'seed' } });
  }

  async getHistory() {
    return this.prisma.thresholdConfigHistory.findMany({ orderBy: { changedAt: 'desc' }, take: 50 });
  }

  async updateThresholds(dto: UpdateThresholdsDto, actor: string) {
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

    await this.prisma.thresholdConfigHistory.create({
      data: {
        minAmountEnabled: current.minAmountEnabled,
        minAmount: current.minAmount,
        reviewThreshold: current.reviewThreshold,
        blockThreshold: current.blockThreshold,
        changedBy: actor,
      },
    });

    return this.prisma.thresholdConfig.update({
      where: { id: 1 },
      data: { ...merged, updatedBy: actor },
    });
  }
}
