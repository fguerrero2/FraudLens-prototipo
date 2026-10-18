import { Module } from '@nestjs/common';
import { MlController } from './ml.controller';
@Module({ controllers: [MlController] })
export class MlModule {}
