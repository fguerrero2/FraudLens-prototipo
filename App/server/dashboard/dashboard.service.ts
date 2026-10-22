import { currentTenant, tenantContext } from '../common/context/tenant-context';
import { PrismaService } from '../prisma/prisma.service';

export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getHeatmap() {
    const db = tenantContext.getStore()!.db;
    return db.$queryRaw<Array<{ lat: number; lon: number; transactions: number; frauds: number; risk: number | null }>>`
      SELECT ROUND("latitude"::numeric, 2)::float8 AS lat, ROUND("longitude"::numeric, 2)::float8 AS lon,
        COUNT(*)::integer AS transactions,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "TransactionReview" r
          WHERE r."transactionId" = t.id AND r."tenantId" = t."tenantId" AND r.outcome = 'fraud'
          AND r.id = (SELECT r2.id FROM "TransactionReview" r2 WHERE r2."transactionId" = t.id ORDER BY r2."createdAt" DESC, r2.id DESC LIMIT 1)))::integer AS frauds,
        AVG("riskScore") / 100 AS risk
      FROM "Transaction" t WHERE "tenantId" = ${currentTenant()}::uuid
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY 1, 2 ORDER BY transactions DESC LIMIT 1000`;
  }

  async getMetrics() {
    const [day] = await tenantContext.getStore()!.db.$queryRaw<Array<{ start: Date }>>`
      SELECT date_trunc('day', NOW() AT TIME ZONE timezone) AT TIME ZONE timezone AS start
      FROM "ThresholdConfig" WHERE "tenantId" = ${currentTenant()}::uuid`;
    const startOfDay = day?.start ?? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const where = { tenantId: currentTenant(), timestamp: { gte: startOfDay } };

    const [transactionsToday, highCriticalCount, blockedCount, avg] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.count({ where: { ...where, riskLevel: { in: ['alto', 'critico'] } } }),
      this.prisma.transaction.count({ where: { ...where, decision: 'bloquear' } }),
      this.prisma.transaction.aggregate({ where: { ...where, riskScore: { not: null } }, _avg: { riskScore: true } }),
    ]);

    const pct = (count: number) => (transactionsToday === 0 ? 0 : Math.round((count / transactionsToday) * 1000) / 10);

    return {
      transactions_today: transactionsToday,
      high_critical_count: highCriticalCount,
      high_critical_pct: pct(highCriticalCount),
      blocked_count: blockedCount,
      blocked_pct: pct(blockedCount),
      avg_risk_score: avg._avg.riskScore !== null ? Math.round(avg._avg.riskScore * 10) / 10 : null,
    };
  }
}
