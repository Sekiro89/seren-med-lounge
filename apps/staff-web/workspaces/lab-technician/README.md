# Lab Technician Workspace

Role: `StaffRole.LAB_TECHNICIAN` (see `@serenemed/types`)

Scope: recording results against ordered tests (`lab-result:write`).
Deliberately does not include ordering tests (`lab-order:write`) — that
stays a doctor's decision (`JUNIOR_DOCTOR`/`SENIOR_DOCTOR`/
`ADMINISTRATOR`).

Permission matrix for this role lives in `@serenemed/permissions` and is
enforced server-side by the API — this folder only decides what renders.

Not scaffolded yet: screens are added once the corresponding backend module
exposes an API.
