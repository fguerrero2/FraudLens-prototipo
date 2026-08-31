import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiRole, ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Autenticacion placeholder para el MVP: una API key fija por rol
 * (cliente / analista / administrador), enviada en el header x-api-key.
 * La API key de administrador actua como superusuario para cualquier ruta protegida.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<ApiRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];

    if (requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Falta el header x-api-key');
    }

    const adminKey = this.configService.get<string>('ADMIN_API_KEY');
    if (adminKey && apiKey === adminKey) {
      request.actor = 'admin';
      return true;
    }

    const keyByRole: Record<ApiRole, string | undefined> = {
      client: this.configService.get<string>('CLIENT_API_KEY'),
      analyst: this.configService.get<string>('ANALYST_API_KEY'),
      admin: adminKey,
    };

    const matchedRole = requiredRoles.find((role) => keyByRole[role] && apiKey === keyByRole[role]);

    if (!matchedRole) {
      throw new UnauthorizedException('API key invalida para este recurso');
    }

    request.actor = matchedRole;
    return true;
  }
}
