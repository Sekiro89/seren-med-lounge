import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  ClinicalRecordStatus,
  FollowUpStatus,
  InvoiceStatus,
  LeadStatus,
  QueueStation,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateString, clinicDayRange } from '../common/clinic-time';

export interface ReportRange {
  /** Clinic-local YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}

/**
 * The clinic's numbers for a date range, computed live from the source
 * tables (nothing is pre-aggregated, so a report can't disagree with the
 * desks). Administrators only (`report:read`). Everything is a count or a
 * sum; no patient is named.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(organizationId: string, range: ReportRange) {
    const from = clinicDayRange(range.from).from;
    const to = clinicDayRange(range.to).to;
    const between = { gte: from, lt: to };
    const soon = new Date(Date.now() + 30 * 86_400_000);

    return this.prisma.withTenant(organizationId, async (tx) => {
      const [
        appointmentsByStatus,
        appointmentsBySource,
        newPatients,
        invoiced,
        collected,
        refunded,
        outstanding,
        queue,
        topDiagnoses,
        leadsNew,
        leadsConverted,
        followUpsOverdue,
        expiringBatches,
        perDayAppointments,
        perDayPayments,
      ] = await Promise.all([
        tx.appointment.groupBy({
          by: ['status'],
          where: { scheduledAt: between, deletedAt: null },
          _count: { _all: true },
        }),
        tx.appointment.groupBy({
          by: ['entrySource'],
          where: { scheduledAt: between, deletedAt: null },
          _count: { _all: true },
        }),
        tx.patient.count({ where: { createdAt: between, deletedAt: null } }),
        tx.invoice.aggregate({
          where: { createdAt: between, status: { not: InvoiceStatus.VOID } },
          _sum: { totalMinor: true },
          _count: { _all: true },
        }),
        tx.payment.aggregate({ where: { createdAt: between }, _sum: { amountMinor: true } }),
        tx.refund.aggregate({ where: { createdAt: between }, _sum: { amountMinor: true } }),
        tx.invoice.findMany({
          where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] } },
          select: { totalMinor: true, paidMinor: true },
        }),
        tx.queueEntry.findMany({
          where: { queueDate: between, calledAt: { not: null } },
          select: { station: true, waitingSince: true, calledAt: true },
        }),
        tx.diagnosisVersion.groupBy({
          by: ['description', 'icdCode'],
          where: { createdAt: between, status: ClinicalRecordStatus.FINALIZED },
          _count: { _all: true },
          orderBy: { _count: { description: 'desc' } },
          take: 8,
        }),
        tx.lead.count({ where: { createdAt: between } }),
        tx.lead.count({ where: { convertedAt: between, status: LeadStatus.CONVERTED } }),
        tx.followUp.count({
          where: { status: FollowUpStatus.PENDING, dueAt: { lt: new Date() } },
        }),
        tx.stockBatch.count({
          where: { expiryDate: { lt: soon }, quantityOnHand: { gt: 0 } },
        }),
        tx.appointment.findMany({
          where: { scheduledAt: between, deletedAt: null },
          select: { scheduledAt: true, status: true },
        }),
        tx.payment.findMany({
          where: { createdAt: between },
          select: { createdAt: true, amountMinor: true },
        }),
      ]);

      const byStatus = Object.fromEntries(
        appointmentsByStatus.map((r) => [r.status, r._count._all]),
      ) as Partial<Record<AppointmentStatus, number>>;
      const totalAppointments = appointmentsByStatus.reduce((s, r) => s + r._count._all, 0);
      const seen =
        (byStatus.COMPLETED ?? 0) + (byStatus.CHECKED_IN ?? 0) + (byStatus.IN_PROGRESS ?? 0);
      const noShows = byStatus.NO_SHOW ?? 0;
      const decided = seen + noShows;

      // Average minutes from reaching a desk to being called, per desk.
      const waits: Partial<Record<QueueStation, { total: number; n: number }>> = {};
      for (const q of queue) {
        const minutes = (q.calledAt!.getTime() - q.waitingSince.getTime()) / 60_000;
        if (minutes < 0 || minutes > 600) continue;
        const slot = (waits[q.station] ??= { total: 0, n: 0 });
        slot.total += minutes;
        slot.n += 1;
      }

      const days = new Map<string, { date: string; visits: number; collectedMinor: number }>();
      const day = (d: Date) => {
        const key = clinicDateString(d);
        let row = days.get(key);
        if (!row) {
          row = { date: key, visits: 0, collectedMinor: 0 };
          days.set(key, row);
        }
        return row;
      };
      for (const a of perDayAppointments) {
        if (a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CHECKED_IN) {
          day(a.scheduledAt).visits += 1;
        }
      }
      for (const p of perDayPayments) day(p.createdAt).collectedMinor += p.amountMinor;

      return {
        range,
        appointments: {
          total: totalAppointments,
          byStatus,
          bySource: Object.fromEntries(
            appointmentsBySource.map((r) => [r.entrySource, r._count._all]),
          ),
          /** Share of decided visits that were no-shows, 0..1. */
          noShowRate: decided > 0 ? noShows / decided : 0,
        },
        patients: { new: newPatients },
        money: {
          invoicedMinor: invoiced._sum.totalMinor ?? 0,
          invoices: invoiced._count._all,
          collectedMinor: collected._sum.amountMinor ?? 0,
          refundedMinor: refunded._sum.amountMinor ?? 0,
          outstandingMinor: outstanding.reduce((s, i) => s + (i.totalMinor - i.paidMinor), 0),
          outstandingInvoices: outstanding.length,
        },
        queue: {
          averageWaitMinutes: Object.fromEntries(
            Object.entries(waits).map(([station, w]) => [station, Math.round(w.total / w.n)]),
          ),
          tokensCalled: queue.length,
        },
        topDiagnoses: topDiagnoses.map((d) => ({
          description: d.description,
          icdCode: d.icdCode,
          count: d._count._all,
        })),
        leads: { new: leadsNew, converted: leadsConverted },
        care: { followUpsOverdue },
        pharmacy: { batchesExpiringIn30Days: expiringBatches },
        perDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
  }
}
