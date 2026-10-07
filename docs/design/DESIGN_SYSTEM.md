# SereneMed Lounge Design System: Clinical Ink

The single source of truth for how the SereneMed frontends look and behave
(`apps/staff-web` and `apps/patient-web`). Every screen, component and review
refers back to this file. If a decision isn't covered here, add it here
first, then build it.

**Version 2, "Clinical Ink"**, adopted 7 October 2026 after comparing five
directions (`docs/design/mockups/`). The approved reference images are in
`docs/design/mockups/v3-clinical-ink/`. Version 1 ("Serene Teal": teal accent,
Geist, 12px cards, dark-teal sidebar) is retired; `git log` has it.

Built with the design skills in `.claude/skills/`: `ui-ux-pro-max` (style,
palette, type and UX rules; returned _Minimalism and Swiss Style_ and IBM Plex
for this direction) and `taste-skill` (one accent, one shape scale, serif
discipline, contrast). `fireact-builder` is installed as a SaaS-pattern
reference only (it targets Firebase apps). Where they disagree, this document
records the decision.

---

## 1. Design read

**Reading this as:** a clinic operating system whose real content is tables,
numbers and signed records, used all day at a desk by eleven staff roles,
with a Swiss, editorial-clinical language: white pages, ink type, hairline
rules, one cobalt accent, IBM Plex.

**Style family:** Minimalism and Swiss Style (ui-ux-pro-max): grid-based, no
radius, no shadow, one primary accent, strong type hierarchy. Not
neumorphism, not glass, not soft SaaS cards.

**Dials** (taste-skill, 1 to 10):

| Dial               | Value | Why                                                                           |
| ------------------ | ----- | ----------------------------------------------------------------------------- |
| `DESIGN_VARIANCE`  | 3     | Regulated, trust-first product. Predictable, grid-aligned layouts.            |
| `MOTION_INTENSITY` | 2     | Motion only confirms state changes.                                           |
| `VISUAL_DENSITY`   | 6     | Staff read agendas and records all day; dense rows, generous page whitespace. |

**Principles** (in priority order when they conflict):

1. **Patient safety first.** The right patient, the right record, the right
   action. Identity and allergies are always visible on clinical screens;
   irreversible actions always confirm.
2. **The data is the interface.** Rules, white space and type do the
   grouping, not boxes and shadows. A consultation reads like the clinical
   document it becomes.
3. **Show only what the role can do.** Navigation and actions follow
   permissions (section 6). Nobody sees a button they can't use.
4. **One accent, used for meaning.** Cobalt marks the primary action, the
   selected item and "now". Everything else is ink and grey.
5. **Every state is designed.** Loading, empty, error, forbidden and success.

---

## 2. Colour

### 2.1 Ink and paper

Neutral greys (not slate-blue, not warm). These are the whole palette apart
from the accent and status colours.

| Token             | Hex       | Contrast on white | Use                                                 |
| ----------------- | --------- | ----------------- | --------------------------------------------------- |
| `--bg` (canvas)   | `#F6F7F9` |                   | App background behind pages                         |
| `--surface`       | `#FFFFFF` |                   | Pages, tables, panels, inputs                       |
| `--surface-muted` | `#F3F4F6` |                   | Table header band, hatched/closed zones, wells      |
| `--fg` (ink)      | `#0B0D12` | 19.4:1            | Body text, headings, the 1px section rule           |
| `--fg-muted`      | `#5B5E66` | 6.5:1             | Secondary text, labels                              |
| `--fg-subtle`     | `#6B6E76` | 5.1:1 (4.8 on bg) | Timestamps, helper text (the lightest text allowed) |
| `--line` (rule)   | `#E4E7EC` | decorative        | Hairline dividers between rows and sections         |
| `--control`       | `#858991` | 3.5:1             | **Input, select, checkbox, button-outline borders** |

**Rule:** `--line` (1.6:1) is for dividers only. Anything the user has to
find and click uses `--control` (3:1 minimum for controls).

### 2.2 The accent: cobalt

The **only** accent colour (taste-skill colour lock).

