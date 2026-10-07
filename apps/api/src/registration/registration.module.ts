import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { QueueModule } from '../queue/queue.module';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [AuditModule, QueueModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
