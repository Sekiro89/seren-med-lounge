import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PatientBookingController } from './patient-booking.controller';
import { PatientBookingService } from './patient-booking.service';

@Module({
  imports: [AuditModule, NotificationsModule, SchedulingModule, IntegrationsModule],
  controllers: [PatientBookingController],
  providers: [PatientBookingService],
})
export class PatientBookingModule {}
