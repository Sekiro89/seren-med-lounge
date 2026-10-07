# v6 "Serene Mist"

Static design images only. They show the same scenario and features as v2, in a lighter design system that uses more colour.

| File                                 | What it shows                                 |
| ------------------------------------ | --------------------------------------------- |
| `1-doctor-today.png`                 | The doctor's Today screen, 1440×900           |
| `2-doctor-consultation.png`          | The consultation workspace, 1440×1000         |
| `3-patient-home-booking-results.png` | Patient app: Home, Book a visit, Test results |

## Design system in brief

**Palette and colour roles.** Every text pair below was checked and is at least 4.5:1.

- **Canvas and text.** The canvas is mist `#f6f9f8`. Surfaces are white `#ffffff`, the secondary surface is `#eef5f3` and borders are `#e3ebe8`. Text is `#10201f` and muted text is `#4b5d5a`. Subtle text is `#5b6d6f`: I darkened it from `#66787a`, which was only 4.37:1 on the canvas.
- **Primary: SereneMed teal `#0f766e`** (hover `#115e59`, selected tint `#ddf1ec`). It is used for every action, the selected nav item, tabs, booked slots and the selected booking slot.
- **Live accent: coral `#e8664a`.** It marks what is happening now: the "Ready for you" stage, the "now" pill on the agenda, the Live token badge and the patient's current step. Coral fills that carry white text use `#c94a2f`, because white on `#e8664a` is only 3.27:1. The plain coral is used only for rings, dots and lines. Text on the coral tint `#fdeee9` is `#b4432b`.
- **Station tints: one colour per clinic station, the same everywhere.**

  | Station             | Tint            | Text      |
  | ------------------- | --------------- | --------- |
  | Arrived and booking | sky `#e6f1fb`   | `#0b5c99` |
  | Vitals              | mint `#ddf4ef`  | `#0f766e` |
  | With doctor         | coral `#fdeee9` | `#b4432b` |
  | Lab                 | lilac `#ecebfb` | `#4a45a8` |
  | Billing             | peach `#fff1e3` | `#a1500c` |
  | Done                | sage `#e5f4ea`  | `#1f7a3f` |

  The same tints colour the journey strip, the sidebar icon squares, the queue chips, the vitals cards (mint) beside the HbA1c card (lilac, because it is a lab result), the patient's quick actions (Book sky, Video coral, Results lilac, Pay peach) and the "Send patient to" choices.

- **Status colours** always come with a word: green `#15803d`, amber `#b45309`, red `#b91c1c`, sky `#0369a1`.
- **No dark panels, no gradients, no glow.**

**Type.** Outfit (500/600) is used for titles, names and big counts. DM Sans (400/500/600) is used for all UI text. DM Mono is used for tokens, times, vitals, codes and doses, with units set in DM Sans. Text is at least 11px on staff screens and 13px on patient screens.

**Shape.** Panels are 16px, inner tiles 14px and controls 10px. Chips, tabs, segmented controls and slot pills are full pills. Every surface has a hairline `#e3ebe8` border. Shadows are soft and tinted teal: `0 1px 2px rgba(16,32,31,.04), 0 10px 30px -14px rgba(15,118,110,.18)`.

**Density.** Density is medium. Panels have 16–20px padding and gaps are 20–24px. Each screen has one focal object: the Ready-for-you stage, the Assessment card or the token ring.

**Icons.** Phosphor regular, with fill for the active nav item and the active tab.

**Navigation (staff).** The sidebar is a light white column, 232px wide.

- At the top is a clinic card: a teal "S" mark, SereneMed Lounge, Indiranagar, and "Open until 20:00".
- Each nav icon sits in a small square tinted with its station colour.
- The active item is a sage-tint pill with teal text and a teal dot.
- At the bottom is a "Your status: On duty" toggle.
- The top bar holds a large Outfit title, a pill segmented control (Mine · Whole clinic, or Note · Timeline), a pill search, a bell and an avatar.

**Navigation (patient).** A white bottom bar. The active tab sits in a teal-tint pill.

**Signature component: the clinic journey strip.** On the doctor's Today, a strip runs Arrived → Vitals → With doctor → Lab → Billing → Done. Each stage is a white node with a count and the tokens inside it as initial chips, joined by a thin teal line. The "With doctor" stage is the focus: coral ring, coral tint and a "Ready for you" tag. On the patient Home, the same stages run vertically under the token ring, with a time at each step and the current step in coral.

**Screens.**

- **Doctor Today.**
  - At the top is the journey strip.
  - Below it, on the left, is a "Next up" card for Pooja with her identifiers, allergy pill, reason, four vitals cards with sparklines, and Call in and Open consultation.
  - On the right are a compact queue and the "Needs your signature" list.
  - At the bottom, the evening agenda is shown as time pills, marked seen, booked, free or now.
- **Consultation.**
  - A sticky patient card on the left shows identifiers, token, allergy, conditions, vitals, medicines, recent results with range bars, and the last visit.
  - On the right, a sticky action strip carries the "2 unsigned" warning, Save draft, Sign note & diagnosis, and Sign and send to Lab.
  - Below the strip are pill tabs (Notes · Diagnosis · Orders · Plan) and a 2×2 SOAP grid. The Assessment card has a teal ring and quick-add pills.
  - Under the grid are the diagnosis chip and a row with Prescription, Tests and Next steps.
- **Patient.**
  - Home has a white token card with a teal ring and the vertical journey.
  - Booking has an October month calendar with dots on free days and Thu 8 selected, plus slot pills.
  - Results has an HbA1c semicircle gauge (the normal arc in sage, the value marker in amber), the trend line, and tidy rows for the other tests.

## Why this direction suits SereneMed as a SaaS

1. It is light and calm like the lounge itself. Teal stays the brand, so it reads as a polished product, not a hospital system.
2. Each station keeps one colour across the staff and patient apps. A doctor, a nurse at the desk and a patient can all tell at a glance where someone is.
3. The journey strip is the clinic's real workflow, so the product shows how the clinic operates. That is easy to sell to the next clinic.

## What the skills contributed

- **taste-skill §4.**
  - I followed the shape-lock rule with a written rule: panels 16px, controls 10px, everything interactive a full pill.
  - Shadows are tinted with the canvas hue, never black. The page has one light theme.
  - The button contrast check is why white-on-coral was moved to `#c94a2f`.
  - Each intent has one CTA. "Call in" is on Today only, and "Sign and send to Lab" is in the strip only.
  - There is no serif and no purple glow.
  - **Rule relaxed on purpose:** at the user's request ("not only teal, any other colour also"), this direction does not keep §4.2's one-accent rule. It uses teal as the only action colour, coral as the only live colour, and pastel tints that only label stations, never actions. That keeps the colours from competing.
- **ui-ux-pro-max.**
  - The `style` query "calm premium healthcare SaaS light" returned Glassmorphism, Aurora UI and Fluent 2. I took Fluent 2's calm hierarchy, semantic tokens and subtle depth. I rejected glass blur and aurora gradients as noisy for clinical data.
  - The `color` query "healthcare clinic teal calm" returned a "calm cyan + health green" healthcare palette with a light tinted background, white cards and a `#475569` muted foreground. That confirmed the mist canvas, white cards and a muted text near `#4b5d5a`. I kept SereneMed's own teal instead of cyan.

Source HTML is in the session scratchpad under `mockups/v6-serene-mist/`.
