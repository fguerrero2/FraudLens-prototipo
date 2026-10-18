import { SetMetadata } from '@nestjs/common';
export const Permissions = (...permissions: string[]) => SetMetadata('permissions', permissions);
export const Public = () => SetMetadata('public', true);
export const PlatformRoles = (...roles: string[]) => SetMetadata('platformRoles', roles);
