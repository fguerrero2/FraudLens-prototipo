import { Route } from '../http/router';
import { UpdateThresholdsDto } from './dto/update-thresholds.dto';
import { SettingsService } from './settings.service';

export const settingsRoutes = (settings: SettingsService): Route[] => [
  // CU-04 / CU-07: umbrales vigentes, consultables por analistas y administradores.
  { method: 'GET', path: '/settings/thresholds', summary: 'Ver umbrales de revisión y bloqueo', permissions: ['settings.read'], handler: () => settings.getThresholds() },
  // CU-07: solo un administrador puede modificar los umbrales.
  { method: 'PUT', path: '/settings/thresholds', summary: 'Modificar umbrales (CU-07)', permissions: ['settings.update'], body: UpdateThresholdsDto, handler: ({ body, actor }) => settings.updateThresholds(body, actor || 'admin') },
  { method: 'GET', path: '/settings/thresholds/history', summary: 'Historial de cambios de umbrales', permissions: ['audit.read'], handler: () => settings.getHistory() },
  { method: 'GET', path: '/settings/thresholds/audit', summary: 'Auditoría de la organización', permissions: ['audit.read'], handler: () => settings.getAudit() },
];
