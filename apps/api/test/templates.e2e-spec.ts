import { PrismaClient, StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * Clinical template engine: versioned templates (append-only versions),
 * activate/deactivate, and starting a clinical note draft from a
 * template version (prefill + templateVersionId recorded).
 */
describe('Clinical templates (e2e)', () => {
  let ctx: TestContext;
  let appRole: PrismaClient;
  const orgA = { id: 'e2e-templates-org-a', name: 'E2E Templates Org A' };
  const orgB = { id: 'e2e-templates-org-b', name: 'E2E Templates Org B' };
  let encounterId: string;

  const SECRET_DEFAULT = 'Chest pain radiating to left arm, onset 2h';

  const bodyV1 = {
    sections: {
      subjective: { prompt: 'Presenting complaint', defaultText: SECRET_DEFAULT },
      plan: { defaultText: 'Review in 1 week' },
    },
    fields: [
      { key: 'pain-score', label: 'Pain score', type: 'number', required: true },
      { key: 'side', label: 'Side', type: 'select', options: ['left', 'right'] },
    ],
  };
  const bodyV2 = {
    sections: {
      subjective: { defaultText: 'Version two subjective' },
      assessment: { defaultText: 'Version two assessment' },
    },
  };

  beforeAll(async () => {
    appRole = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'junior', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    const patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@templates-a.example.com',
      phone: '9555000001',
    });
    encounterId = await checkedInEncounter(ctx, 'reception', patient.id);
  });

  afterAll(async () => {
    await appRole.$disconnect();
    await ctx.close();
  });

  function createTemplate(who: string, overrides: Record<string, unknown> = {}) {
    return ctx
      .http()
      .post('/clinical-templates')
      .set(ctx.as(who))
      .send({ name: 'Chest pain OPD', noteType: 'CONSULTATION', body: bodyV1, ...overrides });
  }

  describe('template lifecycle', () => {
    it('creates, versions, lists and deactivates a template', async () => {
      const created = await createTemplate('senior', { specialty: 'Cardiology' }).expect(201);
      expect(created.body.currentVersion).toBe(1);
      expect(created.body.currentVersionId).toBeTruthy();
      expect(created.body.body.sections.subjective.defaultText).toBe(SECRET_DEFAULT);
      const id = created.body.id;
      const v1Id = created.body.currentVersionId;

      const v2 = await ctx
        .http()
        .post(`/clinical-templates/${id}/versions`)
        .set(ctx.as('admin'))
        .send({ body: bodyV2 })
        .expect(201);
      expect(v2.body.currentVersion).toBe(2);
      expect(v2.body.currentVersionId).not.toBe(v1Id);

      const detail = await ctx
        .http()
        .get(`/clinical-templates/${id}`)
        .set(ctx.as('junior'))
        .expect(200);
      expect(detail.body.currentVersion).toBe(2);
      expect(detail.body.body).toEqual(bodyV2);
      expect(detail.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);

      // Older version is unchanged.
      const old = await ctx
        .http()
        .get(`/clinical-templates/${id}/versions/1`)
        .set(ctx.as('junior'))
        .expect(200);
      expect(old.body.body).toEqual(bodyV1);

      const list = await ctx
        .http()
        .get('/clinical-templates?noteType=CONSULTATION&active=true')
        .set(ctx.as('junior'))
        .expect(200);
      const entry = list.body.find((t: { id: string }) => t.id === id);
      expect(entry.currentVersionId).toBe(v2.body.currentVersionId);

      await ctx
        .http()
        .post(`/clinical-templates/${id}/deactivate`)
        .set(ctx.as('senior'))
        .expect(201);
      await ctx
        .http()
        .post(`/clinical-templates/${id}/deactivate`)
        .set(ctx.as('senior'))
        .expect(409);
      const activeList = await ctx
        .http()
        .get('/clinical-templates?active=true')
        .set(ctx.as('junior'))
        .expect(200);
      expect(activeList.body.map((t: { id: string }) => t.id)).not.toContain(id);
      const inactiveList = await ctx
        .http()
        .get('/clinical-templates?active=false')
        .set(ctx.as('junior'))
        .expect(200);
      expect(inactiveList.body.map((t: { id: string }) => t.id)).toContain(id);

      await ctx.http().post(`/clinical-templates/${id}/activate`).set(ctx.as('senior')).expect(201);
    });

    it('validates the template body', async () => {
      const bad = [
        { sections: {}, fields: [{ key: 'a', label: 'A', type: 'select' }] },
        { sections: {}, fields: [{ key: 'a', label: 'A', type: 'text', options: ['x'] }] },
        {
          sections: {},
          fields: [
            { key: 'a', label: 'A', type: 'text' },
            { key: 'a', label: 'B', type: 'number' },
          ],
        },
        { sections: {}, fields: [{ key: 'Not A Slug', label: 'A', type: 'text' }] },
        { sections: { subjective: { defaultText: 'x'.repeat(5001) } } },
        { sections: { subjective: { prompt: 'x'.repeat(1001) } } },
        {
          sections: {},
          fields: Array.from({ length: 51 }, (_, i) => ({
            key: `f${i}`,
            label: 'F',
            type: 'text',
          })),
        },
        {},
      ];
      for (const body of bad) {
        await createTemplate('admin', { body }).expect(400);
      }
      await createTemplate('admin', { noteType: 'NOPE' }).expect(400);
      await ctx.http().get('/clinical-templates?noteType=NOPE').set(ctx.as('junior')).expect(400);
    });

    it('lets a junior doctor read but not write templates; reception cannot read', async () => {
      const created = await createTemplate('admin').expect(201);
      await createTemplate('junior').expect(403);
      await ctx
        .http()
        .post(`/clinical-templates/${created.body.id}/versions`)
        .set(ctx.as('junior'))
        .send({ body: bodyV2 })
        .expect(403);
      await ctx
        .http()
        .post(`/clinical-templates/${created.body.id}/deactivate`)
        .set(ctx.as('junior'))
        .expect(403);
      await ctx.http().get('/clinical-templates').set(ctx.as('junior')).expect(200);
      await ctx
        .http()
        .get(`/clinical-templates/${created.body.id}`)
        .set(ctx.as('junior'))
        .expect(200);
      await ctx.http().get('/clinical-templates').set(ctx.as('reception')).expect(403);
    });

    it('isolates templates between organizations', async () => {
      const created = await createTemplate('admin').expect(201);
      await ctx
        .http()
        .get(`/clinical-templates/${created.body.id}`)
        .set(ctx.as('adminB'))
        .expect(404);
      await ctx
        .http()
        .post(`/clinical-templates/${created.body.id}/versions`)
        .set(ctx.as('adminB'))
        .send({ body: bodyV2 })
        .expect(404);
      await ctx
        .http()
        .post(`/clinical-templates/${created.body.id}/deactivate`)
        .set(ctx.as('adminB'))
        .expect(404);
      const listB = await ctx.http().get('/clinical-templates').set(ctx.as('adminB')).expect(200);
      expect(listB.body).toEqual([]);
    });
  });

  describe('notes from templates', () => {
    it('prefills missing SOAP fields from defaults and records templateVersionId', async () => {
      const created = await createTemplate('senior').expect(201);
      const v1Id = created.body.currentVersionId;

      const note = await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, templateVersionId: v1Id, plan: 'Doctor-written plan' })
        .expect(201);
      expect(note.body.templateVersionId).toBe(v1Id);
      expect(note.body.noteType).toBe('CONSULTATION');
      expect(note.body.versions[0].subjective).toBe(SECRET_DEFAULT);
      expect(note.body.versions[0].plan).toBe('Doctor-written plan');
      expect(note.body.versions[0].assessment).toBeNull();

      // Zero explicit SOAP fields is fine when the template supplies a default.
      const blank = await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, templateVersionId: v1Id })
        .expect(201);
      expect(blank.body.versions[0].plan).toBe('Review in 1 week');

      // An older version stays usable (and unchanged) after a new version.
      await ctx
        .http()
        .post(`/clinical-templates/${created.body.id}/versions`)
        .set(ctx.as('senior'))
        .send({ body: bodyV2 })
        .expect(201);
      const fromOld = await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, templateVersionId: v1Id })
        .expect(201);
      expect(fromOld.body.templateVersionId).toBe(v1Id);
      expect(fromOld.body.versions[0].subjective).toBe(SECRET_DEFAULT);
      expect(fromOld.body.versions[0].assessment).toBeNull();

      // Audit for the note records the version id; no free text anywhere.
      const audit = await ctx.admin.auditLog.findFirst({
        where: { organizationId: orgA.id, entityId: note.body.id },
      });
      expect(audit?.action).toBe('clinical_note.create_draft');
      expect(audit?.metadata).toMatchObject({ templateVersionId: v1Id });
    });

    it('still requires at least one field without a template, and after prefill', async () => {
      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId })
        .expect(400);
      const noDefaults = await createTemplate('senior', {
        body: { sections: { subjective: { prompt: 'Ask about onset' } } },
      }).expect(201);
      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, templateVersionId: noDefaults.body.currentVersionId })
        .expect(400);
      // Explicit content plus a prompt-only template is fine.
      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({
          encounterId,
          templateVersionId: noDefaults.body.currentVersionId,
          subjective: 'Onset yesterday',
        })
        .expect(201);
    });

    it('rejects a mismatched noteType, an inactive template, or an unknown/foreign version', async () => {
      const created = await createTemplate('senior').expect(201);
      const versionId = created.body.currentVersionId;

      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, noteType: 'PROGRESS', templateVersionId: versionId })
        .expect(400);

      await ctx
        .http()
        .post(`/clinical-templates/${created.body.id}/deactivate`)
        .set(ctx.as('senior'))
        .expect(201);
      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, templateVersionId: versionId })
        .expect(400);

      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, templateVersionId: 'does-not-exist' })
        .expect(400);

      // Org B's template version is invisible to org A.
      const foreign = await createTemplate('adminB').expect(201);
      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, templateVersionId: foreign.body.currentVersionId })
        .expect(400);
    });
  });

  describe('guarantees', () => {
    it('refuses UPDATE/DELETE on clinical_template_versions for the app role', async () => {
      await expect(
        appRole.$executeRawUnsafe(`UPDATE "clinical_template_versions" SET "version" = "version"`),
      ).rejects.toThrow(/permission denied|42501/);
      await expect(
        appRole.$executeRawUnsafe(`DELETE FROM "clinical_template_versions"`),
      ).rejects.toThrow(/permission denied|42501/);
    });

    it('audits template writes without body text', async () => {
      const logs = await ctx.admin.auditLog.findMany({
        where: { organizationId: orgA.id, entityType: 'ClinicalTemplate' },
      });
      const actions = new Set(logs.map((l) => l.action));
      for (const action of [
        'clinical_template.create',
        'clinical_template.version',
        'clinical_template.deactivate',
        'clinical_template.activate',
      ]) {
        expect(actions).toContain(action);
      }
      const allOrgLogs = await ctx.admin.auditLog.findMany({ where: { organizationId: orgA.id } });
      const serialized = JSON.stringify(allOrgLogs.map((l) => l.metadata));
      expect(serialized).not.toContain(SECRET_DEFAULT);
      expect(serialized).not.toContain('Version two');
      expect(serialized).not.toContain('Presenting complaint');
    });
  });
});
