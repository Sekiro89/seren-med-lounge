import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ReviewModerationStatus, ReviewRequestStatus } from '@prisma/client';
import type { Request } from 'express';
import {
  createReviewRequestSchema,
  submitReviewSchema,
  type CreateReviewRequestInput,
  type SubmitReviewInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { requirePatient } from '../common/require-patient';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ReviewsService } from './reviews.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

/**
 * Staff routes need review:manage (MARKETING, ADMINISTRATOR). The
 * patients/me/* routes are ownership-checked via requirePatient — the
 * patient id always comes from the JWT, never the URL or body.
 */
@Controller()
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get org() {
    return this.tenantContext.organizationId;
  }

  // ---------------------------------------------------------------- staff

  @Post('review-requests')
  @RequirePermissions('review:manage')
  createRequest(
    @Body(new ZodValidationPipe(createReviewRequestSchema)) body: CreateReviewRequestInput,
  ) {
    return this.reviewsService.createRequest(this.org, this.tenantContext.userId, body);
  }

  /** `?status=`, `?patientId=` */
  @Get('review-requests')
  @RequirePermissions('review:manage')
  listRequests(@Query('status') status?: string, @Query('patientId') patientId?: string) {
    if (status && !(status in ReviewRequestStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.reviewsService.listRequests(this.org, {
      status: status as ReviewRequestStatus | undefined,
      patientId,
    });
  }

  @Post('review-requests/:id/cancel')
  @RequirePermissions('review:manage')
  cancelRequest(@Param('id') id: string) {
    return this.reviewsService.cancelRequest(this.org, this.tenantContext.userId, id);
  }

  /** `?moderationStatus=` */
  @Get('reviews')
  @RequirePermissions('review:manage')
  listReviews(@Query('moderationStatus') moderationStatus?: string) {
    if (moderationStatus && !(moderationStatus in ReviewModerationStatus)) {
      throw new BadRequestException('Unknown moderationStatus.');
    }
    return this.reviewsService.listReviews(this.org, {
      moderationStatus: moderationStatus as ReviewModerationStatus | undefined,
    });
  }

  /** TODO(product): staff-only for now; a public website feed is out of scope. */
  @Get('reviews/published')
  @RequirePermissions('review:manage')
  listPublished() {
    return this.reviewsService.listPublished(this.org);
  }

  @Post('reviews/:id/approve')
  @RequirePermissions('review:manage')
  approve(@Param('id') id: string) {
    return this.reviewsService.moderate(
      this.org,
      this.tenantContext.userId,
      id,
      ReviewModerationStatus.APPROVED,
    );
  }

  @Post('reviews/:id/reject')
  @RequirePermissions('review:manage')
  reject(@Param('id') id: string) {
    return this.reviewsService.moderate(
      this.org,
      this.tenantContext.userId,
      id,
      ReviewModerationStatus.REJECTED,
    );
  }

  // -------------------------------------------------------------- patient

  @Get('patients/me/review-requests')
  myRequests(@Req() request: AuthedRequest) {
    const user = requirePatient(request);
    return this.reviewsService.listOpenRequestsForPatient(user.organizationId, user.userId);
  }

  @Post('patients/me/review-requests/:id/review')
  submit(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitReviewSchema)) body: SubmitReviewInput,
  ) {
    const user = requirePatient(request);
    return this.reviewsService.submit(user.organizationId, user.userId, id, body);
  }

  @Get('patients/me/reviews')
  myReviews(@Req() request: AuthedRequest) {
    const user = requirePatient(request);
    return this.reviewsService.listReviewsForPatient(user.organizationId, user.userId);
  }
}
