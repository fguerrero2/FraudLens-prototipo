import { alertsRoutes } from './alerts/alerts.routes';
import { authRoutes } from './auth/auth.routes';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './common/guards/auth.guard';
import { dashboardRoutes } from './dashboard/dashboard.routes';
import { DashboardService } from './dashboard/dashboard.service';
import { buildOpenApi } from './http/openapi';
import { createRouter, Route } from './http/router';
import { mlRoutes } from './ml/ml.routes';
import { PrismaService } from './prisma/prisma.service';
import { RiskService } from './risk/risk.service';
import { settingsRoutes } from './settings/settings.routes';
import { SettingsService } from './settings/settings.service';
import { tenantsRoutes } from './tenants/tenants.routes';
import { TenantsService } from './tenants/tenants.service';
import { transactionsRoutes } from './transactions/transactions.routes';
import { TransactionsService } from './transactions/transactions.service';
import packageJson from '../package.json';

// Replaces the NestJS module tree: one instance of each service per server process.
export function createApp() {
  const prisma = new PrismaService();
  const auth = new AuthService(prisma);
  const settings = new SettingsService(prisma);
  const routes: Route[] = [
    { method: 'GET', path: '/health', summary: 'Estado del servicio', public: true, handler: () => ({ status: 'ok', timestamp: new Date().toISOString() }) },
    { method: 'GET', path: '/openapi.json', summary: 'Especificación OpenAPI 3 de esta API', public: true, handler: () => openApi() },
    ...authRoutes(auth),
    ...tenantsRoutes(new TenantsService(prisma), prisma),
    ...alertsRoutes(prisma),
    ...mlRoutes(prisma),
    ...settingsRoutes(settings),
    ...transactionsRoutes(new TransactionsService(prisma, new RiskService(), settings)),
    ...dashboardRoutes(new DashboardService(prisma)),
  ];
  let spec: ReturnType<typeof buildOpenApi> | undefined;
  const openApi = () => (spec ??= buildOpenApi(routes, packageJson.version));
  return { routes, openApi, dispatch: createRouter(routes, { guard: new AuthGuard(auth, prisma), prisma }) };
}

// In development Next reloads modules; keeping the app on globalThis avoids opening a new pool on every change.
const store = globalThis as unknown as { fraudlensApp?: ReturnType<typeof createApp> };
const app = (store.fraudlensApp ??= createApp());
export const handleApiRequest = app.dispatch;
export const openApiDocument = app.openApi;
