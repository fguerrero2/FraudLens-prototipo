import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from '../../auth/credentials';
import { Identity } from '../context/tenant-context';

@Injectable()
export class AuthGuard implements CanActivate {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService, private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) {
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
      const tenantPermissions = this.reflector.getAllAndOverride<string[]>('permissions', targets) ?? [];
      identity = await this.auth.authenticate(match[1], tenantPermissions.length === 0);
    }
    const required = this.reflector.getAllAndOverride<string[]>('permissions', targets) ?? [];
    if (required.length && (!identity.tenantId || !required.every(p => identity.permissions.includes(p)))) throw new ForbiddenException('Permisos insuficientes');
    const platform = this.reflector.getAllAndOverride<string[]>('platformRoles', targets);
    if (platform && !platform.some(r => identity.platformRoles.includes(r))) throw new ForbiddenException('Requiere rol de plataforma');
    req.identity = identity;
    req.actor = identity.actor;
    return true;
  }
}
