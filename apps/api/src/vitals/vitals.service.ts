import { Injectable, NotFoundException } from '@nestjs/common';
import type { RecordMetabolicWorkupInput, RecordVitalInput } from '@serenemed/validation';
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
          bmi: input.bmi ?? computeBmi(input.heightCm, input.weightKg),
          respiratoryRate: input.respiratoryRate,
          heightCm: input.heightCm,
          weightKg: input.weightKg,
          recordedById: actorId,
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

  /**
   * The diagram's separate/optional metabolic workup — same nurse desk
   * and permission (vitals:write) as vitals, same mutability.
   */
  async recordMetabolicWorkup(
    organizationId: string,
    actorId: string,
    input: RecordMetabolicWorkupInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }

      const { encounterId, ...readings } = input;
      const workup = await tx.metabolicWorkup.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId,
          recordedById: actorId,
          ...readings,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'metabolic_workup.record',
        entityType: 'MetabolicWorkup',
        entityId: workup.id,
        metadata: { encounterId, patientId: encounter.patientId },
      });

      return workup;
    });
  }
}

/** BMI from height and weight when the nurse records both but not BMI itself. */
function computeBmi(heightCm?: number, weightKg?: number): number | undefined {
  if (!heightCm || !weightKg) return undefined;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}
