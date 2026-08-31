import { Body, Controller, Get, Headers, Put } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateThresholdsDto } from './dto/update-thresholds.dto';
import { SettingsService } from './settings.service';

@Controller('settings/thresholds')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // CU-04 / CU-07: umbrales vigentes, consultables por analistas y administradores.
  @Get()
  @Roles('analyst')
  getThresholds() {
    return this.settingsService.getThresholds();
  }

  // CU-07: solo un administrador puede modificar los umbrales.
  @Put()
  @Roles('admin')
  update(@Body() dto: UpdateThresholdsDto, @Headers('x-actor-name') actorName?: string) {
    return this.settingsService.updateThresholds(dto, actorName || 'admin');
  }

  @Get('history')
  @Roles('admin')
  getHistory() {
    return this.settingsService.getHistory();
  }
}
