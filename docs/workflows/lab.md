# Lab

```
DOCTOR → LAB ORDER → LAB → RESULT → PATIENT RECORD → DOCTOR ALERT → PATIENT ACCESS
```

## Modules involved

`labs` (domain module) + `integrations/labs` (`LabProvider` port).

## Rules

- A `LabOrder` is created from the consultation (`encounters`/
  `clinical-notes`) and always references the ordering encounter.
- Two result paths, both landing in the same `LabResult` shape: (a) an
  external lab API via `LabProvider.fetchResult`, or (b) manual upload by
  staff when no API integration exists for that lab. Manual upload is a
  first-class path inside the `labs` module — not a fake
  `LabProvider` implementation pretending to be an API.
- A `CRITICAL` result flag (`LabResultFlag` in `@serenemed/types`)
  triggers an immediate doctor alert via `notifications`, separate from
  the routine "result available" notification.
- Patients get report access only after results are in a released state
  (not the moment a lab uploads a raw result) — the exact release gate is
  to be defined alongside the `labs` module implementation.

## Status

`labs` is a lean module shell. `integrations/labs` has the interface and
a stub provider (`StubLabProvider`) — no real lab API is connected yet.
