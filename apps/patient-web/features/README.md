# features/

One folder per patient-facing capability (e.g. `appointments/`, `records/`,
`prescriptions/`, `messages/`, `payments/`). Each feature folder owns its own
data hooks (TanStack Query, via `@serenemed/api-client`), forms
(React Hook Form + `@serenemed/validation`), and UI composed from
`@serenemed/ui` / `../components`.

No feature reaches into another feature's internals — compose through the
`app/` routes instead.

Not scaffolded yet: features are added as the corresponding backend module
(see `apps/api/src/*`) ships an API to consume.
