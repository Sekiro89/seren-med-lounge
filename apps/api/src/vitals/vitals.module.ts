import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { VitalsController } from './vitals.controller';
import { VitalsService } from './vitals.service';

@Module({
  imports: [AuditModule],
  controllers: [VitalsController],
  providers: [VitalsService],
  exports: [VitalsService],
})
export class VitalsModule {}
