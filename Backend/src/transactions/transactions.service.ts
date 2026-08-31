import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { SettingsService } from '../settings/settings.service';
import { Thresholds } from '../settings/thresholds.types';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { computeDecision, computeRiskLevel } from './decision.util';
import { validateTimestamp } from './timestamp.validator';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskService: RiskService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(dto: CreateTransactionDto) {
    const existing = await this.prisma.transaction.findUnique({ where: { externalId: dto.transaction_id } });
    if (existing) {
      return this.toSummary(existing, true);
    }

    const timestamp = validateTimestamp(dto.timestamp);
    const thresholds = await this.settingsService.getThresholds();

    try {
      const record = await this.analyzeAndPersist(dto, timestamp, thresholds);
      return this.toSummary(record, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_ERROR) {
        // Carrera entre dos solicitudes concurrentes con el mismo transaction_id: idempotencia.
        const record = await this.prisma.transaction.findUniqueOrThrow({ where: { externalId: dto.transaction_id } });
        return this.toSummary(record, true);
      }
      throw error;
    }
  }

  private async analyzeAndPersist(dto: CreateTransactionDto, timestamp: Date, thresholds: Thresholds) {
    // CU-02: regla de monto minimo. Si aplica, se aprueba por regla sin ejecutar el modelo.
    if (thresholds.minAmountEnabled && dto.amount < thresholds.minAmount) {
      return this.prisma.transaction.create({
        data: this.baseData(dto, timestamp, {
          riskScore: null,
          riskLevel: 'no_evaluado',
          decision: 'aprobar',
          analyzedByModel: false,
          status: 'no_evaluada',
          ruleApplied: 'monto_minimo',
          factors: [{ code: 'below_min_amount', label: 'Monto inferior al minimo de analisis', points: 0 }],
          historySummary: null,
          thresholds,
        }),
      });
    }

    const history = await this.prisma.transaction.findMany({
      where: { userId: dto.user_id },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });

    let riskResult;
    try {
      riskResult = this.riskService.calculate(
        {
          transactionId: dto.transaction_id,
          timestamp,
          amount: dto.amount,
          category: dto.category,
          merchant: dto.merchant,
          country: dto.country,
          deviceId: dto.device_id,
          operationType: dto.operation_type,
          oldBalanceOrig: dto.old_balance_orig,
          newBalanceOrig: dto.new_balance_orig,
          oldBalanceDest: dto.old_balance_dest,
          newBalanceDest: dto.new_balance_dest,
        },
        history.map((h) => ({
          timestamp: h.timestamp,
          amount: h.amount,
          category: h.category,
          merchant: h.merchant,
          country: h.country,
          deviceId: h.deviceId,
        })),
      );
    } catch (error) {
      // NFR: un error del modelo nunca debe traducirse en una aprobacion silenciosa.
      this.logger.error(`Fallo el calculo de riesgo para ${dto.transaction_id}`, error as Error);
      return this.prisma.transaction.create({
        data: this.baseData(dto, timestamp, {
          riskScore: null,
          riskLevel: null,
          decision: 'revisar',
          analyzedByModel: false,
          status: 'analisis_no_disponible',
          ruleApplied: 'error_modelo',
          factors: [
            { code: 'model_error', label: 'Analisis no disponible: se recomienda revision manual', points: 0 },
          ],
          historySummary: null,
          thresholds,
        }),
      });
    }

    const riskLevel = computeRiskLevel(riskResult.score, thresholds);
    const { decision, ruleApplied } = computeDecision(riskResult.score, thresholds);

    return this.prisma.transaction.create({
      data: this.baseData(dto, timestamp, {
        riskScore: riskResult.score,
        riskLevel,
        decision,
        analyzedByModel: true,
        status: 'analizada',
        ruleApplied,
        factors: riskResult.factors,
        historySummary: riskResult.historySummary,
        thresholds,
      }),
    });
  }

  private baseData(
    dto: CreateTransactionDto,
    timestamp: Date,
    result: {
      riskScore: number | null;
      riskLevel: string | null;
      decision: string;
      analyzedByModel: boolean;
      status: string;
      ruleApplied: string;
      factors: unknown;
      historySummary: unknown;
      thresholds: Thresholds;
    },
  ): Prisma.TransactionCreateInput {
    return {
      externalId: dto.transaction_id,
      userId: dto.user_id,
      timestamp,
      amount: dto.amount,
      currency: dto.currency,
      category: dto.category,
      merchant: dto.merchant,
      country: dto.country,
      channel: dto.channel,
      deviceId: dto.device_id ?? null,
      operationType: dto.operation_type ?? null,
      nameOrig: dto.name_orig ?? null,
      oldBalanceOrig: dto.old_balance_orig ?? null,
      newBalanceOrig: dto.new_balance_orig ?? null,
      nameDest: dto.name_dest ?? null,
      oldBalanceDest: dto.old_balance_dest ?? null,
      newBalanceDest: dto.new_balance_dest ?? null,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      decision: result.decision,
      analyzedByModel: result.analyzedByModel,
      status: result.status,
      ruleApplied: result.ruleApplied,
      factors: JSON.stringify(result.factors),
      historySummary: result.historySummary ? JSON.stringify(result.historySummary) : null,
      thresholdSnapshot: JSON.stringify(result.thresholds),
    };
  }

  async findAll(query: QueryTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {};

    if (query.date_from || query.date_to) {
      where.timestamp = {
        ...(query.date_from ? { gte: new Date(query.date_from) } : {}),
        ...(query.date_to ? { lte: new Date(query.date_to) } : {}),
      };
    }
    if (query.risk_level) where.riskLevel = query.risk_level;
    if (query.decision) where.decision = query.decision;
    if (query.user_id) where.userId = query.user_id;
    if (query.transaction_id) where.externalId = { contains: query.transaction_id };

    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const orderBy: Prisma.TransactionOrderByWithRelationInput =
      query.sort === 'risk' ? { riskScore: query.order ?? 'desc' } : { timestamp: query.order ?? 'desc' };

    const [records, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: records.map((r) => this.toListItem(r)),
      pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async findOne(transactionId: string) {
    const record = await this.prisma.transaction.findUnique({ where: { externalId: transactionId } });
    if (!record) throw new NotFoundException(`No existe una transaccion con id ${transactionId}`);
    return this.toDetail(record);
  }

  private toListItem(record: Transaction) {
    return {
      transaction_id: record.externalId,
      user_id: record.userId,
      timestamp: record.timestamp.toISOString(),
      amount: record.amount,
      currency: record.currency,
      merchant: record.merchant,
      risk_score: record.riskScore,
      risk_level: record.riskLevel,
      decision: record.decision,
      status: record.status,
    };
  }

  private toSummary(record: Transaction, duplicate: boolean) {
    const factors = JSON.parse(record.factors) as Array<{ label: string }>;
    return {
      transaction_id: record.externalId,
      risk_score: record.riskScore,
      risk_level: record.riskLevel,
      decision: record.decision,
      analyzed_by_model: record.analyzedByModel,
      status: record.status,
      rule_applied: record.ruleApplied,
      reasons: factors.slice(0, 3).map((f) => f.label),
      duplicate,
      analyzed_at: record.createdAt.toISOString(),
    };
  }

  private toDetail(record: Transaction) {
    const factors = JSON.parse(record.factors) as Array<{ code: string; label: string; points: number }>;
    return {
      transaction_id: record.externalId,
      user_id: record.userId,
      received_data: {
        timestamp: record.timestamp.toISOString(),
        amount: record.amount,
        currency: record.currency,
        category: record.category,
        merchant: record.merchant,
        country: record.country,
        channel: record.channel,
        device_id: record.deviceId,
        operation_type: record.operationType,
        name_orig: record.nameOrig,
        old_balance_orig: record.oldBalanceOrig,
        new_balance_orig: record.newBalanceOrig,
        name_dest: record.nameDest,
        old_balance_dest: record.oldBalanceDest,
        new_balance_dest: record.newBalanceDest,
      },
      risk_score: record.riskScore,
      risk_level: record.riskLevel,
      decision: record.decision,
      analyzed_by_model: record.analyzedByModel,
      status: record.status,
      rule_applied: record.ruleApplied,
      factors,
      reasons: factors.slice(0, 3).map((f) => f.label),
      history_summary: record.historySummary ? JSON.parse(record.historySummary) : null,
      thresholds_applied: JSON.parse(record.thresholdSnapshot),
      analyzed_at: record.createdAt.toISOString(),
    };
  }
}
