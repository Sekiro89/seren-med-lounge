# Nurse Workspace

Role: `StaffRole.NURSE` (see `@serenemed/types`)

Scope: vitals/intake, queue handoff to doctor, read access to clinical
history.

Permission matrix for this role lives in `@serenemed/permissions` and is
enforced server-side by the API — this folder only decides what renders.

Not scaffolded yet: screens are added once the corresponding backend module
exposes an API.
