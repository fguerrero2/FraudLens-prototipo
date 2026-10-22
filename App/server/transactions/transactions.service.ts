import { currentTenant, tenantContext } from '../common/context/tenant-context';
import { NotFoundException } from '../http/errors';
import { Logger } from '../http/logger';
import { Prisma, Transaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { SettingsService } from '../settings/settings.service';
import { Thresholds } from '../settings/thresholds.types';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { isLowAmountExempt, decideWithVelocity } from './risk-policy';
import { computeRiskLevel } from './decision.util';
import { ReviewTransactionDto } from './dto/review-transaction.dto';
import { VELOCITY_WINDOW_MINUTES } from '../risk/risk.constants';
import { validateTimestamp } from './timestamp.validator';

export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskService: RiskService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(dto: CreateTransactionDto, actor = 'client') {
    // Serialize tenant/business-ID duplicates before inserting: avoids an aborted transaction on P2002.
    await tenantContext.getStore()!.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${currentTenant() + ':' + dto.transaction_id}, 0))`;
    const existing = await this.prisma.transaction.findUnique({ where: { tenantId_externalId: { tenantId: currentTenant(), externalId: dto.transaction_id } } });
    if (existing) {
      return this.toSummary(existing, true);
    }

    await tenantContext.getStore()!.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${currentTenant() + ':' + dto.user_id + ':' + dto.currency}, 0))`;
    const timestamp = validateTimestamp(dto.timestamp);
    const thresholds = await this.settingsService.getThresholds();

    const record = await this.analyzeAndPersist(dto, timestamp, thresholds);
    if (record.decision !== 'aprobar') await this.prisma.alert.create({ data: { tenantId: currentTenant(), transactionId: record.id, severity: record.riskLevel ?? 'alto' } });
    await this.writeAudit({
      actor,
      actorRole: tenantContext.getStore()!.identity.apiClientId ? 'api_client' : 'user',
      action: 'transaction.received',
      resourceType: 'transaction',
      resourceId: record.externalId,
      transactionId: record.id,
      outcome: record.decision,
      metadata: { rule_applied: record.ruleApplied, status: record.status },
    });
    return this.toSummary(record, false);
  }

  private async analyzeAndPersist(dto: CreateTransactionDto, timestamp: Date, thresholds: Thresholds) {
    // Count the full window, independently of the 200-row profile limit.
    const recentCount = await this.prisma.transaction.count({ where: {
      tenantId: currentTenant(), userId: dto.user_id, currency: dto.currency,
      timestamp: { gte: new Date(timestamp.getTime() - VELOCITY_WINDOW_MINUTES * 60_000), lt: timestamp },
    } });
    // Low-value operations still pass the velocity control before exemption.
    if (isLowAmountExempt(dto.amount, recentCount, thresholds)) {
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
      where: { tenantId: currentTenant(), userId: dto.user_id, currency: dto.currency, timestamp: { lt: timestamp } },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });

    let riskResult;
    let selectedVersion = this.riskService.modelVersion;
    try {
      const assignment = await this.prisma.tenantModel.findUnique({ where: { tenantId: currentTenant() }, include: { model: true } });
      const engine = assignment?.enabled ? this.riskService.forModel(assignment.model) : this.riskService;
      selectedVersion = engine.modelVersion;
      riskResult = engine.calculate(
        {
          transactionId: dto.transaction_id,
          timestamp,
          amount: dto.amount,
          category: dto.category,
          merchant: dto.merchant,
          country: dto.country,
          currency: dto.currency,
          deviceId: dto.device_id,
          operationType: dto.operation_type,
          oldBalanceOrig: dto.old_balance_orig,
          newBalanceOrig: dto.new_balance_orig,
          oldBalanceDest: dto.old_balance_dest,
          newBalanceDest: dto.new_balance_dest,
        },
        history.map((h) => ({
          timestamp: h.timestamp,
          amount: Number(h.amount),
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
    const { decision, ruleApplied } = decideWithVelocity(riskResult.score, recentCount, thresholds);

    return this.prisma.transaction.create({
      data: this.baseData(dto, timestamp, {
        riskScore: riskResult.score,
        riskLevel,
        decision,
        analyzedByModel: true,
        status: 'analizada',
        ruleApplied,
        modelVersion: selectedVersion,
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
      modelVersion?: string;
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
      tenant: { connect: { id: currentTenant() } },
      latitude: dto.latitude,
      longitude: dto.longitude,
      modelVersion: result.modelVersion ?? null,
      externalId: dto.transaction_id,
      userId: dto.user_id,
      timestamp,
      receivedAt: new Date(),
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
    const where: Prisma.TransactionWhereInput = { tenantId: currentTenant() };

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
    const record = await this.prisma.transaction.findUnique({ where: { tenantId_externalId: { tenantId: currentTenant(), externalId: transactionId } }, include: { fraudCase: true } });
    if (!record) throw new NotFoundException(`No existe una transaccion con id ${transactionId}`);
    const reviews = await this.prisma.transactionReview.findMany({ where: { transactionId: record.id, tenantId: currentTenant() }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return { ...this.toDetail(record), review: reviews[0] ?? null, review_history: reviews };
  }

  async review(transactionId: string, dto: ReviewTransactionDto, actor = 'analyst') {
    const record = await this.prisma.transaction.findUnique({ where: { tenantId_externalId: { tenantId: currentTenant(), externalId: transactionId } } });
    if (!record) throw new NotFoundException(`No existe una transaccion con id ${transactionId}`);
    await this.prisma.transactionReview.create({ data: { tenantId: currentTenant(), transactionId: record.id, outcome: dto.outcome, analyst: actor, comment: dto.comment } });
    await this.writeAudit({
      actor,
      actorRole: 'analyst',
      action: 'transaction.reviewed',
      resourceType: 'transaction',
      resourceId: record.externalId,
      transactionId: record.id,
      outcome: 'success',
      metadata: { review_outcome: dto.outcome },
    });
    return this.findOne(transactionId);
  }

  async createCase(transactionId: string, dto: { priority: string; reason: string }, actor = 'analyst') {
    const record = await this.prisma.transaction.findUnique({ where: { tenantId_externalId: { tenantId: currentTenant(), externalId: transactionId } } });
    if (!record) throw new NotFoundException(`No existe una transaccion con id ${transactionId}`);
    const fraudCase = await this.prisma.fraudCase.upsert({
      where: { transactionId: record.id, tenantId: currentTenant() },
      create: { tenantId: currentTenant(), transactionId: record.id, priority: dto.priority, reason: dto.reason, createdBy: actor },
      update: { priority: dto.priority, reason: dto.reason, status: 'open', resolution: null, resolvedBy: null, resolvedAt: null },
    });
    await this.writeAudit({
      actor,
      actorRole: 'analyst',
      action: 'fraud_case.opened',
      resourceType: 'fraud_case',
      resourceId: record.externalId,
      transactionId: record.id,
      outcome: 'success',
      metadata: { case_id: fraudCase.id, priority: fraudCase.priority },
    });
    return fraudCase;
  }

  async updateCase(transactionId: string, dto: { status: string; assigned_to?: string; resolution?: string }, actor = 'analyst') {
    const record = await this.prisma.transaction.findUnique({ where: { tenantId_externalId: { tenantId: currentTenant(), externalId: transactionId } }, include: { fraudCase: true } });
    if (!record) throw new NotFoundException(`No existe una transaccion con id ${transactionId}`);
    if (!record.fraudCase) throw new NotFoundException(`No existe un caso para la transaccion ${transactionId}`);
    const resolved = dto.status === 'resolved' || dto.status === 'closed';
    const fraudCase = await this.prisma.fraudCase.update({
      where: { transactionId: record.id, tenantId: currentTenant() },
      data: {
        status: dto.status,
        assignedTo: dto.assigned_to,
        resolution: dto.resolution,
        resolvedBy: resolved ? actor : null,
        resolvedAt: resolved ? new Date() : null,
      },
    });
    await this.writeAudit({
      actor,
      actorRole: 'analyst',
      action: 'fraud_case.updated',
      resourceType: 'fraud_case',
      resourceId: record.externalId,
      transactionId: record.id,
      outcome: 'success',
      metadata: { case_id: fraudCase.id, status: fraudCase.status },
    });
    return fraudCase;
  }

  async getCases(status?: string) {
    return this.prisma.fraudCase.findMany({
      where: { tenantId: currentTenant(), ...(status ? { status } : {}) },
      include: { transaction: { select: { externalId: true, userId: true, amount: true, currency: true, decision: true, riskLevel: true, timestamp: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async writeAudit(entry: {
    actor: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    transactionId?: string;
    outcome: string;
    metadata: Record<string, unknown>;
  }) {
    await this.prisma.auditLog.create({
      data: { tenantId: currentTenant(), ...entry, metadata: JSON.stringify(entry.metadata) },
    });
  }

  private toListItem(record: Transaction) {
    return {
      transaction_id: record.externalId,
      user_id: record.userId,
      timestamp: record.timestamp.toISOString(),
      amount: Number(record.amount),
      currency: record.currency,
      merchant: record.merchant,
      model_version: record.modelVersion,
      normalized_risk_score: record.riskScore === null ? null : record.riskScore / 100,
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
      model_version: record.modelVersion,
      normalized_risk_score: record.riskScore === null ? null : record.riskScore / 100,
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

  private toDetail(record: Transaction & { fraudCase?: unknown }) {
    const factors = JSON.parse(record.factors) as Array<{ code: string; label: string; points: number }>;
    return {
      transaction_id: record.externalId,
      user_id: record.userId,
      received_data: {
        timestamp: record.timestamp.toISOString(),
        amount: Number(record.amount),
        currency: record.currency,
        category: record.category,
        merchant: record.merchant,
        country: record.country,
        channel: record.channel,
        device_id: record.deviceId,
        operation_type: record.operationType,
        name_orig: record.nameOrig,
        old_balance_orig: record.oldBalanceOrig === null ? null : Number(record.oldBalanceOrig),
        new_balance_orig: record.newBalanceOrig === null ? null : Number(record.newBalanceOrig),
        name_dest: record.nameDest,
        old_balance_dest: record.oldBalanceDest === null ? null : Number(record.oldBalanceDest),
        new_balance_dest: record.newBalanceDest === null ? null : Number(record.newBalanceDest),
      },
      received_at: record.receivedAt.toISOString(),
      model_version: record.modelVersion,
      normalized_risk_score: record.riskScore === null ? null : record.riskScore / 100,
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
      fraud_case: record.fraudCase ?? null,
      analyzed_at: record.createdAt.toISOString(),
    };
  }
}
