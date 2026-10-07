import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { FollowupsController } from './followups.controller';
import { FollowupsService } from './followups.service';

@Module({
  imports: [AuditModule, AppointmentsModule],
  controllers: [FollowupsController],
  providers: [FollowupsService],
  exports: [FollowupsService],
})
export class FollowupsModule {}