| Token                 | Hex       | Contrast                    | Use                                                         |
| --------------------- | --------- | --------------------------- | ----------------------------------------------------------- |
| `--primary`           | `#1F4FD8` | 6.6:1 on white; white 6.6:1 | Primary buttons, links, active tab bar, selected row marker |
| `--primary-hover`     | `#1A43B8` | white text 8.3:1            | Hover / pressed                                             |
| `--primary-subtle`    | `#EEF2FD` |                             | Selected row, selected filter, current step background      |
| `--primary-subtle-fg` | `#1A43B8` | 7.4:1 on the tint           | Text on `--primary-subtle`                                  |
| `--primary-line`      | `#C7D3F6` | decorative                  | Outline of a cobalt-tinted tag                              |
| `--ring`              | `#1F4FD8` | 6.6:1                       | Focus ring (2px, 2px offset)                                |

### 2.3 Status colours

Muted, used **only** for state, always with a word (never colour alone).
A status is a small square-cornered tag: tinted background, darker text,
optionally a 6px square marker before the word.

| Status  | Text      | Tint        | Contrast | Words it carries                           |
| ------- | --------- | ----------- | -------- | ------------------------------------------ |
| Danger  | `#B42318` | `#FDF1F0`   | 6.0:1    | Allergy, Low/High (critical), Urgent, Void |
| Warning | `#B54708` | `#FDF4EC`   | 5.0:1    | High, At vitals, Unsigned, Long wait       |
| Success | `#067647` | `#EEF8F3`   | 5.3:1    | Normal, Results in, Paid, Signed, Done     |
| Info    | cobalt    | cobalt tint | 5.9:1    | Called, Confirmed, In consultation, Ready  |
| Neutral | `#33363D` | `#F3F4F6`   | 11.0:1   | Waiting, Expected, Draft-neutral, Inactive |

Info deliberately reuses cobalt: in this system cobalt already means "current
/ active", so a second blue would compete with the accent.

**Domain status mapping** (one mapping, used everywhere):

| Domain                    | Neutral           | Info                          | Warning         | Success                | Danger                   |
| ------------------------- | ----------------- | ----------------------------- | --------------- | ---------------------- | ------------------------ |
| Appointment               | REQUESTED         | CONFIRMED, CHECKED_IN         | IN_PROGRESS     | COMPLETED              | CANCELLED, NO_SHOW       |
| Queue token               | WAITING           | CALLED                        | IN_SERVICE      | COMPLETED              | SKIPPED                  |
| Clinical note / diagnosis |                   | AMENDED                       | DRAFT, AI_DRAFT | FINALIZED              |                          |
| Invoice                   | ISSUED            | PARTIALLY_PAID                |                 | PAID                   | VOID                     |
| Procedure                 | PLANNED           | SCHEDULED                     | IN_PROGRESS     | COMPLETED              | CANCELLED                |
| Dispensing                |                   | OUT_FOR_DELIVERY              | PREPARED        | HANDED_OVER, DELIVERED | CANCELLED                |
| Insurance case            | ELIGIBILITY_CHECK | *_REQUESTED, CLAIM_SUBMITTED  |                 | *_APPROVED, SETTLED    | *_DENIED, CLAIM_REJECTED |
| Follow-up                 | PENDING           |                               | ESCALATED       | DONE                   | MISSED                   |
| Lead                      | NEW, CONTACTED    | NURTURING, APPOINTMENT_BOOKED |                 | CONVERTED              | LOST                     |
| Priority / urgency        | LOW, ROUTINE      | NORMAL                        | HIGH, URGENT    |                        | EMERGENCY                |
| Allergy severity          |                   | MILD                          | MODERATE        |                        | SEVERE                   |

### 2.4 Dark mode

Not planned for Clinical Ink. The direction is built on white paper and ink;
a dark variant would be a separate design exercise.

### 2.5 Banned

No second accent, no gradients, no drop shadows, no glass, no purple, no
pure black `#000000` (ink is `#0B0D12`), no coloured dots as decoration, no
warm beige paper.

---

## 3. Typography

