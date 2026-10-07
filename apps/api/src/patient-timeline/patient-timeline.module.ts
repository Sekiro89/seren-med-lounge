import { Module } from '@nestjs/common';
import { PatientTimelineController } from './patient-timeline.controller';
import { PatientTimelineService } from './patient-timeline.service';

/** The unified patient record's clinical timeline: read-only, assembled from the source tables. */
@Module({
  controllers: [PatientTimelineController],
  providers: [PatientTimelineService],
  exports: [PatientTimelineService],
})
export class PatientTimelineModule {}
