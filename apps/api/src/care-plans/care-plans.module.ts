import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FollowupsModule } from '../followups/followups.module';
import { CarePlansController } from './care-plans.controller';
import { CarePlansService } from './care-plans.service';

@Module({
  imports: [AuditModule, FollowupsModule],
  controllers: [CarePlansController],
  providers: [CarePlansService],
  exports: [CarePlansService],
})
export class CarePlansModule {}
