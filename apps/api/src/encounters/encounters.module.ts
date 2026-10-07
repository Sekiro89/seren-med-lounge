import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CarePlansModule } from '../care-plans/care-plans.module';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';

@Module({
  imports: [AuditModule, CarePlansModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
