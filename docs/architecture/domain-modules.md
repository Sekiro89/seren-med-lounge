# Domain Modules

All modules live under `apps/api/src/*`, one folder per module, each
importing only its own module file into `AppModule`. Two shapes exist
today:

- **Full pattern** (`*.controller.ts` + `*.service.ts` + `*.module.ts`,
  Zod schemas from `@serenemed/validation` in place of a `dto/` folder) —
  used where establishing the convention mattered now: `auth`, `users`,
  `patients`, `appointments`, `encounters`, `vitals`, `clinical-notes`,
  `notifications`, `audit`. `auth`/`users`/`patients` are further along
  than the rest — real persistence, real JWT issuance for both staff and
  patients, verified against a live server, plus a real (if minimal)
  `patient-web` login UI — and are the reference implementation for how a
  tenant-scoped module should look: see rule 6 below and
  `docs/architecture/security.md#row-level-security`. `patients`
  specifically is the reference for a module with two actor types needing
  different authorization (RBAC for staff routes, own-record checks for
  patient routes) — see `docs/architecture/security.md#patient-authentication`.
  `appointments`/`encounters`/`vitals`/`clinical-notes` are the second
  reference implementation — the "clinic journey spine" — built
  specifically to prove a multi-table transaction
  (`AppointmentsService.checkIn()`) and DB-enforced clinical-record
  versioning (`ClinicalNotesService`) for real, live-verified against a
  real Postgres with RLS actually enforced, not just typechecked. See
  `docs/architecture/security.md#clinical-record-immutability` and
  `apps/api/test/clinic-journey.e2e-spec.ts`.
- **Lean shell** (`*.module.ts` only, `@Module({})`) — every other module
  below. Controllers/services/DTOs are added when that module's first
  real workflow is implemented, per the instruction not to generate files
  ahead of need. Wiring the shell into `AppModule` now means adding a
  real controller later never requires touching `AppModule` again beyond
  the one import that already exists.

## Module map

| Group                                      | Modules                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity & access                          | `auth`, `users`, `roles`, `permissions`                                                                                                                       |
| Unified Patient Record — profile & consent | `patients`, `patient-documents`, `patient-consent`, `patient-timeline`                                                                                        |
| Marketing / CRM funnel (pre-patient)       | `leads`, `crm`, `marketing`, `campaigns`                                                                                                                      |
| Clinic journey                             | `appointments`, `scheduling`, `registration`, `queue`                                                                                                         |
| Clinical spine                             | `encounters`, `vitals`, `medical-history`, `diagnoses`, `clinical-notes`, `clinical-templates`, `prescriptions`, `referrals`, `labs`, `procedures`, `surgery` |
| Pharmacy / inventory                       | `pharmacy`, `inventory`                                                                                                                                       |
| Billing / money                            | `billing`, `invoices`, `payments`, `insurance`, `accounting`                                                                                                  |
| Retention                                  | `followups`, `care-plans`, `notifications`, `reviews`                                                                                                         |
| Cross-cutting                              | `ai`, `integrations`, `audit`, `reports`                                                                                                                      |

## Rules for adding to a module

1. A module only reads/writes its own Prisma models directly. If it needs
   another domain's data, it depends on that module's exported service —
   never on another module's Prisma model or repository internals.
2. A module never imports a vendor SDK. External calls go through
   `integrations/*` via the `*_PROVIDER` DI token — see `integrations.md`.
3. Anything touching a **finalized clinical record** follows the
   versioning rule in `security.md` — no in-place mutation.
4. New DTOs are Zod schemas added to `@serenemed/validation` (shared with
   the frontends), validated in the controller via `ZodValidationPipe`.
5. Routes that should be restricted use `@RequirePermissions(...)` from
   `common/decorators/require-permissions.decorator.ts` — the backend
   check, not a frontend `can()` check, is what's authoritative.
6. A module reading/writing an organizationId-scoped table (`Clinic`,
   `User`, `Patient`, `Appointment`, `Encounter`, `Vital`,
   `ClinicalNote`, `ClinicalNoteVersion` today) does it through
   `PrismaService.withTenant()`, with the organizationId coming from
   `TenantContextService` — never from a client-supplied field in the
   request body. See `users` for the single-table pattern
   (`UsersController` reads `tenantContext.organizationId` and passes it
   to `UsersService`, which wraps its Prisma calls in
   `withTenant(organizationId, tx => ...)`), and
   `AppointmentsService.checkIn()` for the same pattern inside a
   multi-table transaction (one `withTenant` call, sequential awaits on
   the same `tx` — see its doc comment for why not `Promise.all`).
   Querying via `prisma.client` directly on one of these tables from
   inside a request handler is a bug — RLS will silently return zero rows
   rather than the caller's data.

## `patients` vs. CRM `leads`

A `Lead` converts into a `Patient` — it does not become a second copy of
patient data. The conversion step (not yet implemented) creates one
`Patient` row and links the originating `Lead` to it, per
`docs/workflows/marketing-funnel.md`. There is exactly one patient
identity in the system; every module attaches to it by `patientId`.
