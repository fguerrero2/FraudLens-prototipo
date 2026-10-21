import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, hashToken, token, verifyPassword } from './credentials';
import { Identity, SUPER_ADMIN, TENANT_ADMIN } from '../common/context/tenant-context';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}
  private qrChallenges = new Map<string, { status: 'PENDING' | 'APPROVED' | 'EXPIRED'; userId?: string; tenantId?: string | null; tokens?: any; expiresAt: number }>();

  async createQrChallenge() {
    const challengeId = token();
    const expiresAt = Date.now() + 2 * 60 * 1000; // 2 minutos
    this.qrChallenges.set(challengeId, { status: 'PENDING', expiresAt });
    return {
      challenge_id: challengeId,
      qr_code_url: `fraudlens://qr-login?challenge_id=${challengeId}`,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  async authorizeQrChallenge(identity: Identity, challengeId: string) {
    const challenge = this.qrChallenges.get(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Desafío QR inválido o expirado');
    }
    const issueResult = await this.issue(identity.userId!, identity.tenantId ?? null);
    const profileResult = await this.profile(identity.userId!, identity.tenantId ?? null);
    const tokens = { ...issueResult, ...profileResult };

    challenge.status = 'APPROVED';
    challenge.userId = identity.userId;
    challenge.tenantId = identity.tenantId;
    challenge.tokens = tokens;

    await this.prisma.identity.authEvent.create({
      data: { action: 'qr_login.authorized', userId: identity.userId },
    });

    return { ok: true, message: 'Desafío QR autorizado correctamente' };
  }

  async getQrChallengeStatus(challengeId: string) {
    const challenge = this.qrChallenges.get(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      return { status: 'EXPIRED' };
    }
    if (challenge.status === 'APPROVED') {
      const result = challenge.tokens;
      this.qrChallenges.delete(challengeId); // Consumir desafío
      return { status: 'APPROVED', ...result };
    }
    return { status: 'PENDING' };
  }

  async login(email: string, password: string) {
    const db = this.prisma.identity;
    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { platformRoles: true, memberships: { where: { status: 'active', tenant: { status: 'active' } } } } });
    // Do comparable password work even when the email is unknown.
    const valid = verifyPassword(password, user?.passwordHash ?? hashPassword('invalid-password'));
    if (!user || !valid || user.status !== 'active') {
      await db.authEvent.create({ data: { action: 'login.failed', userId: user?.id } });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await db.authEvent.create({ data: { action: 'login.success', userId: user.id } });
    const tenantId = !user.platformRoles.some(r => r.role === SUPER_ADMIN) && user.memberships.length === 1 ? user.memberships[0].tenantId : null;
    const result = await this.issue(user.id, tenantId);
    return { ...result, ...(await this.profile(user.id, tenantId)) };
  }
  private async issue(userId: string, tenantId: string | null) {
    const access = token(), refresh = token();
    await this.prisma.identity.session.create({ data: { userId, tenantId, tokenHash: hashToken(access), refreshHash: hashToken(refresh), expiresAt: new Date(Date.now() + 15 * 60000), refreshExpiresAt: new Date(Date.now() + 7 * 86400000) } });
    return { access_token: access, refresh_token: refresh, expires_in: 900 };
  }
  async refresh(refresh: string) {
    return this.prisma.identity.$transaction(async db => {
      const session = await db.session.findUnique({ where: { refreshHash: hashToken(refresh) }, include: { user: true } });
      if (!session || session.revokedAt || session.refreshExpiresAt <= new Date() || session.user.status !== 'active') throw new UnauthorizedException('Sesión vencida');
      const access = token(), nextRefresh = token();
      const changed = await db.session.updateMany({ where: { id: session.id, refreshHash: hashToken(refresh), revokedAt: null }, data: { tokenHash: hashToken(access), refreshHash: hashToken(nextRefresh), expiresAt: new Date(Date.now() + 15 * 60000) } });
      if (changed.count !== 1) throw new UnauthorizedException('Refresh ya utilizado');
      return { access_token: access, refresh_token: nextRefresh, expires_in: 900 };
    });
  }
  async authenticate(access: string, allowTenantless = false): Promise<Identity> {
    const session = await this.prisma.identity.session.findUnique({ where: { tokenHash: hashToken(access) }, include: { user: { include: { platformRoles: true } } } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'active') throw new UnauthorizedException('Sesión inválida o vencida');
    let permissions: string[] = [];
    let roleName: string | undefined;
    let tenantId = session.tenantId ?? undefined;
    const platformRoles = session.user.platformRoles.map(r => r.role);
    if (tenantId) {
      try {
        const membership = await this.membership(session.userId, tenantId, platformRoles);
        permissions = membership.role.permissions.map(p => p.permission.code);
        roleName = membership.role.name;
      } catch (error) {
        // Suspension must block business data while still allowing logout or switching to another membership.
        if (!allowTenantless || !(error instanceof UnauthorizedException)) throw error;
        tenantId = undefined;
      }
    }
    return { userId: session.userId, sessionId: session.id, tenantId, roleName, actor: session.user.email, permissions, platformRoles };
  }
  // The platform Administrator has general access: in any active organization it
  // acts with that organization's TENANT_ADMIN permissions, without a membership.
  async membership(userId: string, tenantId: string, platformRoles: string[] = []) {
    if (platformRoles.includes(SUPER_ADMIN)) {
      const role = await this.prisma.identity.role.findUnique({ where: { tenantId_name: { tenantId, name: TENANT_ADMIN } }, include: { tenant: true, permissions: { include: { permission: true } } } });
      if (!role || role.tenant!.status !== 'active') throw new UnauthorizedException('Sin acceso a esta organización');
      return { status: 'active', tenantId, tenant: role.tenant!, role };
    }
    const membership = await this.prisma.identity.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, include: { tenant: true, role: { include: { permissions: { include: { permission: true } } } } } });
    if (!membership || membership.status !== 'active' || membership.tenant.status !== 'active' || (membership.role.tenantId && membership.role.tenantId !== tenantId)) throw new UnauthorizedException('Sin acceso a esta organización');
    return membership;
  }
  async profile(userId: string, tenantId: string | null) {
    const user = await this.prisma.identity.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, platformRoles: true } });
    const platformRoles = user.platformRoles.map(r => r.role);
    // Only organizations the user belongs to, except the Administrator, who sees all of them.
    const tenants = platformRoles.includes(SUPER_ADMIN)
      ? (await this.prisma.identity.tenant.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } })).map(t => ({ id: t.id, name: t.name, role: SUPER_ADMIN }))
      : (await this.prisma.identity.tenantMembership.findMany({ where: { userId, status: 'active', tenant: { status: 'active' } }, include: { tenant: true, role: true } })).map(m => ({ id: m.tenantId, name: m.tenant.name, role: m.role.name }));
    const membership = tenantId ? await this.membership(userId, tenantId, platformRoles) : null;
    const role = platformRoles.includes(SUPER_ADMIN) ? SUPER_ADMIN : membership?.role.name ?? null;
    return { user, role, tenant_id: tenantId, tenants, permissions: membership?.role.permissions.map(p => p.permission.code) ?? [] };
  }
  async selectTenant(identity: Identity, tenantId: string) {
    await this.membership(identity.userId!, tenantId, identity.platformRoles);
    await this.prisma.identity.session.update({ where: { id: identity.sessionId! }, data: { tenantId } });
    return this.profile(identity.userId!, tenantId);
  }
  async logout(identity: Identity) {
    await this.prisma.identity.session.update({ where: { id: identity.sessionId! }, data: { revokedAt: new Date() } });
    await this.prisma.identity.authEvent.create({ data: { action: 'logout', userId: identity.userId } });
    return { ok: true };
  }
}
