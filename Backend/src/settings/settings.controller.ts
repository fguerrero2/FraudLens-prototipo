import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../common/decorators/permissions.decorator';
import { UpdateThresholdsDto } from './dto/update-thresholds.dto';
import { SettingsService } from './settings.service';

@Controller('settings/thresholds')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // CU-04 / CU-07: umbrales vigentes, consultables por analistas y administradores.
  @Get()
  @Permissions('settings.read')
  getThresholds() {
    return this.settingsService.getThresholds();
  }

  // CU-07: solo un administrador puede modificar los umbrales.
  @Put()
  @Permissions('settings.update')
  update(@Body() dto: UpdateThresholdsDto, @Req() request: Request & { actor?: string }) {
    return this.settingsService.updateThresholds(dto, request.actor || 'admin');
  }

  @Get('history')
  @Permissions('audit.read')
  getHistory() {
    return this.settingsService.getHistory();
  }

  @Get('audit')
  @Permissions('audit.read')
  getAudit() {
    return this.settingsService.getAudit();
  }
}
