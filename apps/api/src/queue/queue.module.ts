import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [AuditModule],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
