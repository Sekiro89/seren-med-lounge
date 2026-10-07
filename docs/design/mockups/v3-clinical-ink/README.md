# v3 "Clinical Ink"

The same SereneMed content as v2 (Dr. Meera's evening, Pooja's consultation, Pooja's patient app), set in a Swiss, editorial-clinical design system. These are static images only. No app source was touched.

| File                                 | What it shows                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1-doctor-today.png`                 | Doctor Today: master–detail, agenda table on the left and Pooja's detail sheet on the right, a schedule ruler, a ruled signature list                 |
| `2-doctor-consultation.png`          | Consultation as a document: a letterhead, numbered SOAP sections, margin notes, and a side rail with orders, the allergy check and the finish buttons |
| `3-patient-home-booking-results.png` | Patient app: Home, Book a visit, Test results                                                                                                         |

## Design system in brief

- **Palette.** Canvas `#f6f7f9`, page `#ffffff`, ink `#0b0d12`. The greys are neutral, not slate: `#33363d`, `#5b5e66` and `#6b6e76` for text (the lightest passes 5.1:1 on white). Rules are `#e4e7ec`, control borders `#c9ccd2`. There is **one accent, cobalt `#1f4fd8`** (hover `#1a43b8`, tint `#eef2fd` for the selected row), used for primary actions, the active tab, the selected item and "now". Status colours are muted and always come with a word: red `#b42318` (Allergy, Low, Urgent), amber `#b54708` (High, At vitals, Unsigned), green `#067647` (Results in, Normal, Getting better).
- **Type.** IBM Plex Sans 400/500/600 for the UI. IBM Plex Mono for every number, token, time and code (012, 128/84, D50.9, 19:02). IBM Plex Serif appears **only** in the big page titles on the doctor screens ("Today, Dr. Meera", and the patient name on the consultation letterhead). The taste-skill allows a serif when the direction really is editorial or publication-like and the choice can be explained. Here the consultation is treated as a clinical document, a record that gets signed and kept, and a serif title gives it the voice of a letterhead. Plex Serif belongs to the same superfamily as the sans and mono, so the three share proportions and do not clash. The patient app uses no serif. Smallest text is 11px on staff screens and 13px on patient screens.
- **Shape.** Sharp. Controls have a 2px radius at most, panels have 0, and nothing has a drop shadow. Content is grouped with 1px hairline rules, a 1px ink rule over each section head, and white space, not with cards. The phone outline is the only rounded shape, because it is the device, not the UI.
- **Spacing and density.** The doctor screens are dense: agenda rows are 35px, vitals rows 40px, and the page uses 32–40px side gutters. The patient screens are airy: 24px gutters and 48px slot buttons.
- **Icons.** Phosphor **Light**, used sparingly: one icon per action or row type, and none used as decoration.
- **Navigation.** On the doctor screens there is **no sidebar**. A full-width top bar holds the wordmark, the tabs (Today · Queue · Consultations · Patients · Labs · More), search and the user, and a thin second row carries the clinic, date, time and breadcrumb. The active tab gets a 2px cobalt underline. The patient app has a large title at the top and a minimal bottom tab bar with text-only labels; the active tab gets the same 2px cobalt bar.
- **Signature component.** The **ruler**: a hairline axis with tick marks that keeps coming back across the set. It is the doctor's day schedule (seen in ink, booked in cobalt, free as outlines, hatched when closed, a red "now 19:02"), the patient's visit progress (Check-in → Nurse → Doctor → Lab → Pay), and the lab range bar (normal band, value tick, labelled ends).

## What I took from the skills

- **taste-skill §4.** The one-accent colour lock. One radius scale (all sharp, 2px controls). Cards only where elevation means something, which here is nowhere, so `divide`/rules and white space do the grouping. The serif discipline rule, explained above. Single-line CTAs with distinct intents ("Call in" appears only once). Contrast of 4.5:1 or better on all text, including the struck-through slots.
- **ui-ux-pro-max** (`"swiss editorial minimal clinical" --domain style` returned _Minimalism & Swiss Style_): a grid-based layout, `--border-radius: 0`, `--shadow: none`, a single primary accent, and a clear type hierarchy. `"IBM Plex editorial serif sans" --domain typography` returned _Financial Trust_ (IBM Plex Sans: "conveys trust… excellent for data"), which supports Plex as the clinical workhorse, extended here with Plex Mono for data.

## Why this direction (for a clinic SaaS)

1. Clinical work is reading tables, numbers and records. Rules, Plex Mono numerals and a document-shaped consultation make the data the interface, not the chrome around it.
2. Dropping the sidebar for a top bar gives the master–detail and the 760px note the full width, so the doctor sees the agenda and the patient at once.
3. With one accent, every status spelled out in words and no shadows or cards, the system is cheap to build, prints and exports cleanly, and stays calm at the end of a 10-hour clinic day.
