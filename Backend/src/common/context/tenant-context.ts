import { AsyncLocalStorage } from 'node:async_hooks';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface Identity {
  userId?: string;
  apiClientId?: string;
  sessionId?: string;
  tenantId?: string;
  roleName?: string;
  permissions: string[];
  platformRoles: string[];
  actor: string;
}
export const tenantContext = new AsyncLocalStorage<{ identity: Identity; db: Prisma.TransactionClient }>();
export function currentTenant(): string {
  const tenantId = tenantContext.getStore()?.identity.tenantId;
  if (!tenantId) throw new UnauthorizedException('Seleccione una organización');
  return tenantId;
}
export const SUPER_ADMIN = 'SUPER_ADMIN';
export const TENANT_ADMIN = 'TENANT_ADMIN';
export const isSuperAdmin = (identity: Pick<Identity, 'platformRoles'>) => identity.platformRoles.includes(SUPER_ADMIN);
