import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const where = { timestamp: { gte: startOfDay } };

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
