import { Prisma, PrismaClient } from '@prisma/client';
import { currentTenant, tenantContext } from '../common/context/tenant-context';

export class PrismaService {
  // Identity tables are intentionally global; business delegates require verified tenant context.
  readonly identity = new PrismaClient();
  private ready?: Promise<void>;
  private get db() { currentTenant(); return tenantContext.getStore()!.db; }
  get transaction() { return this.db.transaction; }
  get transactionReview() { return this.db.transactionReview; }
  get fraudCase() { return this.db.fraudCase; }
  get thresholdConfig() { return this.db.thresholdConfig; }
  get thresholdConfigHistory() { return this.db.thresholdConfigHistory; }
  get auditLog() { return this.db.auditLog; }
  get alert() { return this.db.alert; }
  get tenantModel() { return this.db.tenantModel; }
  get apiClient() { return this.db.apiClient; }
  async $transaction<T extends readonly Prisma.PrismaPromise<any>[]>(queries: [...T]): Promise<{ [K in keyof T]: Awaited<T[K]> }> { return Promise.all(queries) as any; }
  // Runs once per server instance (Docker process or Vercel function), before the first request.
  init() {
    this.ready ??= this.checkRuntimeRole().catch(error => { this.ready = undefined; throw error; });
    return this.ready;
  }
  private async checkRuntimeRole() {
    if (process.env.NODE_ENV !== 'production') return;
    const [role] = await this.identity.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    if (role.rolsuper || role.rolbypassrls) throw new Error('DATABASE_URL debe usar un rol sin SUPERUSER ni BYPASSRLS; DIRECT_URL queda reservado a migraciones');
  }
}
