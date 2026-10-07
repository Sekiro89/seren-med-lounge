# infrastructure/deployment/

Still empty: no hosting provider has been chosen, so there are no
provider-specific manifests (Terraform, Fly/Render configs, k8s) here.

What exists instead, host-agnostic:

- `../compose/` — the production Docker Compose stack (Caddy + api + two
  web apps + Postgres + Redis + nightly backup sidecar) for "a VPS with
  Docker". Walkthrough: `docs/architecture/runbook.md`.
- `.github/workflows/ci.yml` — tests, then publishes the three images to
  GHCR on every push to `main`. Publishing is not deploying; nothing
  pulls the images automatically yet.
