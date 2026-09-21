# Senior Doctor Workspace

Role: `StaffRole.SENIOR_DOCTOR` (see `@serenemed/types`)

Scope: everything Junior Doctor has, plus clinical note sign-off and
surgery/procedure authorization.

Permission matrix for this role lives in `@serenemed/permissions` and is
enforced server-side by the API — this folder only decides what renders.

Not scaffolded yet: screens are added once the corresponding backend module
exposes an API.
