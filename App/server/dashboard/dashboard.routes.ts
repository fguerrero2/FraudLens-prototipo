import { Route } from '../http/router';
import { DashboardService } from './dashboard.service';

export const dashboardRoutes = (dashboard: DashboardService): Route[] => [
  { method: 'GET', path: '/dashboard/heatmap', summary: 'Mapa de calor de riesgo (últimos 30 días, celdas agregadas)', permissions: ['dashboard.read'], handler: () => dashboard.getHeatmap() },
  { method: 'GET', path: '/dashboard/metrics', summary: 'Métricas del día en la zona horaria de la organización', permissions: ['dashboard.read'], handler: () => dashboard.getMetrics() },
];
