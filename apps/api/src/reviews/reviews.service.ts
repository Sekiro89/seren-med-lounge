import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EncounterStatus,
  FollowUpStatus,
  PatientConsentAction,
  PatientConsentType,
  Prisma,
  ProcedureStatus,
  ReviewModerationStatus,
  ReviewRequestStatus,
  ReviewStage,
  type Review,
  type ReviewRequest,
} from '@prisma/client';
import type { CreateReviewRequestInput, SubmitReviewInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// TODO(product): how long a patient has to answer a review request.
export const REVIEW_REQUEST_TTL_DAYS = 30;

/** Deliberately generic — never tells the caller *why* the patient can't be asked. */
const NOT_ASKABLE = 'This patient cannot be asked for a review right now.';

const PATIENT_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Consent-based review requests and testimonials.
 *
 * A request is only created when the patient's latest
 * MARKETING_COMMUNICATION consent is GRANTED and the patient has reached
 * the stage (2 closed consultations, a done follow-up, or a completed
 * procedure). One request per patient per stage (per procedure for
 * AFTER_PROCEDURE) — enforced by the dedupeKey unique index.
 *
 * Moderation (approve/reject) judges the content only; the published
 * listing additionally requires the patient's own publishConsent.
 * Review content (rating/comment/video/publishConsent) is never edited
 * after submission and never copied into audit metadata.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------- staff

  async createRequest(organizationId: string, actorId: string, input: CreateReviewRequestInput) {
    const dedupeKey = `${input.stage}:${input.procedureId ?? '-'}`;
    try {
      return await this.prisma.withTenant(organizationId, async (tx) => {
        const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
        if (!patient) {
          throw new NotFoundException('Patient not found.');
        }

        const consent = await tx.patientConsent.findFirst({
          where: {
            patientId: patient.id,
            consentType: PatientConsentType.MARKETING_COMMUNICATION,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (consent?.action !== PatientConsentAction.GRANTED) {
          throw new ConflictException(NOT_ASKABLE);
        }

        await this.assertEligible(tx, patient.id, input);

        const existing = await tx.reviewRequest.findFirst({
          where: { patientId: patient.id, dedupeKey },
        });
        if (existing) {
          throw new ConflictException('A review request for this stage already exists.');
        }

        const request = await tx.reviewRequest.create({
          data: {
            organizationId,
            patientId: patient.id,
            stage: input.stage,
            procedureId: input.procedureId,
            dedupeKey,
            expiresAt: new Date(Date.now() + REVIEW_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000),
            requestedById: actorId,
          },
          include: { patient: PATIENT_SELECT },
        });
        await this.auditRequest(
          tx,
          organizationId,
          'USER',
          actorId,
          'review_request.create',
          request,
        );
        return request;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A review request for this stage already exists.');
      }
      throw error;
    }
  }

  async listRequests(
    organizationId: string,
    filter: { status?: ReviewRequestStatus; patientId?: string },
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.reviewRequest.findMany({
        where: { status: filter.status, patientId: filter.patientId },
        include: { patient: PATIENT_SELECT },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  async cancelRequest(organizationId: string, actorId: string, requestId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const request = await this.lockRequest(tx, requestId);
      if (request.status !== ReviewRequestStatus.REQUESTED) {
        throw new ConflictException(`Not allowed while the request is ${request.status}.`);
      }
      const updated = await tx.reviewRequest.update({
        where: { id: request.id },
        data: { status: ReviewRequestStatus.CANCELLED },
      });
      await this.auditRequest(
        tx,
        organizationId,
        'USER',
        actorId,
        'review_request.cancel',
        request,
        {
          from: request.status,
          to: ReviewRequestStatus.CANCELLED,
        },
      );
      return updated;
    });
  }

  async listReviews(organizationId: string, filter: { moderationStatus?: ReviewModerationStatus }) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.review.findMany({
        where: { moderationStatus: filter.moderationStatus },
        include: { patient: PATIENT_SELECT },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  /**
   * Approved content the patient agreed to publish.
   * TODO(product): a public (unauthenticated) website feed is out of
   * scope — this is a staff route; a public one needs its own decision
   * on what patient identity (if any) is shown.
   */
  async listPublished(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.review.findMany({
        where: { moderationStatus: ReviewModerationStatus.APPROVED, publishConsent: true },
        select: {
          id: true,
          stage: true,
          rating: true,
          comment: true,
          format: true,
          videoStorageKey: true,
          createdAt: true,
          moderatedAt: true,
          patient: { select: { firstName: true } },
        },
        orderBy: { moderatedAt: 'desc' },
        take: 200,
      }),
    );
  }

  async moderate(
    organizationId: string,
    actorId: string,
    reviewId: string,
    to: typeof ReviewModerationStatus.APPROVED | typeof ReviewModerationStatus.REJECTED,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM reviews WHERE id = ${reviewId} FOR UPDATE`;
      const review = await tx.review.findUnique({ where: { id: reviewId } });
      if (!review) {
        throw new NotFoundException('Review not found.');
      }
      if (review.moderationStatus !== ReviewModerationStatus.PENDING) {
        throw new ConflictException(`Review is already ${review.moderationStatus}.`);
      }
      const updated = await tx.review.update({
        where: { id: review.id },
        data: { moderationStatus: to, moderatedById: actorId, moderatedAt: new Date() },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'review.moderate',
        entityType: 'Review',
        entityId: review.id,
        metadata: {
          patientId: review.patientId,
          requestId: review.requestId,
          from: review.moderationStatus,
          to,
        },
      });
      return updated;
    });
  }

  // -------------------------------------------------------------- patient

  async listOpenRequestsForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.reviewRequest.findMany({
        where: {
          patientId,
          status: ReviewRequestStatus.REQUESTED,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          stage: true,
          procedureId: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listReviewsForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.review.findMany({
        where: { patientId },
        select: {
          id: true,
          requestId: true,
          stage: true,
          rating: true,
          comment: true,
          format: true,
          videoStorageKey: true,
          publishConsent: true,
          moderationStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async submit(
    organizationId: string,
    patientId: string,
    requestId: string,
    input: SubmitReviewInput,
  ): Promise<Review> {
    // An expired request is marked EXPIRED in its own committed
    // transaction, then the 409 is thrown outside it (throwing inside
    // would roll the status change back).
    const result = await this.prisma.withTenant(organizationId, async (tx) => {
      const request = await this.lockRequest(tx, requestId);
      if (request.patientId !== patientId) {
        throw new NotFoundException('Review request not found.');
      }
      if (request.status !== ReviewRequestStatus.REQUESTED) {
        throw new ConflictException('This review request is no longer open.');
      }
      if (request.expiresAt <= new Date()) {
        await tx.reviewRequest.update({
          where: { id: request.id },
          data: { status: ReviewRequestStatus.EXPIRED },
        });
        await this.auditRequest(
          tx,
          organizationId,
          'PATIENT',
          patientId,
          'review_request.expire',
          request,
          { from: request.status, to: ReviewRequestStatus.EXPIRED },
        );
        return { expired: true as const };
      }

      const review = await tx.review.create({
        data: {
          organizationId,
          patientId,
          requestId: request.id,
          stage: request.stage,
          rating: input.rating,
          comment: input.comment,
          format: input.format,
          videoStorageKey: input.videoStorageKey,
          publishConsent: input.publishConsent,
        },
      });
      await tx.reviewRequest.update({
        where: { id: request.id },
        data: { status: ReviewRequestStatus.SUBMITTED },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'PATIENT',
        actorId: patientId,
        action: 'review.submit',
        entityType: 'Review',
        entityId: review.id,
        metadata: {
          patientId,
          requestId: request.id,
          stage: request.stage,
          rating: input.rating,
          format: input.format,
          publishConsent: input.publishConsent,
          hasComment: Boolean(input.comment),
        },
      });
      return { expired: false as const, review };
    });
    if (result.expired) {
      throw new ConflictException('This review request has expired.');
    }
    return result.review;
  }

  // -------------------------------------------------------------- helpers

  private async assertEligible(
    tx: ExtendedPrismaClient,
    patientId: string,
    input: CreateReviewRequestInput,
  ) {
    switch (input.stage) {
      case ReviewStage.AFTER_SECOND_CONSULTATION: {
        const closed = await tx.encounter.count({
          where: { patientId, status: EncounterStatus.CLOSED },
        });
        if (closed < 2) {
          throw new ConflictException(NOT_ASKABLE);
        }
        return;
      }
      case ReviewStage.AFTER_FIRST_FOLLOW_UP: {
        const done = await tx.followUp.count({
          where: { patientId, status: FollowUpStatus.DONE },
        });
        if (done < 1) {
          throw new ConflictException(NOT_ASKABLE);
        }
        return;
      }
      case ReviewStage.AFTER_PROCEDURE: {
        const procedure = input.procedureId
          ? await tx.procedure.findUnique({ where: { id: input.procedureId } })
          : null;
        if (
          !procedure ||
          procedure.patientId !== patientId ||
          procedure.status !== ProcedureStatus.COMPLETED
        ) {
          throw new ConflictException(NOT_ASKABLE);
        }
        return;
      }
    }
  }

  private async lockRequest(tx: ExtendedPrismaClient, requestId: string) {
    await tx.$queryRaw`SELECT id FROM review_requests WHERE id = ${requestId} FOR UPDATE`;
    const request = await tx.reviewRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Review request not found.');
    }
    return request;
  }

  private auditRequest(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorType: 'USER' | 'PATIENT',
    actorId: string,
    action: string,
    request: ReviewRequest,
    extra: Record<string, unknown> = {},
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType,
      actorId,
      action,
      entityType: 'ReviewRequest',
      entityId: request.id,
      metadata: {
        patientId: request.patientId,
        stage: request.stage,
        procedureId: request.procedureId,
        ...extra,
      },
    });
  }
}
