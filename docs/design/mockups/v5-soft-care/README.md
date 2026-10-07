# v5 "Soft Care"

Static design images only. They show the same scenario and features as v2, in a different design system.

| File                                 | What it shows                                 |
| ------------------------------------ | --------------------------------------------- |
| `1-doctor-today.png`                 | Doctor's Today screen, 1440×900               |
| `2-doctor-consultation.png`          | Consultation as a guided stepper, 1440×1000   |
| `3-patient-home-booking-results.png` | Patient app: Home, Book a visit, Test results |

## Design system in brief

- **Palette.** The canvas is a cool off-white `#f3f4f6`. Surfaces are `#ffffff`. Text is slate `#1e293b`. Muted text is `#64748b` on white and `#475569` on the canvas or slate tints, because `#64748b` falls below 4.5:1 there. Slate tints are `#f1f5f9`, `#e2e8f0` and `#cbd5e1`. There is **one accent, terracotta `#c2410c`** (hover and text-on-tint `#9a3412`, soft tint `#fff1ea`). Status colours always come with a word: green `#15803d` on `#f0fdf4`, amber `#b45309` on `#fffbeb`, red `#b91c1c` on `#fef2f2`. The palette uses no warm paper or brass.
- **Type.** Plus Jakarta Sans in weights 500, 600, 700 and 800 for everything. Numbers use tabular figures, and there is no mono font. Text is at least 12px on staff screens and 13px on patient screens.
- **Shape.** Panels are 28px, cards 24px and inner tiles 18px. Every button, chip, segmented control, slot and dock is a full pill. There is no other radius. Shadows are soft and tinted with slate: `0 20px 40px -20px rgba(30,41,59,.18)`.
- **Spacing and density.** Density is low. Panels have 24–28px padding, gaps are 24px, controls are 44–56px tall, and each screen has one focal card.
- **Icons.** Phosphor **duotone**.
- **Navigation.** Doctors get no sidebar and no top tabs. Instead, a centred pill dock floats at the bottom (Today, Queue, Patients, Labs, Messages), ending in a terracotta **Call next** pill. The top header holds only the greeting, the clinic pill and the avatar. During a consultation the dock is replaced by a floating finish bar. Patients get a floating rounded dock (Home, Visits, **Book**, Records, Me) with an elevated terracotta Book button in the centre.
- **Signature components.** The hero "Up next" card, with vitals as rounded chips. The pill stepper (History → Examination → Assessment → Orders → Finish), with the current step open as one large focused card. The patient token card, with a horizontal step track.

## Why this direction

1. A clinic sells calm. Soft shapes, low density and one warm accent make both apps feel like care, not like a hospital system.
2. One focal card per screen (Up next, the current step, your token) tells a busy doctor or an anxious patient what matters right now.
3. The bottom dock and guided stepper work the same way on tablets and phones, so the staff and patient apps share one way of moving around.

## What the skills contributed

- **taste-skill §4.** I used its terracotta + slate rotation in place of the banned beige/brass family, one locked accent, and its shape-lock rule (documented as pills for interactive elements, 24–28px for containers). From its no-duplicate-CTA rule: on Today, the hero says "Start consultation" because the dock owns "Call next". On the patient Home, the Book quick tile became Messages because the dock owns Book.
- **ui-ux-pro-max.** The `style` search for soft, friendly healthcare UI returned "Soft UI Evolution". I took its soft depth with better contrast and dropped neumorphic embossing. The `color` search returned a terracotta palette (`#9A3412`/`#C2410C` with `#475569` muted foreground), which confirmed the hover/text-on-tint shade and the darker muted colour on tints. The `typography` search suggested Varela Round and Nunito; I rejected both as too childish for clinical data and kept Plus Jakarta Sans.

Source HTML is in the session scratchpad under `mockups/v5-soft-care/`.
