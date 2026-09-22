import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LabsController } from './labs.controller';
import { LabsService } from './labs.service';

@Module({
  imports: [AuditModule],
  controllers: [LabsController],
  providers: [LabsService],
  exports: [LabsService],
})
export class LabsModule {}
