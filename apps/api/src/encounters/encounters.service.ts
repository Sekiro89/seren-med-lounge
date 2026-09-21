import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EncountersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The consultation view: an encounter with its vitals and clinical
   * notes (each note's latest version only — full history is on
   * GET /clinical-notes/:id, not repeated here). See
   * docs/workflows/clinic-journey.md — "patient timeline, previous
   * reports" is what a doctor consultation screen needs.
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
        },
      }),
    );
    if (!encounter) {
      throw new NotFoundException('Encounter not found.');
    }
    return encounter;
  }
}
