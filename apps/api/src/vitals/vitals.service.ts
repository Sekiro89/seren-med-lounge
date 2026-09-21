import { Injectable, NotFoundException } from '@nestjs/common';
import type { RecordVitalInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class VitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async record(organizationId: string, actorId: string, input: RecordVitalInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }

      const vital = await tx.vital.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId: input.encounterId,
          bloodPressureSystolic: input.bloodPressureSystolic,
          bloodPressureDiastolic: input.bloodPressureDiastolic,
          pulseBpm: input.pulseBpm,
          spo2Percent: input.spo2Percent,
          temperatureCelsius: input.temperatureCelsius,
          bmi: input.bmi,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'vitals.record',
        entityType: 'Vital',
        entityId: vital.id,
        metadata: { encounterId: input.encounterId, patientId: encounter.patientId },
      });

      return vital;
    });
  }
}
