import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EncountersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The consultation view: an encounter with its vitals, clinical notes
   * (each note's latest version only — full history is on
   * GET /clinical-notes/:id, not repeated here), diagnoses (same latest-
   * version-only shape), prescriptions (with their immutable items), and
   * lab orders (with their items and any recorded results). Extended
   * from vitals/clinical-notes-only to this full set when the staff-web
   * doctor workspace needed it — see docs/workflows/clinic-journey.md,
   * "patient timeline, previous reports."
   */
  async getDetail(organizationId: string, encounterId: string) {
    const encounter = await this.prisma.withTenant(organizationId, (tx) =>
      tx.encounter.findUnique({
        where: { id: encounterId },
        include: {
          vitals: { orderBy: { recordedAt: 'desc' } },
          clinicalNotes: {
            include: {
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
              },
            },
          },
          diagnoses: {
            include: {
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
              },
            },
          },
          prescriptions: {
            include: { items: true },
            orderBy: { createdAt: 'desc' },
          },
          labOrders: {
            include: { items: { include: { results: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    );
    if (!encounter) {
      throw new NotFoundException('Encounter not found.');
    }
    return encounter;
  }
}
