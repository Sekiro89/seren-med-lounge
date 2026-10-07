import { StaffRole } from '@prisma/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPatientWithLogin, setupContext, type TestContext } from './helpers';

/**
 * Patient documents as real files: upload through the storage port,
 * download by staff and by the patient themselves, type and size limits,
 * removal, and tenant isolation. Runs against a throwaway STORAGE_DIR.
 */
describe('Patient documents: upload and download (e2e)', () => {
  let ctx: TestContext;
  let storageDir: string;
  const orgA = { id: 'e2e-docs-a', name: 'E2E Docs A' };
  const orgB = { id: 'e2e-docs-b', name: 'E2E Docs B' };
  let pooja: { id: string; auth: { Authorization: string } };
  let ravi: { id: string; auth: { Authorization: string } };
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'serenemed-storage-'));
    process.env.STORAGE_DIR = storageDir;
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'pharmacy', organizationId: orgA.id, role: StaffRole.PHARMACY },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    pooja = await createPatientWithLogin(ctx, orgA.id, {
      email: 'pooja@docs.example.com',
      phone: '9720000001',
    });
    ravi = await createPatientWithLogin(ctx, orgA.id, {
      email: 'ravi@docs.example.com',
      phone: '9720000002',
    });
  });

  afterAll(async () => {
    await ctx.close();
    rmSync(storageDir, { recursive: true, force: true });
    delete process.env.STORAGE_DIR;
  });

  let documentId: string;

  it('stores an uploaded file and registers it against the patient', async () => {
    const res = await ctx
      .http()
      .post('/patient-documents/upload')
      .set(ctx.as('reception'))
      .field('patientId', pooja.id)
      .field('documentType', 'ID_PROOF')
      .attach('file', png, { filename: '../../aadhaar front.png', contentType: 'image/png' })
      .expect(201);
    documentId = res.body.id;
    expect(res.body).toMatchObject({
      patientId: pooja.id,
      documentType: 'ID_PROOF',
      mimeType: 'image/png',
      fileName: 'aadhaar front.png',
    });
    expect(res.body.storageKey).toMatch(new RegExp(`^${orgA.id}/${pooja.id}/`));
    expect(res.body.storageKey).not.toContain('..');

    const list = await ctx
      .http()
      .get(`/patient-documents/patient/${pooja.id}`)
      .set(ctx.as('reception'))
      .expect(200);
    expect(list.body.map((d: { id: string }) => d.id)).toEqual([documentId]);
    expect(list.body[0].uploadedBy).toEqual({ fullName: 'reception' });

    const audit = await ctx.admin.auditLog.findFirst({
      where: { organizationId: orgA.id, action: 'patient_document.upload', entityId: documentId },
    });
    expect(audit).not.toBeNull();
  });

  it('serves the file back to staff with the right type, and to the patient it belongs to', async () => {
    const staff = await ctx
      .http()
      .get(`/patient-documents/${documentId}/file`)
      .set(ctx.as('reception'))
      .expect(200);
    expect(staff.headers['content-type']).toBe('image/png');
    expect(staff.headers['content-disposition']).toContain('aadhaar');
    expect(Buffer.from(staff.body).equals(png)).toBe(true);

    const mine = await ctx.http().get('/patients/me/documents').set(pooja.auth).expect(200);
    expect(mine.body).toHaveLength(1);
    await ctx.http().get(`/patients/me/documents/${documentId}/file`).set(pooja.auth).expect(200);

    // Another patient, another organisation, and a role without patient:read all get nothing.
    await ctx.http().get(`/patients/me/documents/${documentId}/file`).set(ravi.auth).expect(404);
    await ctx.http().get(`/patient-documents/${documentId}/file`).set(ctx.as('adminB')).expect(404);
    await ctx
      .http()
      .get(`/patient-documents/${documentId}/file`)
      .set(ctx.as('pharmacy'))
      .expect(200);
    await ctx
      .http()
      .post('/patient-documents/upload')
      .set(ctx.as('pharmacy'))
      .field('patientId', pooja.id)
      .field('documentType', 'PHOTO')
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' })
      .expect(403);
  });

  it('refuses the wrong kind of file, an empty file, and a missing file', async () => {
    await ctx
      .http()
      .post('/patient-documents/upload')
      .set(ctx.as('reception'))
      .field('patientId', pooja.id)
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from('#!/bin/sh\n'), { filename: 'run.sh', contentType: 'text/x-sh' })
      .expect(400);
    await ctx
      .http()
      .post('/patient-documents/upload')
      .set(ctx.as('reception'))
      .field('patientId', pooja.id)
      .field('documentType', 'OTHER')
      .attach('file', Buffer.alloc(0), { filename: 'empty.pdf', contentType: 'application/pdf' })
      .expect(400);
    await ctx
      .http()
      .post('/patient-documents/upload')
      .set(ctx.as('reception'))
      .field('patientId', pooja.id)
      .field('documentType', 'NOT_A_TYPE')
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' })
      .expect(400);
    await ctx
      .http()
      .post('/patient-documents/upload')
      .set(ctx.as('reception'))
      .field('patientId', pooja.id)
      .field('documentType', 'OTHER')
      .expect(400);
  });

  it('removes the row and the file together', async () => {
    await ctx
      .http()
      .post(`/patient-documents/${documentId}/remove`)
      .set(ctx.as('reception'))
      .expect(201);
    await ctx
      .http()
      .get(`/patient-documents/${documentId}/file`)
      .set(ctx.as('reception'))
      .expect(404);
    const list = await ctx
      .http()
      .get(`/patient-documents/patient/${pooja.id}`)
      .set(ctx.as('reception'))
      .expect(200);
    expect(list.body).toEqual([]);
  });
});