| Role                      | Font                          | Why                                                                                                                                                            |
| ------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff UI and body         | **IBM Plex Sans** 400/500/600 | ui-ux-pro-max: "conveys trust, excellent for data". Neutral, technical, legible at 13 to 15px.                                                                 |
| Every number, token, code | **IBM Plex Mono** 400/500/600 | Tokens (012), times (19:02), vitals (128/84), money in tables, ICD codes, MRNs. Mono numerals line up in columns and read as data.                             |
| Big page titles (staff)   | **IBM Plex Serif** 500        | Only the one large title per page and the patient name on the consultation letterhead. A clinical record has a letterhead voice; same superfamily as the sans. |
| Patient app               | **IBM Plex Sans + Plex Mono** | The same fonts as staff, by decision (both apps must match). Readability comes from a 17px base and generous sizes, not a different face. No serif.            |

Both apps use the **same fonts** (a standing decision): IBM Plex Sans and Plex Mono everywhere, Plex Serif only for staff page titles. All load through `next/font/google` (self-hosted, no external request).

**Serif discipline (taste-skill):** serif is used for at most one title per
page, never for body text, labels, buttons or tables, and never in the
patient app.

**Scale** (staff-web, 15px base):

| Token         | Size / line height | Weight / font  | Use                                      |
| ------------- | ------------------ | -------------- | ---------------------------------------- |
| `title-serif` | 32 / 40            | 500 Plex Serif | Page title (one per page)                |
| `title`       | 20 / 28            | 600 Plex Sans  | Section title in a page                  |
| `body`        | 15 / 22            | 400            | Default text, table cells                |
| `label`       | 14 / 20            | 500            | Labels, emphasised cells                 |
| `small`       | 13 / 18            | 400            | Helper text, metadata                    |
| `caption`     | 12 / 16            | 500, tracked   | Table headers, tags (staff minimum 11px) |
| `figure`      | 28 to 48           | 500 Plex Mono  | KPI numbers, the token on Today          |

Rules: inputs use 16px text; numeric columns are right-aligned with tabular
figures; hierarchy comes from weight and the ink rule, not oversized headings;
prose (notes, instructions) max 72ch.

---

## 4. Space, layout, shape, elevation

**Spacing:** 4px grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).

**Layout:**

- Top bar 64px plus a 40px context row (section 6). No sidebar.
- Content max width 1440px; 32 to 40px side gutters; 20px on small screens.
- Pages are white sheets on the canvas, separated by space, not borders, when
  there is more than one.
- CSS Grid for page layouts. Breakpoints 640 / 768 / 1024 / 1280 / 1536;
  staff minimum 1024px (tablets at 768px must work), patient from 360px.

**Density:** table and agenda rows 44px (header 40px, a hairline between
rows); controls 40px (small 32px); inputs 40px; tabs 48px tall.

**Shape (taste-skill shape lock):**

- **Sharp.** Controls, inputs, tags and buttons: `2px` radius. Panels, tables,
  dialogs, drawers: `0`.
- Only exceptions: avatars are circles (a person, not a control), and the
  patient's phone-sized controls follow section 18.

**Elevation: none.**

- No drop shadows anywhere. Grouping is done with a 1px `--line` hairline,
  a 1px `--fg` **section rule** above each section heading, and white space.
- Dialogs and drawers: a 1px `--line` border on a white sheet over a
  `rgba(11, 13, 18, 0.45)` scrim. Menus and popovers: white with a 1px
  `--control` border.
- A boxed card is allowed only for a thing you can pick up and move (a queue
  token on a board), never as general decoration.

**Signature component, the Ruler:** a hairline axis with ticks that shows
position on a scale. Used for the doctor's schedule (seen = ink blocks,
booked = cobalt, free = outlined, closed = hatched, "now" = a red tick with
the time), the patient's visit progress (Check-in, Nurse, Doctor, Lab, Pay),
and lab results (normal band, value tick, labelled ends).

---

## 5. Icons

- **Library: Phosphor** (`@phosphor-icons/react`), **Light** weight
  everywhere; Regular only where a light glyph is under 16px. One family; no
  emoji, no hand-drawn SVGs.
- **Sparingly:** one icon per action or row type, never decorative. Tables
  mostly have none.
- **Sizes:** 16 (tables, tags), 20 (buttons, inputs), 24 (empty states).
- Decorative icons next to text get `aria-hidden`; icon-only buttons need an
  `aria-label` and a tooltip.

**Icon map:**

