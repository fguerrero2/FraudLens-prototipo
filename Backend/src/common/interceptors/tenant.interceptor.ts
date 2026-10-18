import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../context/tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const identity = context.switchToHttp().getRequest().identity;
    if (!identity?.tenantId) return next.handle();
    return from(this.prisma.identity.$transaction(async db => {
      await db.$queryRaw`SELECT set_config('app.tenant_id', ${identity.tenantId}, true)`;
      return tenantContext.run({ identity, db }, () => lastValueFrom(next.handle()));
    }, { timeout: 15000 }));
  }
}
