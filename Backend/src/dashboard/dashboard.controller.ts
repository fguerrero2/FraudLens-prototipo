import { Controller, Get } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('heatmap')
  @Permissions('dashboard.read')
  heatmap() { return this.dashboardService.getHeatmap(); }

  @Get('metrics')
  @Permissions('dashboard.read')
  getMetrics() {
    return this.dashboardService.getMetrics();
  }
}