| Area                      | Icon                 |
| ------------------------- | -------------------- |
| Today / overview          | `SquaresFour`        |
| Patients                  | `Users`              |
| Registration              | `IdentificationCard` |
| Appointments              | `CalendarBlank`      |
| Queue                     | `ListNumbers`        |
| Vitals                    | `Heartbeat`          |
| Consultation / encounters | `Stethoscope`        |
| Prescriptions             | `Pill`               |
| Labs                      | `Flask`              |
| Procedures and surgery    | `Syringe`            |
| Pharmacy dispensing       | `FirstAidKit`        |
| Inventory                 | `Package`            |
| Home delivery             | `Truck`              |
| Billing                   | `Receipt`            |
| Payments                  | `CurrencyInr`        |
| Insurance                 | `ShieldCheck`        |
| Follow-ups                | `CalendarCheck`      |
| Messages                  | `ChatsCircle`        |
| Tasks                     | `CheckSquare`        |
| Notifications             | `Bell`               |
| Leads / campaigns         | `Megaphone`          |
| Reviews                   | `Star`               |
| Reports                   | `ChartLineUp`        |
| Audit log                 | `ClipboardText`      |
| Settings                  | `Gear`               |
| Search                    | `MagnifyingGlass`    |
| Sign out                  | `SignOut`            |

---

## 6. App shell, navigation and RBAC

### 6.1 Shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│ SereneMed staff │ Today  Queue 2  Consultations  Patients  More ▾ │ Search  ⌐ Bell  User │ 64px
├──────────────────────────────────────────────────────────────────────────┤
│ ▢ SereneMed Lounge · Indiranagar │ Wednesday 7 October 2026 │ 19:02 IST │ Patients / Pooja │  ● Open until 20:00 │ 40px
├──────────────────────────────────────────────────────────────────────────┤
│   Page title (Plex Serif)                                  [Primary action] │
│   ──────────────────────────────────────── (1px ink rule)                  │
│   Content: tables, documents, rulers                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

- **No sidebar.** A full-width top bar: wordmark, then the role's **primary
  tabs** (the items it uses most, up to six), then a **More** menu with the
  rest grouped by area, then search (⌘K / Ctrl+K), the notification bell
  and the user menu.
- The active tab has a **2px cobalt bar** under its label. Counts (queue
  waiting) sit after the label in Plex Mono.
- The **context row** carries the clinic, the date, the clinic-time clock
  and a breadcrumb on detail pages.
- On screens under 1024px the tabs collapse into a menu button that opens
  the same groups as a sheet.

### 6.2 RBAC rules (non-negotiable)

1. **The backend is the authority.** The UI hides what the role can't do
   for clarity, never as security. Every route is still enforced by
   `@RequirePermissions` on the API.
2. Navigation is generated from one config: each item declares the
   permission slug it needs, filtered with `can()` from
   `@serenemed/permissions`. **Hide, don't disable** items the role
   lacks. Primary tabs are chosen per role from the same config.
3. Actions inside a page (buttons, row menus) follow the same rule.
4. A deep link to a page the role can't access shows a **"You don't have
   access to this page"** state (403), never a blank page or a 404.
5. Each role lands on its own home page after login (table below).
6. Patients never see staff-web; staff never see patient-web.

### 6.3 Navigation map

Every item, its permission, and whether it is a **primary tab** for a role
(otherwise it lives under More, grouped by area).

