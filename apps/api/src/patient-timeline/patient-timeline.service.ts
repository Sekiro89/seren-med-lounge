import { Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalRecordStatus } from '@prisma/client';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';

export type TimelineKind =
  | 'appointment'
  | 'visit'
  | 'vitals'
  | 'note'
  | 'diagnosis'
  | 'prescription'
  | 'lab_order'
  | 'lab_result'
  | 'procedure'
  | 'referral'
  | 'dispensing'
  | 'invoice'
  | 'payment'
  | 'follow_up'
  | 'document'
  | 'consent'
  | 'history';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  /** One line of detail, never free clinical text beyond what the record itself shows. */
  detail?: string;
  status?: string;
  /** Where the full record lives, for the staff app to link to. */
  entityType: string;
  entityId: string;
  encounterId?: string | null;
  /** For visits: the appointment they belong to, so a patient can open that visit's page. */
  appointmentId?: string | null;
  /** A code shown small beside the detail (ICD for diagnoses). */
  code?: string | null;
}

/**
 * One chronological view of everything that has happened to a patient
 * (the "clinical timeline" of the unified patient record). Read-only and
 * assembled on request from the source tables, so it can never drift from
 * them. The patient-facing variant leaves out drafts and staff-only rows
 * (consents, documents, referrals' internal notes).
 */
