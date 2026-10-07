import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * Reception's "create patient" flow extended with the Patient Record
 * Claim Rules' duplicate-detection logic (see
 * docs/architecture/open-questions.md#3 and
 * PatientsService.register's doc comment). Covers the cases the
 * extension was built for: a genuinely new patient, a confident
 * existing-patient match, a patient with no online account yet
 * (+ activation), a patient whose account already exists, an ambiguous
 * phone+DOB match, a "phone number changed" possible match, multiple
 * candidates, concurrent creation, cross-tenant isolation, RBAC, and the
 * audit trail. patient-auth.e2e-spec.ts's own "Patient Record Claim
 * Rules" block covers the equivalent self-signup-side matching tiers;
 * this suite doesn't re-prove those.
 */
describe('Reception patient dedup (e2e)', () => {
  let app: INestApplication;
  let admin: PrismaClient;

  const orgA = { id: 'e2e-reception-org-a', name: 'E2E Reception Org A' };
  const orgB = { id: 'e2e-reception-org-b', name: 'E2E Reception Org B' };
  const receptionAPassword = 'reception-a-password';
  const nurseAPassword = 'nurse-a-password'; // no patient:write
  const receptionBPassword = 'reception-b-password';

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

    const orgFilter = { organizationId: { in: [orgA.id, orgB.id] } };
    await admin.auditLog.deleteMany({ where: orgFilter });
    await admin.patientActivationToken.deleteMany({ where: orgFilter });
    await admin.patientClaimRequest.deleteMany({ where: orgFilter });
    await admin.patient.deleteMany({ where: orgFilter });
    await admin.user.deleteMany({ where: orgFilter });
    await admin.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });

    await admin.organization.create({ data: orgA });
    await admin.organization.create({ data: orgB });

    await admin.user.create({
      data: {
        organizationId: orgA.id,
        email: 'reception@reception-a.example.com',
        passwordHash: await bcrypt.hash(receptionAPassword, 4),
        fullName: 'Reception A',
        role: StaffRole.RECEPTION,
      },
    });
    await admin.user.create({
      data: {
        organizationId: orgA.id,
        email: 'nurse@reception-a.example.com',
        passwordHash: await bcrypt.hash(nurseAPassword, 4),
        fullName: 'Nurse A',
        role: StaffRole.NURSE,
      },
    });
    await admin.user.create({
      data: {
        organizationId: orgB.id,
        email: 'reception@reception-b.example.com',
        passwordHash: await bcrypt.hash(receptionBPassword, 4),
        fullName: 'Reception B',
        role: StaffRole.RECEPTION,
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await admin.$disconnect();
  });

  async function login(organizationId: string, email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ organizationId, email, password });
    return res.body.accessToken as string;
  }

  function registerPatient(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  describe('A. New patient', () => {
    it('no matching patient — creates exactly one patient', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const res = await registerPatient(token, {
        firstName: 'Alpha',
        lastName: 'NewPatient',
        dateOfBirth: '2001-01-01',
        phone: '7770000001',
      }).expect(201);

      expect(res.body.kind).toBe('created');
      expect(res.body.patient.firstName).toBe('Alpha');

      const count = await admin.patient.count({
        where: { organizationId: orgA.id, phone: '7770000001' },
      });
      expect(count).toBe(1);
    });
  });

  describe('B. Existing patient — strong match', () => {
    it('does not create a duplicate; returns the existing patient', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const created = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Rahul',
          lastName: 'Kumar',
          dateOfBirth: new Date('1995-12-05'),
          phone: '7770000002',
        },
      });

      const res = await registerPatient(token, {
        firstName: 'Rahul',
        lastName: 'Kumar',
        dateOfBirth: '1995-12-05',
        phone: '7770000002',
      }).expect(201);

      expect(res.body.kind).toBe('existing');
      expect(res.body.patient.id).toBe(created.id);
      expect(res.body.hasAccount).toBe(false);

      const count = await admin.patient.count({
        where: { organizationId: orgA.id, phone: '7770000002' },
      });
      expect(count).toBe(1);
    });
  });

  describe('C. Existing patient without an app account', () => {
    it('allows the account-activation flow instead of creating another patient', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const created = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'NoAccount',
          lastName: 'YetPatient',
          dateOfBirth: new Date('1993-03-03'),
          phone: '7770000003',
        },
      });

      const activationRes = await request(app.getHttpServer())
        .post(`/patients/${created.id}/send-activation`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(activationRes.body.kind).toBe('created');
      expect(activationRes.body.code).toEqual(expect.any(String));

      // The raw code is never persisted — only its hash.
      const tokenRow = await admin.patientActivationToken.findFirstOrThrow({
        where: { patientId: created.id },
      });
      expect(tokenRow.codeHash).not.toBe(activationRes.body.code);

      // The patient — not Reception — redeems it themselves.
      const activateRes = await request(app.getHttpServer())
        .post('/auth/patient/activate')
        .send({
          organizationId: orgA.id,
          code: activationRes.body.code,
          password: 'a-real-password-123',
        })
        .expect(201);
      expect(activateRes.body.status).toBe('active');
      expect(activateRes.body.patient.id).toBe(created.id);

      const count = await admin.patient.count({
        where: { organizationId: orgA.id, phone: '7770000003' },
      });
      expect(count).toBe(1);
    });
  });

  describe('D. Existing patient account already exists', () => {
    it('does not issue a second activation code/account for the same patient', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const created = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Already',
          lastName: 'HasAccount',
          dateOfBirth: new Date('1991-07-07'),
          phone: '7770000004',
          email: 'already-has-account@e2e.example.com',
          passwordHash: await bcrypt.hash('existing-password-123', 4),
        },
      });

      const matchRes = await registerPatient(token, {
        firstName: 'Already',
        lastName: 'HasAccount',
        dateOfBirth: '1991-07-07',
        phone: '7770000004',
      }).expect(201);
      expect(matchRes.body.kind).toBe('existing');
      expect(matchRes.body.hasAccount).toBe(true);

      const activationRes = await request(app.getHttpServer())
        .post(`/patients/${created.id}/send-activation`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(activationRes.body.kind).toBe('duplicate_account');
      expect(activationRes.body.patient.id).toBe(created.id);

      const tokenCount = await admin.patientActivationToken.count({
        where: { patientId: created.id },
      });
      expect(tokenCount).toBe(0);
    });
  });

  describe('E. Ambiguous phone+DOB match (name does not match)', () => {
    it('does not auto-attach; requires claim resolution', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const original = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Original',
          lastName: 'Surname',
          dateOfBirth: new Date('1980-08-08'),
          phone: '7770000005',
        },
      });

      const res = await registerPatient(token, {
        firstName: 'Different',
        lastName: 'Name',
        dateOfBirth: '1980-08-08',
        phone: '7770000005',
      }).expect(201);

      expect(res.body.kind).toBe('ambiguous_match');
      expect(res.body.candidates).toEqual([expect.objectContaining({ id: original.id })]);

      const count = await admin.patient.count({
        where: { organizationId: orgA.id, phone: '7770000005' },
      });
      expect(count).toBe(1); // still just the original

      const linkRes = await request(app.getHttpServer())
        .post(`/patient-claims/${res.body.claimRequestId}/link`)
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: original.id })
        .expect(201);
      expect(linkRes.body.id).toBe(original.id);
      // Reception confirming identity never sets a password — see
      // PatientsService.confirmPatientIdentity's doc comment.
      const resolved = await admin.patient.findUniqueOrThrow({ where: { id: original.id } });
      expect(resolved.passwordHash).toBeNull();
    });
  });

  describe('F. Different/new phone number for an existing patient', () => {
    it('flags a possible match, requires confirmation, and audits the phone change', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const original = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'PhoneChange',
          lastName: 'Patient',
          dateOfBirth: new Date('1995-12-05'),
          phone: '7770000006',
        },
      });

      const res = await registerPatient(token, {
        firstName: 'PhoneChange',
        lastName: 'Patient',
        dateOfBirth: '1995-12-05',
        phone: '7770000099', // a different phone, same name+DOB
      }).expect(201);

      expect(res.body.kind).toBe('possible_match');
      expect(res.body.candidates).toEqual([
        expect.objectContaining({ id: original.id, phone: '7770000006' }),
      ]);

      // Phone is NOT changed just by flagging the possible match.
      const beforeConfirm = await admin.patient.findUniqueOrThrow({ where: { id: original.id } });
      expect(beforeConfirm.phone).toBe('7770000006');

      await request(app.getHttpServer())
        .post(`/patient-claims/${res.body.claimRequestId}/link`)
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: original.id })
        .expect(201);

      const afterConfirm = await admin.patient.findUniqueOrThrow({ where: { id: original.id } });
      expect(afterConfirm.phone).toBe('7770000099');

      const phoneChangeAudit = await admin.auditLog.findFirst({
        where: { organizationId: orgA.id, entityId: original.id, action: 'patient.phone_changed' },
      });
      expect(phoneChangeAudit).not.toBeNull();
      expect(phoneChangeAudit?.metadata).toMatchObject({
        previousPhone: '7770000006',
        newPhone: '7770000099',
      });
    });
  });

  describe('G. Ambiguous match — multiple candidates', () => {
    it('does not auto-link or auto-merge; supports escalation', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      await admin.patient.createMany({
        data: [
          {
            organizationId: orgA.id,
            firstName: 'Twin',
            lastName: 'Person',
            dateOfBirth: new Date('1999-09-09'),
            phone: '7770000007',
          },
          {
            organizationId: orgA.id,
            firstName: 'Twin',
            lastName: 'Person',
            dateOfBirth: new Date('1999-09-09'),
            phone: '7770000008',
          },
        ],
      });

      const res = await registerPatient(token, {
        firstName: 'Twin',
        lastName: 'Person',
        dateOfBirth: '1999-09-09',
        phone: '7770000009', // matches neither existing phone
      }).expect(201);

      expect(res.body.kind).toBe('ambiguous_match');
      expect(res.body.candidates.length).toBe(2);

      const escalateRes = await request(app.getHttpServer())
        .post(`/patient-claims/${res.body.claimRequestId}/escalate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Cannot tell which twin this is over the phone.' })
        .expect(201);
      expect(escalateRes.body.status).toBe('ESCALATED');

      // Still no patient created purely from ambiguity + escalation.
      const count = await admin.patient.count({
        where: { organizationId: orgA.id, dateOfBirth: new Date('1999-09-09') },
      });
      expect(count).toBe(2);

      // Escalated claims remain resolvable (not a dead end) — still
      // shows up for staff to eventually pick "none of these."
      const listed = await request(app.getHttpServer())
        .get('/patient-claims')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (listed.body as { id: string; status: string }[]).find(
          (c) => c.id === res.body.claimRequestId,
        )?.status,
      ).toBe('ESCALATED');
    });
  });

  describe('H. Concurrent creation', () => {
    it('two simultaneous requests for the same new patient do not create two records', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const body = {
        firstName: 'Concurrent',
        lastName: 'Submission',
        dateOfBirth: '1997-04-04',
        phone: '7770000010',
      };

      const [resA, resB] = await Promise.all([
        registerPatient(token, body),
        registerPatient(token, body),
      ]);

      // Both requests succeed cleanly (no raw 500s) — one creates, the
      // advisory lock (PatientsService.acquireIdentityLock) makes the
      // other see the just-created row instead of racing past the check.
      expect([resA.status, resB.status]).toEqual([201, 201]);
      const kinds = [resA.body.kind, resB.body.kind].sort();
      expect(kinds).toEqual(['created', 'existing']);

      const count = await admin.patient.count({
        where: { organizationId: orgA.id, phone: '7770000010' },
      });
      expect(count).toBe(1);
    });
  });

  describe('I. RBAC', () => {
    it('a role without patient:write cannot create/search patients or resolve claims', async () => {
      const token = await login(orgA.id, 'nurse@reception-a.example.com', nurseAPassword);
      await registerPatient(token, {
        firstName: 'Blocked',
        lastName: 'Attempt',
        dateOfBirth: '2000-01-01',
        phone: '7770000011',
      }).expect(403);

      await request(app.getHttpServer())
        .get('/patient-claims')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('Reception can never set a patient password directly — confirming identity only ever leaves passwordHash untouched', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const original = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'NoImpersonation',
          lastName: 'Case',
          dateOfBirth: new Date('1985-05-05'),
          phone: '7770000012',
        },
      });
      const ambiguous = await registerPatient(token, {
        firstName: 'Mismatch',
        lastName: 'Name',
        dateOfBirth: '1985-05-05',
        phone: '7770000012',
      }).expect(201);

      await request(app.getHttpServer())
        .post(`/patient-claims/${ambiguous.body.claimRequestId}/link`)
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: original.id })
        .expect(201);

      const resolved = await admin.patient.findUniqueOrThrow({ where: { id: original.id } });
      expect(resolved.passwordHash).toBeNull();

      // Reception's request body has no field that could set one —
      // linkClaimSchema only accepts `patientId`.
      await request(app.getHttpServer())
        .post(`/patient-claims/${ambiguous.body.claimRequestId}/link`)
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: original.id, passwordHash: 'attempted-injection', password: 'x' })
        .expect(400); // claim already resolved — proves no lingering path either
    });
  });

  describe('J. Multi-tenant isolation', () => {
    it("Reception at org B cannot discover org A's patient by matching", async () => {
      const tokenA = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      await registerPatient(tokenA, {
        firstName: 'CrossTenant',
        lastName: 'Patient',
        dateOfBirth: '1992-02-02',
        phone: '7770000013',
      }).expect(201);

      const tokenB = await login(orgB.id, 'reception@reception-b.example.com', receptionBPassword);
      const resB = await registerPatient(tokenB, {
        firstName: 'CrossTenant',
        lastName: 'Patient',
        dateOfBirth: '1992-02-02',
        phone: '7770000013',
      }).expect(201);

      // Org B has never seen this phone/DOB before — a brand-new
      // patient, NOT a match against org A's record.
      expect(resB.body.kind).toBe('created');

      const countA = await admin.patient.count({
        where: { organizationId: orgA.id, phone: '7770000013' },
      });
      const countB = await admin.patient.count({
        where: { organizationId: orgB.id, phone: '7770000013' },
      });
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });

    it('org B cannot see or resolve an org A claim by id', async () => {
      const tokenA = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Isolated',
          lastName: 'Original',
          dateOfBirth: new Date('1970-01-01'),
          phone: '7770000014',
        },
      });
      const ambiguous = await registerPatient(tokenA, {
        firstName: 'Isolated',
        lastName: 'Mismatch',
        dateOfBirth: '1970-01-01',
        phone: '7770000014',
      }).expect(201);
      const claimId = ambiguous.body.claimRequestId as string;

      const tokenB = await login(orgB.id, 'reception@reception-b.example.com', receptionBPassword);
      const listB = await request(app.getHttpServer())
        .get('/patient-claims')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect((listB.body as { id: string }[]).some((c) => c.id === claimId)).toBe(false);

      await request(app.getHttpServer())
        .post(`/patient-claims/${claimId}/reject`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({})
        .expect(404);
    });
  });

  describe('K. Audit trail', () => {
    it('records patient.register for a genuinely new patient', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const res = await registerPatient(token, {
        firstName: 'Audited',
        lastName: 'NewOne',
        dateOfBirth: '2002-02-02',
        phone: '7770000015',
      }).expect(201);

      const entry = await admin.auditLog.findFirst({
        where: {
          organizationId: orgA.id,
          entityId: res.body.patient.id,
          action: 'patient.register',
        },
      });
      expect(entry).not.toBeNull();
      expect(entry?.actorType).toBe('USER');
    });

    it('records patient.existing_match_detected for a confident match', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const created = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'AuditMatch',
          lastName: 'Existing',
          dateOfBirth: new Date('1994-04-04'),
          phone: '7770000016',
        },
      });
      await registerPatient(token, {
        firstName: 'AuditMatch',
        lastName: 'Existing',
        dateOfBirth: '1994-04-04',
        phone: '7770000016',
      }).expect(201);

      const entry = await admin.auditLog.findFirst({
        where: {
          organizationId: orgA.id,
          entityId: created.id,
          action: 'patient.existing_match_detected',
        },
      });
      expect(entry).not.toBeNull();
    });

    it('claim_created carries source and matchReason, never sensitive data', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'AuditAmbiguous',
          lastName: 'Original',
          dateOfBirth: new Date('1996-06-06'),
          phone: '7770000017',
        },
      });
      await registerPatient(token, {
        firstName: 'AuditAmbiguous',
        lastName: 'Different',
        dateOfBirth: '1996-06-06',
        phone: '7770000017',
      }).expect(201);

      const entry = await admin.auditLog.findFirst({
        where: { organizationId: orgA.id, action: 'patient_account.claim_created' },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry?.metadata).toMatchObject({
        source: 'RECEPTION_INTAKE',
        matchReason: 'phone_dob_lastname_mismatch',
      });
      // No password/code fields anywhere in metadata.
      expect(JSON.stringify(entry?.metadata)).not.toMatch(/password/i);
    });
  });

  describe('L. Security', () => {
    it('activation code is never present in the audit log', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const created = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'SecretCode',
          lastName: 'Patient',
          dateOfBirth: new Date('1998-08-08'),
          phone: '7770000018',
        },
      });
      const activationRes = await request(app.getHttpServer())
        .post(`/patients/${created.id}/send-activation`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      const code = activationRes.body.code as string;

      const entries = await admin.auditLog.findMany({
        where: { organizationId: orgA.id, entityId: created.id },
      });
      for (const entry of entries) {
        expect(JSON.stringify(entry.metadata)).not.toContain(code);
      }
    });

    it('a wrong activation code and an expired/used one return the identical generic error', async () => {
      const token = await login(orgA.id, 'reception@reception-a.example.com', receptionAPassword);
      const created = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'WrongCode',
          lastName: 'Patient',
          dateOfBirth: new Date('1998-08-08'),
          phone: '7770000019',
        },
      });
      const activationRes = await request(app.getHttpServer())
        .post(`/patients/${created.id}/send-activation`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const wrongCodeRes = await request(app.getHttpServer())
        .post('/auth/patient/activate')
        .send({ organizationId: orgA.id, code: 'WRONGCODE', password: 'a-real-password-123' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/patient/activate')
        .send({
          organizationId: orgA.id,
          code: activationRes.body.code,
          password: 'a-real-password-123',
        })
        .expect(201);

      const reuseRes = await request(app.getHttpServer())
        .post('/auth/patient/activate')
        .send({
          organizationId: orgA.id,
          code: activationRes.body.code,
          password: 'another-password-456',
        })
        .expect(401);

      expect(wrongCodeRes.body.message).toBe(reuseRes.body.message);
    });
  });
});