| Area       | Item                   | Permission                              | Primary tab for                  | Landing for            |
| ---------- | ---------------------- | --------------------------------------- | -------------------------------- | ---------------------- |
|            | Today                  | any staff                               | everyone                         | Administrator          |
| Front desk | Patients               | `patient:read`                          | Reception, doctors, nurse, admin |                        |
|            | Appointments           | `appointment:read`                      | Reception, admin                 |                        |
|            | Queue                  | any station (see queue rule)            | Reception, nurse, doctors, desks | Reception, Nurse       |
|            | Doctor schedules       | `schedule:manage`                       |                                  |                        |
|            | Patient claims         | `patient:write`                         |                                  |                        |
| Clinical   | Consultations          | `patient-record:read-clinical`          | Doctors                          | Junior / Senior Doctor |
|            | Labs                   | `lab-order:write` or `lab-result:write` | Lab technician, doctors          | Lab Technician         |
|            | Procedures and surgery | `procedure:manage`                      | Surgery coordinator              | Surgery Coordinator    |
|            | Referrals              | `patient-record:read-clinical`          |                                  |                        |
|            | Follow-ups             | `follow-up:manage`                      | Nurse                            |                        |
|            | Templates              | `clinical-template:manage`              |                                  |                        |
| Pharmacy   | Dispensing             | `pharmacy:dispense`                     | Pharmacy                         | Pharmacy               |
|            | Inventory              | `inventory:manage`                      | Pharmacy                         |                        |
| Finance    | Billing                | `invoice:manage`                        | Billing                          | Billing                |
|            | Payments               | `payment:manage`                        | Billing                          |                        |
|            | Insurance              | `insurance:manage`                      | Insurance                        | Insurance              |
| Growth     | Leads                  | `lead:read`                             | Marketing                        | Marketing              |
|            | Campaigns              | `campaign:manage`                       | Marketing                        |                        |
|            | Reviews                | `review:manage`                         | Marketing                        |                        |
| Team       | Messages               | `message:manage`                        |                                  |                        |
|            | Tasks                  | any staff                               |                                  |                        |
| Admin      | Reports                | `report:read`                           | Administrator                    |                        |
|            | Audit log              | `audit-log:read`                        |                                  |                        |
|            | Integrations           | `integration:manage`                    |                                  |                        |
|            | Staff and roles        | `user:manage`                           |                                  |                        |

---

## 7. Components

Each app keeps its components in `components/ui` (staff) and `components/`
(patient), styled only with the tokens above. Accessible behaviour comes
from native elements (`<dialog>`, `<details>`, real radios and checkboxes)
and is never shipped in a default library look.

| Component                         | Notes and required states                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                            | primary (cobalt fill), secondary (1px `--control` outline), ghost, danger; 2px radius; sizes sm 32 / md 40; loading, disabled; one primary per view |
| IconButton                        | requires `aria-label` + tooltip                                                                                                                     |
| Input, Textarea, Select, Combobox | label above, helper below, error below in danger colour with icon; 16px text; `--border-control` border                                             |
| Checkbox, Radio, Switch           | 3:1 boundary contrast; label clickable                                                                                                              |
| DatePicker / DateTimePicker       | IST, `DD MMM YYYY` display                                                                                                                          |
| MoneyInput                        | rupees in the UI, converts to paise for the API                                                                                                     |
| Badge / StatusBadge               | square 2px tag (tint + text, optional 6px square marker); maps domain status via section 2.3; always text                                           |
| Section / Panel                   | no box: a 1px ink rule above a heading, hairline rows below; boxed only for movable things (queue tokens)                                           |
| DataTable                         | sticky header, sortable, row hover, selectable rows, compact toggle, pagination, empty / loading (skeleton rows) / error states                     |
| KPI tile                          | label, value (mono), delta with direction icon and text, optional sparkline                                                                         |
| Tabs                              | text tabs with a 2px cobalt bar under the active one, keyboard arrows                                                                               |
| Dialog                            | confirmation and short forms; danger variant for irreversible actions                                                                               |
| Drawer (right, 480px)             | record details without leaving the list                                                                                                             |
| Toast                             | transient success / info only; errors that need action stay inline                                                                                  |
| Banner                            | page-level warning / info (e.g. "Unsigned drafts on this visit")                                                                                    |
| Command palette                   | ⌘K patient search and navigation                                                                                                                    |
| Timeline                          | patient record history (visits, notes, results)                                                                                                     |
| QueueBoard                        | columns per station, token cards (the one boxed element), call / start / move actions                                                               |
| Ruler                             | section 4 signature: schedule, visit progress, lab range                                                                                            |
| Letterhead                        | the consultation document header: clinic, record type, patient name in Plex Serif, identifiers, token                                               |
| PatientBanner                     | see section 8                                                                                                                                       |
| EmptyState                        | icon, one-line explanation, the action that fills it                                                                                                |
| Skeleton                          | matches the final layout's shape; no generic spinners for content                                                                                   |

---

## 8. Clinical safety patterns

1. **Patient banner** on every clinical screen (consultation, vitals,
   prescribing, dispensing, procedures, billing for a patient): full
   name, age and sex, date of birth, phone, patient ID, and an
   **allergy line** under a 2px red rule ("Allergy Penicillin rash", or
   "No known allergies" in neutral). It stays visible on scroll.
