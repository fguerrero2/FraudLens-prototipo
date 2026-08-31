import { Module } from '@nestjs/common';
import { RiskModule } from '../risk/risk.module';
import { SettingsModule } from '../settings/settings.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [RiskModule, SettingsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
