export const ROLE_PERMISSIONS: Record<string, string[]> = {
  TENANT_ADMIN: ['tenant.read', 'tenant.update', 'users.read', 'users.create', 'users.update', 'users.disable', 'roles.read', 'roles.create', 'roles.update', 'transactions.read', 'transactions.create', 'transactions.review', 'dashboard.read', 'settings.read', 'settings.update', 'api_clients.read', 'api_clients.create', 'api_clients.revoke', 'alerts.read', 'alerts.update', 'audit.read'],
  FRAUD_ANALYST: ['tenant.read', 'transactions.read', 'transactions.review', 'dashboard.read', 'settings.read', 'alerts.read', 'alerts.update'],
  OPERATOR: ['tenant.read', 'transactions.read', 'transactions.create', 'dashboard.read'],
  VIEWER: ['tenant.read', 'transactions.read', 'dashboard.read'],
  API_MANAGER: ['tenant.read', 'api_clients.read', 'api_clients.create', 'api_clients.revoke'],
};