2. **Two identifiers** (name + date of birth) shown wherever a patient
   is selected or confirmed (search results, queue call, dispensing).
3. **Drafts look like drafts.** Unsigned notes and diagnoses carry a
   warning badge "Draft, not signed" and a warning banner on the visit.
4. **Irreversible actions confirm** in a dialog that names the patient
   and the action: sign off, discharge, void invoice, refund, cancel
   procedure, dispense. The confirm button repeats the verb ("Sign
   off note"), never "OK".
5. **Procedures show their gate.** The start button stays unavailable
   until consent and every checklist item are done, with a visible list
   of what's missing.
6. **Never hide clinical text in truncation** without a way to expand
   it; never auto-save clinical sign-offs.

---

## 9. Data display

**Tables:** the main surface for every desk. Left-align text,
right-align numbers and money, dates as `07 Oct 2026, 14:30`. The first
column identifies the row (patient name, invoice number). Row actions
sit in a trailing menu (`DotsThreeVertical`); the primary action of the
row can also be a button.

**KPI tiles** (Today page): 4 per row at desktop, 2 under 1024px. Use
real numbers only; no decorative sparklines without data.

**Charts** (ui-ux-pro-max chart rules), with Recharts:

- Trend over time: line chart; fewer than 4 points becomes a stat tile.
- Target vs actual: bullet chart, never a gauge.
- Series: ink and cobalt first, then grey `#6B6E76`; different line
  styles (solid, dashed, dotted) so colour isn't the only difference;
  hairline gridlines, Plex Mono axis labels, direct labels; a data-table
  fallback for screen readers. Charts are drawn as plain SVG (no library).

---

## 10. Forms

- Label above the field, helper text below, error below in danger
  colour with an icon. No placeholder-as-label.
- Validate with the same Zod schemas the API uses
  (`@serenemed/validation`) through react-hook-form, so the UI and the
  backend reject the same things.
- Show the server's error message for 400 / 409 responses inline near
  the relevant field or at the top of the form.
- Long forms (registration, procedures) are split into titled sections,
  not wizards, unless the order really matters.
- Submit buttons show a loading state and are disabled while submitting
  (prevents double payments, double dispenses).

---

## 11. Feedback and states

| State               | Pattern                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Loading             | Skeleton shaped like the content; spinner only inside buttons                                          |
| Empty               | EmptyState with what goes here and the action to add it                                                |
| Error (load failed) | Inline panel with retry; never a blank page                                                            |
| Forbidden (403)     | "You don't have access to this page" + link to the role's home                                         |
| Not found (404)     | "This record doesn't exist or was removed"                                                             |
| Conflict (409)      | Inline explanation from the server ("This invoice is already void")                                    |
| Success             | Toast for transient confirmations; the updated record is the real confirmation                         |
| Real-time           | Queue and notifications refresh by polling (React Query `refetchInterval`) until a push channel exists |

---

## 12. Motion

- 150ms for hover / press, 200ms for drawers and dialogs, `ease-out`.
- Only `opacity` and `transform` are animated.
- `prefers-reduced-motion` turns all of it off.
- Press feedback: `scale(0.98)`. No looping animations, no scroll
  animations, no animated backgrounds.

---

## 13. Accessibility (WCAG 2.2 AA)

- Text contrast 4.5:1 (verified in section 2), control boundaries and
  meaningful icons 3:1.
- Visible focus ring on everything focusable (2px `--ring`, 2px offset);
  never remove outlines.
- Full keyboard operation: tables, menus, dialogs, queue board.
- Every input has a programmatic label; errors are linked with
  `aria-describedby`; status changes are announced (`aria-live`) for
  queue calls and toasts.
- Don't rely on colour alone: every status has text.
- Touch targets 44px on touch devices.

---

## 14. Content and formatting

- **Money:** `₹1,23,450.00` via `Intl.NumberFormat('en-IN', { style:
'currency', currency: 'INR' })`. The API sends paise; convert in one
  shared helper.
- **Dates and times:** clinic time (IST), `07 Oct 2026` and `14:30`
  (24-hour). Relative time ("3 min ago") only for notifications and
  messages.
- **Phone:** `+91 98765 43210`.
- **Names:** real Indian names in seed data and mockups (no "John Doe");
  realistic, uneven numbers (no `99.99%`).
- **Tone:** plain and direct. Buttons are verbs ("Check in", "Record
  payment", "Sign off note"). No "Oops", no filler words.
- **No em dash or en dash** in any UI text (taste-skill rule). Use a
  comma, a period, or a hyphen.

---

## 14a. Polish layer

- **Sign in** is a white page with the wordmark, the Plex Serif line "Clinic
  staff sign in", and the form on a hairline-ruled sheet. No brand panel.
- **People get avatars:** initials in a circle with a neutral tint (the only
  round shape on staff screens).
- **Page headers:** an optional eyebrow (the date or the record type), the
  Plex Serif title, a one-line description, then the ink rule.
- **Figures:** headline numbers (patients, waiting, token) in Plex Mono, set
  large, with the label above in small grey text; no tiles, no icons in
  circles.
- **Today** for doctors is a master–detail: the day's agenda table on the
  left, the selected patient's sheet on the right, the schedule ruler above,
  and the "Needs your signature" row below.
- **Consultation** is a document: letterhead, numbered sections (1.
  Subjective to 5. Diagnosis) with margin notes, and a sticky right rail
  for orders and the finish actions.

## 15. Implementation plan

**Tokens:** each app's `app/globals.css` defines the CSS variables of
section 2 under `:root` and maps them into Tailwind v4 with `@theme inline`
(`bg-surface`, `text-fg-muted`, `border-control`, `bg-primary`,
`rounded-control`, `rounded-panel`). Components never use raw hex or raw
palette classes. Version 2 changes values, not names, so most screens
restyle from the token swap alone; a sweep then removes the remaining
hard-coded radius and shadow classes.

**Fonts:** `next/font/google` (`IBM_Plex_Sans`, `IBM_Plex_Mono`,
`IBM_Plex_Serif` for staff; `IBM_Plex_Sans` and `IBM_Plex_Mono` for
patients: the same faces in both apps).

**Build order (version 2):**

1. Tokens, fonts and shape in both apps.
2. Top-bar shell with role tabs and More menu.
3. Doctor Today (master–detail, schedule ruler, signature inbox).
4. Consultation as a document.
5. Patient app restyle.
6. Backend for details in the reference images: visit-stage history,
   patient number (MRN), clinic opening hours.

---

## 16. Pre-delivery checklist (every screen)

- [ ] Uses tokens only (no raw hex, no raw palette classes in components)
- [ ] Only the cobalt accent; status colours only for status, with text
- [ ] No shadows; radius 2px on controls, 0 on panels; Plex Serif only on the page title
- [ ] Phosphor icons only, consistent sizes, labelled icon buttons
- [ ] Loading, empty, error, forbidden states all designed
- [ ] Nav items and actions filtered by permission; 403 page works
- [ ] Clinical screens show the patient banner with allergies
- [ ] Irreversible actions confirm with patient name and verb
- [ ] Keyboard-only walkthrough works; focus ring visible
- [ ] Contrast 4.5:1 text, 3:1 controls; no colour-only meaning
- [ ] Works at 1024px and 768px (staff), 375px (patient)
- [ ] `prefers-reduced-motion` respected
- [ ] Money in INR via the shared helper; dates in IST
- [ ] No em dashes, no placeholder-as-label, no "John Doe"

---

## 17. Open decisions

- **Logo:** the official SereneMed logo (SVG) is still needed; until then
  the wordmark is set in Plex Sans 600 with "staff" in Plex Mono.
- **Dark mode:** not planned for Clinical Ink (section 2.4).
- **Results review step** shown in the reference image ("Dr. Meera reviewed
  these") needs the product decision in `docs/architecture/open-questions.md`
  #18 before it is built.

## 18. Patient app (`apps/patient-web`)

The staff app is a desk tool used all day. The patient app is opened a
few times a month, on a phone, often by someone who is unwell, anxious,
older or reading in a second language. Same brand, different job.

### 18.1 Design read

Reading this as: a mobile-first health companion for patients and their
families, in the same Clinical Ink language as staff (white, ink, hairline
rules, one cobalt accent, large Plex Mono figures), in the same IBM Plex
fonts, set larger for reading comfort. Dials: variance 3, motion 2,
density 3.

From the ui-ux-pro-max run (`patient portal healthcare clinic mobile
calm trustworthy`): kept the spacious density and subtle motion. Its font
suggestion (Atkinson Hyperlegible) was used in version 1 and replaced in
version 2 by the same IBM Plex as staff, at the user's request. Rejected **neumorphism** (the tool itself flags it
high accessibility risk: low-contrast edges), the landing-page
"hero + testimonials" pattern (this is a signed-in app, not marketing)
and its cyan palette. Version 2 replaced the teal with the Clinical Ink cobalt.

### 18.2 What a patient opens the app to do (in order)

1. **"Where am I in the queue?"** while at the clinic: token, desk,
   people ahead. This is the most anxious moment, so it owns the top of
   Home when it applies.
2. **"When is my next appointment?"** date, time, doctor, what to bring.
3. **"What do I take, and how?"** medicines in plain words, with how
   long the course runs.
4. **"Are my results back, and are they OK?"** each value with its
   normal range, said in words as well as colour.
5. **"Do I owe anything?"** outstanding bills and receipts.
6. **"Can I ask the clinic something?"** messages.

Home answers 1, 2 and anything needing attention (unpaid bill, new
result, reply from the clinic) without a tap. Everything else is one tap
away.

### 18.3 Rules

- **Plain language.** "Your results", not "Lab orders". "Once a week for
  8 weeks", not "freq: QW, 56d". No ICD codes in headings (shown small,
  secondary). No internal statuses ("IN_SERVICE" becomes "With the
  doctor now").
- **Never colour alone.** A high result says "Above the normal range"
  next to the amber marker.
- **Reassure, don't diagnose.** Results carry "Your doctor will go
  through these with you." The app never interprets beyond in/out of
  range.
- **No fake features.** Online payment and self-booking have no backend
  yet, so the app says "Pay at the clinic desk" and "Message us to book
  or change", never a dead button.
- **Two identifiers** are not needed (the patient only sees themselves),
  but the name and date of birth sit on the Me page so a family member
  using the phone can confirm whose record it is.

### 18.4 Layout and navigation

- Mobile first from 360px. One column, `max-w-2xl` centred on larger
  screens, 24px side gutters.
- A large title at the top of every tab page, then **lists divided by
  hairline rules**, not stacked cards. A 1px ink rule opens each section.
- **Bottom tab bar** with **text-only labels** (Home, Visits, Records,
  Messages, Me); the active tab gets a 2px cobalt bar along its top edge.
  From `lg` the same tabs move to a top bar. Detail pages have their own
  route so the back button works.

### 18.5 Tokens (in addition to section 2)

| Token / rule      | Patient app                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| Body text         | 17px / 1.55 IBM Plex Sans (`html` font-size 106.25%), same font as staff |
| Title             | 28px / 1.2, Plex Sans 600 (no serif in the patient app)                  |
| Figures           | IBM Plex Mono: the token (64 to 96px), result values (40 to 72px), times |
| Small text        | never under 14px                                                         |
| Sections          | no cards: 1px ink rule above, hairline rows, white space                 |
| Controls, buttons | 2px radius, 48px minimum height; primary is a cobalt fill                |
| Tags / status     | square 2px tags with a word, as staff                                    |
| Live visit        | the token, a "Live" tag, and the visit-progress Ruler (Check-in to Pay)  |
| Motion            | 150 to 200ms fades; none under reduced motion                            |

### 18.6 Pages

| Route        | Purpose                                                           |
| ------------ | ----------------------------------------------------------------- |
| `/login`     | Sign in, links to sign up and to activate a clinic-issued account |
| `/home`      | Live token, next appointment, things needing attention, shortcuts |
| `/visits`    | Upcoming and past visits, with the doctor                         |
| `/medicines` | Current medicines first, then past courses                        |
| `/results`   | Test results by date, each value against its normal range         |
| `/bills`     | Outstanding first, then paid receipts                             |
| `/me`        | Name, date of birth, contact, allergies and conditions, sign out  |
| `/messages`  | (next) conversations with the clinic                              |
