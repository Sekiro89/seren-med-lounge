import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicHoursController } from './clinic-hours.controller';
import { ClinicHoursService } from './clinic-hours.service';

@Module({
  imports: [AuditModule],
  controllers: [ClinicHoursController],
  providers: [ClinicHoursService],
})
export class ClinicHoursModule {}
