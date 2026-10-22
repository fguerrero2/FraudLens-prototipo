import { Prisma } from '@prisma/client';
import { Identity, isSuperAdmin, SUPER_ADMIN } from '../common/context/tenant-context';

export interface HistoryEntry {
  action: string;
  resourceType: 'tenant' | 'user' | 'membership' | 'tenant_report';
  resourceId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}
// Append-only history of organizations and users: who did what, when and on which resource.
export function recordHistory(db: Pick<Prisma.TransactionClient, 'platformAuditLog'>, identity: Identity, entry: HistoryEntry) {
  const actorRole = isSuperAdmin(identity) ? SUPER_ADMIN : identity.roleName ?? 'tenant';
  return db.platformAuditLog.create({ data: { ...entry, actor: identity.actor, actorRole, metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue } });
}
