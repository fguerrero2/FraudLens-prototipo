import { ForbiddenException, HttpException, UnauthorizedException } from '../../http/errors';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from '../../auth/credentials';
import { Identity } from '../context/tenant-context';

// What the guard needs to know about the route; it replaces the @Public/@Permissions/@PlatformRoles decorators.
export interface AccessRule { public?: boolean; permissions?: string[]; platformRoles?: string[] }
export interface GuardRequest { method: string; url: string; ip?: string; headers: Record<string, string | undefined>; identity?: Identity; actor?: string }

export class AuthGuard {
  // In memory per server instance: on Vercel each function instance keeps its own counter.
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}
  async canActivate(rule: AccessRule, req: GuardRequest) {
    if (rule.public) {
      if (req.method === 'POST' && req.url.includes('/auth/')) {
        const key = req.ip ?? 'unknown', now = Date.now();
        for (const [ip, item] of this.attempts) if (item.until <= now) this.attempts.delete(ip);
        const entry = this.attempts.get(key) ?? { count: 0, until: now + 60000 };
        if (++entry.count > 20) throw new HttpException('Demasiados intentos; reintente en un minuto', 429);
        this.attempts.set(key, entry);
      }
      return true;
    }
    let identity: Identity;
    const key = req.headers['x-api-key'];
    if (typeof key === 'string') {
      const credential = await this.prisma.identity.apiCredential.findUnique({ where: { secretHash: hashToken(key) } });
      if (!credential) throw new UnauthorizedException('Credencial API inválida');
      const client = await this.prisma.identity.$transaction(async db => {
        await db.$queryRaw`SELECT set_config('app.tenant_id', ${credential.tenantId}, true)`;
        const client = await db.apiClient.findUnique({ where: { id: credential.clientId }, include: { tenant: true } });
        if (client?.status === 'active') await db.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
        return client;
      });
      if (!client || client.status !== 'active' || client.tenant.status !== 'active') throw new UnauthorizedException('Credencial API inválida');
      identity = { apiClientId: client.id, tenantId: client.tenantId, actor: `api:${client.id}`, permissions: client.permissions, platformRoles: [] };
      // Human identity/session routes cannot be consumed by API clients.
      if (req.url.includes('/auth/')) throw new ForbiddenException('Requiere usuario humano');
    } else {
      const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? '');
      if (!match) throw new UnauthorizedException('Falta autenticación Bearer');
      identity = await this.auth.authenticate(match[1], (rule.permissions ?? []).length === 0);
    }
    const required = rule.permissions ?? [];
    if (required.length && (!identity.tenantId || !required.every(p => identity.permissions.includes(p)))) throw new ForbiddenException('Permisos insuficientes');
    const platform = rule.platformRoles;
    if (platform && !platform.some(r => identity.platformRoles.includes(r))) throw new ForbiddenException('Requiere rol de plataforma');
    req.identity = identity;
    req.actor = identity.actor;
    return true;
  }
}
