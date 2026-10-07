import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntegrationSettingsController } from './integration-settings.controller';
import { IntegrationSettingsService } from './integration-settings.service';

@Module({
  imports: [AuditModule],
  controllers: [IntegrationSettingsController],
  providers: [IntegrationSettingsService],
  exports: [IntegrationSettingsService],
})
export class IntegrationSettingsModule {}
