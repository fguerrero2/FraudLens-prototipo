import { Route } from '../http/router';
import { AuthService } from './auth.service';
import { AuthorizeQrDto, LoginDto, RefreshDto, SelectTenantDto } from './auth.dto';

export const authRoutes = (auth: AuthService): Route[] => [
  { method: 'POST', path: '/auth/login', summary: 'Iniciar sesión con email y contraseña', public: true, body: LoginDto, handler: ({ body }) => auth.login(body.email, body.password) },
  { method: 'POST', path: '/auth/refresh', summary: 'Renovar el access token (rota el refresh token)', public: true, body: RefreshDto, handler: ({ body }) => auth.refresh(body.refresh_token) },
  { method: 'POST', path: '/auth/qr/challenge', summary: 'Crear un desafío de login por QR (válido 2 minutos)', public: true, handler: () => auth.createQrChallenge() },
  { method: 'POST', path: '/auth/qr/authorize', summary: 'Aprobar un desafío QR desde una sesión ya iniciada', body: AuthorizeQrDto, handler: ({ identity, body }) => auth.authorizeQrChallenge(identity, body.challenge_id) },
  { method: 'GET', path: '/auth/qr/status/:id', summary: 'Consultar un desafío QR; si está aprobado devuelve la sesión una sola vez', public: true, handler: ({ params }) => auth.getQrChallengeStatus(params.id) },
  { method: 'GET', path: '/auth/me', summary: 'Perfil, organizaciones disponibles y permisos de la sesión', handler: ({ identity }) => auth.profile(identity.userId!, identity.tenantId ?? null) },
  { method: 'POST', path: '/auth/tenant', summary: 'Seleccionar la organización activa de la sesión', body: SelectTenantDto, handler: ({ identity, body }) => auth.selectTenant(identity, body.tenant_id) },
  { method: 'POST', path: '/auth/logout', summary: 'Cerrar sesión (revoca access y refresh)', handler: ({ identity }) => auth.logout(identity) },
];
