import { SetMetadata } from '@nestjs/common';

export type ApiRole = 'client' | 'analyst' | 'admin';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: ApiRole[]) => SetMetadata(ROLES_KEY, roles);
