import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { patientBookingSchema, type PatientBookingInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { isDateString } from '../common/clinic-time';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { PatientBookingService } from './patient-booking.service';

type PatientRequest = Request & { user: AuthenticatedUser };

/**
 * Online booking and visit records for the signed-in patient (patient-web).
 * Ownership, not RBAC: only a PATIENT token reaches these, always scoped
 * to its own id from the JWT. Staff book through /appointments.
 */
@Controller('patients/me')
export class PatientBookingController {
  constructor(private readonly booking: PatientBookingService) {}

  @Get('booking/doctors')
  doctors(@Req() request: PatientRequest) {
    const user = this.requirePatient(request);
    return this.booking.doctors(user.organizationId);
  }

  @Get('booking/doctors/:doctorId/slots')
  slots(
    @Req() request: PatientRequest,
    @Param('doctorId') doctorId: string,
    @Query('date') date?: string,
  ) {
    const user = this.requirePatient(request);
    if (!date || !isDateString(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }
    return this.booking.slots(user.organizationId, doctorId, date);
  }

  @Post('appointments')
  book(
    @Req() request: PatientRequest,
    @Body(new ZodValidationPipe(patientBookingSchema)) body: PatientBookingInput,
  ) {
    const user = this.requirePatient(request);
    return this.booking.book(user.organizationId, user.userId, body);
  }

  @Post('appointments/:id/cancel')
  cancel(@Req() request: PatientRequest, @Param('id') id: string) {
    const user = this.requirePatient(request);
    return this.booking.cancel(user.organizationId, user.userId, id);
  }

  @Get('appointments/:id')
  visit(@Req() request: PatientRequest, @Param('id') id: string) {
    const user = this.requirePatient(request);
    return this.booking.visit(user.organizationId, user.userId, id);
  }

  @Get('appointments/:id/video')
  video(@Req() request: PatientRequest, @Param('id') id: string) {
    const user = this.requirePatient(request);
    return this.booking.videoRoom(user.organizationId, user.userId, id);
  }

  private requirePatient(request: PatientRequest) {
    if (request.user.actorType !== 'PATIENT') {
      throw new ForbiddenException('Only a patient can book through this route.');
    }
    return request.user;
  }
}
