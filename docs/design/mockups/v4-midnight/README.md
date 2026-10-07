# v4 · Midnight Console

A dark-first, keyboard-driven console for the clinic (Linear and Vercel console are the references). Same scenario and content as v2: Dr. Meera Iyer, 7 Oct, around 19:02, token 012 Pooja Deshpande.

| File                                 | What it shows                                               |
| ------------------------------------ | ----------------------------------------------------------- |
| `1-doctor-today.png`                 | Today as a kanban of the clinic flow, plus the Inbox drawer |
| `2-doctor-consultation.png`          | Three split panes: timeline · SOAP editor · Orders          |
| `3-patient-home-booking-results.png` | Patient app: Home, Book a visit, Test results               |

## Design system

**Palette.** There is one accent and no gradients, glow or purple. Depth comes only from layered surfaces and 1px borders.

| Role                              | Hex       |
| --------------------------------- | --------- |
| Canvas                            | `#0b0d10` |
| Surface 1 (panels)                | `#12151a` |
| Surface 2 (cards, inputs)         | `#181c22` |
| Surface 3 (selected)              | `#1e232b` |
| Border                            | `#232832` |
| Control border                    | `#2c323d` |
| Text                              | `#e6e8eb` |
| Muted                             | `#9aa3ad` |
| Subtle text                       | `#848d98` |
| Faint (icons and decoration only) | `#6b7480` |
| Accent mint                       | `#3ddc97` |
| Text on mint                      | `#062a1a` |
| Status red                        | `#ff6b6b` |
| Status amber                      | `#f5b041` |
| Status sky                        | `#5cc8ff` |

Status colours always come with a word ("High", "Low", "Unsigned", "Long wait", "Ordered"). Status chips use the colour at 12% fill with a 35% border.

The brief's subtle `#6b7480` measures 3.6 to 4.1:1 on these surfaces, which fails AA. Subtle text was lifted to `#848d98`, which measures at least 4.7:1 on every surface. `#6b7480` is kept only for icons and dividers.

**Type.** Manrope (500, 600 and 700) is used for the UI, with headings at -0.02em letter-spacing. JetBrains Mono is used for every token, time, vital, code (ICD-10), ID (MRN) and price. Sizes:

- Staff screens: 13px base, nothing below 11px.
- Patient screens: 15px base, nothing below 13px.

**Shape.**

- One radius: 6px on every control, card and panel. The only exception is the patient app's floating tab bar, which is a pill.
- Borders are 1px.
- Panels have a top-edge highlight of `inset 0 1px 0 rgba(255,255,255,0.03)`.
- There are no drop shadows.

**Spacing and density.**

- Dense, on a 4px grid. Panel padding is 12px. Columns and cards sit 6 to 8px apart. Controls are 28 to 32px high.
- Kanban columns have different widths: "Ready for you" is the widest because that is where the decision is made.

**Icons.** Phosphor, Bold weight (`ph-bold`).

**Navigation.**

- Doctor:
  - A 64px icon-only rail with a 2px mint marker on the active item. Tooltips are implied.
  - A command palette bar at top centre: "Jump to patient, token, or action… ⌘K".
  - Keyboard hints next to the actions: `C` Call in, `O` Open, `S` Sign, `⇧↵` Send, `⌘S` Save, `/` snippet, `J/K` move.
- Patient: dark cards and a floating pill tab bar. The active tab is a mint pill with its label, and the other tabs show icons only.

**Signature components.**

- Doctor Today is a kanban of the clinic flow: Arriving · Vitals · Ready for you · With you · Lab · Done.
- The consultation note is an IDE-style SOAP editor:
  - a line-number gutter
  - S/O/A/P mono markers
  - a mint bar on the section being edited
  - a status line at the bottom: `Draft · saved 19:04 · 2 unsigned`
- The patient Home screen shows a big mint mono token beside a progress ring for the visit stages.

## What I took from the design skills

- **taste-skill §4**:
  - one accent, locked across all three screens
  - one radius scale, with the pill exception written down
  - a button contrast check: mint `#3ddc97` with `#062a1a` text is 8.8:1
  - no wrapping CTAs ("Sign note & diagnosis" got a 1fr grid cell)
  - the theme locked to dark
  - no pure `#000` or `#fff`
- **ui-ux-pro-max** (`search.py "dark mode developer console dashboard linear" --domain style` and `"technical dashboard monospace developer" --domain typography`):
  - From the Dark Mode (OLED) style: `color-scheme: dark`, near-black rather than black, 4.5:1+ text and visible focus.
  - I rejected its "minimal glow / neon accents" suggestion, as the brief asks.
  - From the "Dashboard Data" pairing: mono for data and sans for labels. I used JetBrains Mono with Manrope rather than Fira.

## Why this direction

1. Doctors spend whole evenings in this tool. A dark, low-glare console with one accent cuts eye strain, and the urgent items (the allergy flag, unsigned notes) stand out.
2. A kanban of the real clinic flow shows where every patient is at a glance. That is the question a busy clinic asks every few minutes.
3. Keyboard shortcuts and the ⌘K palette let a doctor call in, write, sign and send without reaching for the mouse, which is faster at 20-minute visits.
