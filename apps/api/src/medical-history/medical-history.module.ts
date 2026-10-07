import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MedicalHistoryController } from './medical-history.controller';
import { MedicalHistoryService } from './medical-history.service';

@Module({
  imports: [AuditModule],
  controllers: [MedicalHistoryController],
  providers: [MedicalHistoryService],
  exports: [MedicalHistoryService],
})
export class MedicalHistoryModule {}
