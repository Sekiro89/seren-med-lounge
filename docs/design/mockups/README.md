# SereneMed UI directions (October 2026)

Five complete design directions for the same screens and the same demo scenario (Dr. Meera Iyer's evening clinic, patient Pooja Deshpande), so they can be compared like for like. Each folder has three images and a README describing its design system.

| Folder             | Direction        | Feel                                                                           | Navigation                                                  | Signature                                                           |
| ------------------ | ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `v2-serene-teal/`  | Serene Teal      | Calm, familiar SaaS; closest to today's app                                    | Deep-teal collapsible sidebar                               | Bento "Ready for you" card                                          |
| `v3-clinical-ink/` | Clinical Ink     | Editorial, document-like, white and cobalt, sharp edges                        | Horizontal top tabs, no sidebar                             | Consultation as a clinical document; tick-mark rulers               |
| `v4-midnight/`     | Midnight Console | Dark, dense, keyboard-first, mint accent                                       | Icon rail + ⌘K command bar                                  | Kanban of the clinic flow; IDE-style note editor                    |
| `v5-soft-care/`    | Soft Care        | Friendly consumer health, terracotta and slate, pill shapes                    | Floating dock at the bottom                                 | Guided step-by-step consultation                                    |
| `v6-serene-mist/`  | Serene Mist      | Light, airy clinic SaaS; teal primary, coral for "now", one pastel per station | Light white sidebar with a clinic card and tinted nav icons | Clinic journey strip (Arrived → Done), repeated on the patient Home |

Images in every folder:

1. `1-doctor-today.png`: the doctor's day
2. `2-doctor-consultation.png`: the consultation workspace
3. `3-patient-home-booking-results.png`: patient Home, Book a visit, Test results

These are design proposals rendered from static HTML. No application code was changed. Some details in the pictures need backend work before they could ship (visit-stage history for the patient tracker, a results-review step, repeated tests for trends).