@Injectable()
export class PatientTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async forStaff(organizationId: string, patientId: string): Promise<TimelineEntry[]> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await this.requirePatient(tx, patientId);
      return this.build(tx, patientId, { staff: true });
    });
  }

  async forPatient(organizationId: string, patientId: string): Promise<TimelineEntry[]> {
    return this.prisma.withTenant(organizationId, (tx) =>
      this.build(tx, patientId, { staff: false }),
    );
  }

  private async requirePatient(tx: ExtendedPrismaClient, patientId: string) {
    const patient = await tx.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.deletedAt) {
      throw new NotFoundException('Patient not found.');
    }
  }

  private async build(
    tx: ExtendedPrismaClient,
    patientId: string,
    opts: { staff: boolean },
  ): Promise<TimelineEntry[]> {
    const signed = { in: [ClinicalRecordStatus.FINALIZED, ClinicalRecordStatus.AMENDED] };
    const where = { patientId };

    const [
      appointments,
      encounters,
      vitals,
      notes,
      diagnoses,
      prescriptions,
      labOrders,
      procedures,
      referrals,
      dispensings,
      invoices,
      followUps,
      documents,
      consents,
      history,
    ] = await Promise.all([
      tx.appointment.findMany({
        where,
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          entrySource: true,
          doctor: { select: { fullName: true } },
        },
      }),
      tx.encounter.findMany({
        where,
        select: { id: true, status: true, startedAt: true, endedAt: true, appointmentId: true },
      }),
      tx.vital.findMany({
        where,
        select: {
          id: true,
          encounterId: true,
          recordedAt: true,
          bloodPressureSystolic: true,
          bloodPressureDiastolic: true,
          pulseBpm: true,
          spo2Percent: true,
          temperatureCelsius: true,
          weightKg: true,
        },
      }),
      tx.clinicalNote.findMany({
        where: opts.staff ? where : { ...where, status: signed },
        select: {
          id: true,
          encounterId: true,
          noteType: true,
          status: true,
          createdAt: true,
          currentVersionNumber: true,
        },
      }),
      tx.diagnosis.findMany({
        where: opts.staff ? where : { ...where, status: signed },
        select: {
          id: true,
          encounterId: true,
          status: true,
          createdAt: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { icdCode: true, description: true },
          },
        },
      }),
      tx.prescription.findMany({
        where,
        select: {
          id: true,
          encounterId: true,
          status: true,
          createdAt: true,
          items: { select: { medicationName: true } },
        },
      }),
      tx.labOrder.findMany({
        where,
        select: {
          id: true,
          encounterId: true,
          status: true,
          createdAt: true,
          items: {
            select: {
              testName: true,
              results: { select: { id: true, resultValue: true, unit: true, createdAt: true } },
            },
          },
        },
      }),
      tx.procedure.findMany({
        where,
        select: {
          id: true,
          encounterId: true,
          kind: true,
          name: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
        },
      }),
      opts.staff
        ? tx.referral.findMany({
            where,
            select: {
              id: true,
              encounterId: true,
              type: true,
              status: true,
              createdAt: true,
              toUser: { select: { fullName: true } },
              toName: true,
            },
          })
        : Promise.resolve([]),
      tx.dispensing.findMany({
        where,
        select: {
          id: true,
          status: true,
          mode: true,
          quantity: true,
          createdAt: true,
          medication: { select: { name: true, strength: true } },
        },
      }),
      tx.invoice.findMany({
        where,
        select: {
          id: true,
          encounterId: true,
          number: true,
          status: true,
          totalMinor: true,
          createdAt: true,
          payments: {
            select: { id: true, amountMinor: true, method: true, createdAt: true },
          },
        },
      }),
      tx.followUp.findMany({
        where,
        select: { id: true, type: true, status: true, dueAt: true, createdAt: true },
      }),
      opts.staff
        ? tx.patientDocument.findMany({
            where,
            select: { id: true, documentType: true, fileName: true, createdAt: true },
          })
        : Promise.resolve([]),
      opts.staff
        ? tx.patientConsent.findMany({
            where,
            select: { id: true, consentType: true, action: true, createdAt: true },
          })
        : Promise.resolve([]),
      tx.medicalHistoryEntry.findMany({
        where: { ...where, status: { not: 'ENTERED_IN_ERROR' } },
        select: { id: true, category: true, description: true, status: true, createdAt: true },
      }),
    ]);

    const entries: TimelineEntry[] = [];
    const push = (e: Omit<TimelineEntry, 'at'> & { at: Date }) =>
      entries.push({ ...e, at: e.at.toISOString() });

    for (const a of appointments) {
      push({
        id: `appointment:${a.id}`,
        kind: 'appointment',
        at: a.scheduledAt,
        title: a.entrySource === 'VIDEO_CONSULTATION' ? 'Video consultation' : 'Appointment',
        detail: a.doctor ? `With ${a.doctor.fullName}` : undefined,
        status: a.status,
        entityType: 'Appointment',
        entityId: a.id,
      });
    }
    for (const e of encounters) {
      push({
        id: `visit:${e.id}`,
        kind: 'visit',
        at: e.startedAt,
        title: 'Visit',
        detail: e.endedAt ? 'Discharged' : undefined,
        status: e.status,
        entityType: 'Encounter',
        entityId: e.id,
        encounterId: e.id,
        appointmentId: e.appointmentId,
      });
    }
    for (const v of vitals) {
      const parts: string[] = [];
      if (v.bloodPressureSystolic && v.bloodPressureDiastolic) {
        parts.push(`BP ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}`);
      }
      if (v.pulseBpm) parts.push(`Pulse ${v.pulseBpm}`);
      if (v.spo2Percent) parts.push(`SpO2 ${v.spo2Percent}%`);
      if (v.temperatureCelsius) parts.push(`${v.temperatureCelsius}°C`);
      if (v.weightKg) parts.push(`${v.weightKg} kg`);
      push({
        id: `vitals:${v.id}`,
        kind: 'vitals',
        at: v.recordedAt,
        title: 'Vitals recorded',
        detail: parts.join(' · ') || undefined,
        entityType: 'Vital',
        entityId: v.id,
        encounterId: v.encounterId,
      });
    }
    for (const n of notes) {
      push({
        id: `note:${n.id}`,
        kind: 'note',
        at: n.createdAt,
        title: NOTE_TITLES[n.noteType] ?? 'Clinical note',
        detail: n.currentVersionNumber > 1 ? `Version ${n.currentVersionNumber}` : undefined,
        status: n.status,
        entityType: 'ClinicalNote',
        entityId: n.id,
        encounterId: n.encounterId,
      });
    }
    for (const d of diagnoses) {
      const v = d.versions[0];
      push({
        id: `diagnosis:${d.id}`,
        kind: 'diagnosis',
        at: d.createdAt,
        title: 'Diagnosis',
        detail: v?.description,
        code: v?.icdCode,
        status: d.status,
        entityType: 'Diagnosis',
        entityId: d.id,
        encounterId: d.encounterId,
      });
    }
    for (const p of prescriptions) {
      push({
        id: `prescription:${p.id}`,
        kind: 'prescription',
        at: p.createdAt,
        title: 'Prescription',
        detail: p.items.map((i) => i.medicationName).join(', ') || undefined,
        status: p.status,
        entityType: 'Prescription',
        entityId: p.id,
        encounterId: p.encounterId,
      });
    }
    for (const o of labOrders) {
      push({
        id: `lab_order:${o.id}`,
        kind: 'lab_order',
        at: o.createdAt,
        title: 'Tests ordered',
        detail: o.items.map((i) => i.testName).join(', ') || undefined,
        status: o.status,
        entityType: 'LabOrder',
        entityId: o.id,
        encounterId: o.encounterId,
      });
      for (const item of o.items) {
        for (const r of item.results) {
          push({
            id: `lab_result:${r.id}`,
            kind: 'lab_result',
            at: r.createdAt,
            title: `Result: ${item.testName}`,
            detail: `${r.resultValue}${r.unit ? ` ${r.unit}` : ''}`,
            entityType: 'LabOrder',
            entityId: o.id,
            encounterId: o.encounterId,
          });
        }
      }
    }
    for (const p of procedures) {
      push({
        id: `procedure:${p.id}`,
        kind: 'procedure',
        at: p.scheduledAt ?? p.createdAt,
        title: p.kind === 'SURGERY' ? 'Surgery' : 'Procedure',
        detail: p.name,
        status: p.status,
        entityType: 'Procedure',
        entityId: p.id,
        encounterId: p.encounterId,
      });
    }
    for (const r of referrals) {
      push({
        id: `referral:${r.id}`,
        kind: 'referral',
        at: r.createdAt,
        title: 'Referral',
        detail: r.toUser?.fullName ?? r.toName ?? undefined,
        status: r.status,
        entityType: 'Referral',
        entityId: r.id,
        encounterId: r.encounterId,
      });
    }
    for (const d of dispensings) {
      push({
        id: `dispensing:${d.id}`,
        kind: 'dispensing',
        at: d.createdAt,
        title: d.mode === 'HOME_DELIVERY' ? 'Medicines sent for delivery' : 'Medicines dispensed',
        detail: `${d.medication.name} ${d.medication.strength ?? ''} × ${d.quantity}`.trim(),
        status: d.status,
        entityType: 'Dispensing',
        entityId: d.id,
      });
    }
    for (const i of invoices) {
      push({
        id: `invoice:${i.id}`,
        kind: 'invoice',
        at: i.createdAt,
        title: `Bill #${i.number}`,
        detail: `₹${(i.totalMinor / 100).toLocaleString('en-IN')}`,
        status: i.status,
        entityType: 'Invoice',
        entityId: i.id,
        encounterId: i.encounterId,
      });
      for (const p of i.payments) {
        push({
          id: `payment:${p.id}`,
          kind: 'payment',
          at: p.createdAt,
          title: 'Payment received',
          detail: `₹${(p.amountMinor / 100).toLocaleString('en-IN')} by ${p.method.toLowerCase()}`,
          entityType: 'Invoice',
          entityId: i.id,
        });
      }
    }
    for (const f of followUps) {
      push({
        id: `follow_up:${f.id}`,
        kind: 'follow_up',
        at: f.dueAt,
        title: 'Follow-up',
        detail: FOLLOW_UP_TITLES[f.type] ?? 'Follow-up',
        status: f.status,
        entityType: 'FollowUp',
        entityId: f.id,
      });
    }
    for (const d of documents) {
      push({
        id: `document:${d.id}`,
        kind: 'document',
        at: d.createdAt,
        title: 'Document added',
        detail: `${d.documentType.toLowerCase().replace(/_/g, ' ')}: ${d.fileName}`,
        entityType: 'PatientDocument',
        entityId: d.id,
      });
    }
    for (const c of consents) {
      push({
        id: `consent:${c.id}`,
        kind: 'consent',
        at: c.createdAt,
        title: c.action === 'GRANTED' ? 'Consent given' : 'Consent withdrawn',
        detail: c.consentType.toLowerCase().replace(/_/g, ' '),
        entityType: 'PatientConsent',
        entityId: c.id,
      });
    }
    for (const h of history) {
      push({
        id: `history:${h.id}`,
        kind: 'history',
        at: h.createdAt,
        title: h.category === 'ALLERGY' ? 'Allergy recorded' : 'History recorded',
        detail: h.description,
        status: h.status,
        entityType: 'MedicalHistoryEntry',
        entityId: h.id,
      });
    }

    return entries.sort((a, b) => b.at.localeCompare(a.at));
  }
}

const NOTE_TITLES: Record<string, string> = {
  CONSULTATION: 'Consultation note',
  PROGRESS: 'Progress note',
  OPERATIVE: 'Operation note',
  DISCHARGE_SUMMARY: 'Discharge summary',
};

const FOLLOW_UP_TITLES: Record<string, string> = {
  REVIEW_APPOINTMENT: 'Review visit',
  MEDICATION_REMINDER: 'Medicine check',
  RECOVERY_CHECK: 'Recovery check-in',
  REPORT_ALERT: 'Report check',
  OTHER: 'Follow-up',
};
