import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  registerPatientDocumentSchema,
  type RegisterPatientDocumentInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { requirePatient } from '../common/require-patient';
import { TenantContextService } from '../prisma/tenant-context.service';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { MAX_UPLOAD_BYTES, PatientDocumentsService } from './patient-documents.service';

const DOCUMENT_TYPES = ['PHOTO', 'ID_PROOF', 'INSURANCE_CARD', 'PAN_CARD', 'CONSENT_FORM', 'OTHER'];

@Controller()
export class PatientDocumentsController {
  constructor(
    private readonly patientDocumentsService: PatientDocumentsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('patient-documents/patient/:patientId')
  @RequirePermissions('patient:read')
  listForPatient(@Param('patientId') patientId: string) {
    return this.patientDocumentsService.listForPatient(
      this.tenantContext.organizationId,
      patientId,
    );
  }

  /** Multipart: `file` plus `patientId` and `documentType` fields. */
  @Post('patient-documents/upload')
  @RequirePermissions('patient:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { patientId?: string; documentType?: string },
  ) {
    if (!file) {
      throw new BadRequestException('Choose a file to upload.');
    }
    if (!body.patientId) {
      throw new BadRequestException('patientId is required.');
    }
    if (!body.documentType || !DOCUMENT_TYPES.includes(body.documentType)) {
      throw new BadRequestException('documentType must be one of: ' + DOCUMENT_TYPES.join(', '));
    }
    return this.patientDocumentsService.upload(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      {
        patientId: body.patientId,
        documentType: body.documentType as 'PHOTO',
        fileName: file.originalname,
        mimeType: file.mimetype,
        body: file.buffer,
      },
    );
  }

  /** Metadata only, for a file that lives outside this system. */
  @Post('patient-documents')
  @RequirePermissions('patient:write')
  register(
    @Body(new ZodValidationPipe(registerPatientDocumentSchema))
    body: RegisterPatientDocumentInput,
  ) {
    return this.patientDocumentsService.register(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Get('patient-documents/:id/file')
  @RequirePermissions('patient:read')
  async file(@Param('id') id: string, @Res() res: Response) {
    const doc = await this.patientDocumentsService.open(this.tenantContext.organizationId, id);
    send(res, doc);
  }

  @Post('patient-documents/:id/remove')
  @RequirePermissions('patient:write')
  remove(@Param('id') id: string) {
    return this.patientDocumentsService.remove(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }

  /** The patient's own documents (the "shared document trail"). */
  @Get('patients/me/documents')
  mine(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = requirePatient(request);
    return this.patientDocumentsService.listForPatient(user.organizationId, user.userId);
  }

  @Get('patients/me/documents/:id/file')
  async myFile(
    @Req() request: Request & { user: AuthenticatedUser },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const user = requirePatient(request);
    const doc = await this.patientDocumentsService.open(user.organizationId, id, user.userId);
    send(res, doc);
  }
}

function send(
  res: Response,
  doc: { fileName: string; mimeType: string; stream: NodeJS.ReadableStream },
) {
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  doc.stream.pipe(res);
}
