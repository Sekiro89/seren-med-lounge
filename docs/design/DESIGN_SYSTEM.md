# SereneMed Lounge Design System

The single source of truth for how the SereneMed frontends look and behave
(`apps/staff-web` first, `apps/patient-web` second). Every screen, component
and review refers back to this file. If a decision isn't covered here, add
it here first, then build it.

Built with the two design skills installed in `.claude/skills/`:
`ui-ux-pro-max` (design-system generation, palette and typography data,
UX and accessibility rules) and `taste-skill` (anti-generic visual
discipline). Where they disagree, this document records the decision.

---

## 1. Design read

**Reading this as:** a clinic operations workspace for clinical and
administrative staff (reception, nurses, doctors, pharmacy, billing,
insurance, marketing, admins), used all day on desktop at a desk or
counter, with a calm, trust-first, data-dense clinical language, leaning
toward Tailwind v4 design tokens, Phosphor icons and one restrained teal
brand colour.

**Style family:** Data-Dense Dashboard (ui-ux-pro-max: low accessibility
risk, light and dark supported). Explicitly _not_ Neumorphism (the
skill's first healthcare suggestion, rejected for high accessibility
risk), not glassmorphism, not marketing-page patterns.

**Dials** (taste-skill, 1 to 10):

| Dial               | Value | Why                                                                  |
| ------------------ | ----- | -------------------------------------------------------------------- |
| `DESIGN_VARIANCE`  | 3     | Regulated, trust-first product. Predictable, symmetric layouts.      |
| `MOTION_INTENSITY` | 2     | Motion only confirms state changes. Nothing decorative.              |
| `VISUAL_DENSITY`   | 6     | Staff scan queues, tables and records all day. Dense, never cramped. |

**Principles** (in priority order when they conflict):

1. **Patient safety first.** The right patient, the right record, the
   right action. Identity and allergies are always visible on clinical
   screens; irreversible clinical actions always confirm.
2. **Show only what the role can do.** Navigation and actions are driven
   by permissions (section 6). Nobody sees a button they can't use.
3. **Calm over clever.** One accent colour, quiet surfaces, status colour
   only where it means something.
4. **Fast to scan.** Tabular numbers, consistent column order, the most
   important item top-left.
5. **Every state is designed.** Loading, empty, error, forbidden and
   success are part of the spec, not afterthoughts.

---

## 2. Colour

### 2.1 Brand scale (`serene`, teal)

Taken from the SereneMed logo's deep teal. This is the **only** accent
colour in the product (taste-skill colour lock).

| Token        | Hex       | Use                                                 |
| ------------ | --------- | --------------------------------------------------- |
| `serene-50`  | `#F0F9F8` | Selected row / selected nav background              |
| `serene-100` | `#D8F0EE` | Hover tint on brand surfaces                        |
| `serene-200` | `#B3E0DD` | Brand-tinted borders, chart fill                    |
| `serene-300` | `#7FC8C5` | Dark-mode primary button                            |
| `serene-400` | `#47A9A7` | Dark-mode links and focus ring                      |
| `serene-500` | `#218C8B` | Chart series 1                                      |
| `serene-600` | `#12706F` | **Primary**: buttons, links, focus ring, active nav |
| `serene-700` | `#0F5A5A` | Primary hover / pressed                             |
| `serene-800` | `#0E4A4A` | Text on `serene-50`                                 |
| `serene-900` | `#0C3D3E` |                                                     |
| `serene-950` | `#062627` | Sidebar background (optional dark sidebar)          |

### 2.2 Neutrals

Tailwind **slate** only (cool grey, matches teal). Never mix in zinc,
stone or warm greys.

### 2.3 Semantic tokens (light)

Components use these tokens, never raw hex or raw Tailwind palette names.

| Token              | Value                | Contrast              | Use                                               |
| ------------------ | -------------------- | --------------------- | ------------------------------------------------- |
| `--bg`             | `#F7F9FA`            |                       | App background                                    |
| `--surface`        | `#FFFFFF`            |                       | Cards, tables, panels, inputs                     |
| `--surface-muted`  | slate-100 `#F1F5F9`  |                       | Table header, secondary panels                    |
| `--text`           | slate-900 `#0F172A`  | 17.9:1 on surface     | Body and headings                                 |
| `--text-muted`     | slate-600 `#475569`  | 7.6:1                 | Secondary text, labels                            |
| `--text-subtle`    | slate-500 `#64748B`  | 4.8:1                 | Timestamps, helper text (minimum)                 |
| `--border`         | slate-200 `#E2E8F0`  | decorative            | Dividers, card outlines                           |
| `--border-control` | slate-500 `#64748B`  | 4.8:1                 | **Input, select, checkbox borders** (must be 3:1) |
| `--primary`        | serene-600 `#12706F` | white text 5.9:1      | Primary actions                                   |
| `--primary-hover`  | serene-700 `#0F5A5A` | white text 8.0:1      |                                                   |
| `--primary-subtle` | serene-50            | serene-800 text 9.4:1 | Selected states                                   |
| `--ring`           | serene-600           | 5.9:1                 | Focus ring (2px, 2px offset)                      |
| `--danger`         | red-600 `#DC2626`    | white text 4.8:1      | Destructive buttons                               |

**Rule found while verifying:** slate-200 and slate-400 fail the 3:1
non-text contrast that form controls need (1.2:1 and 2.6:1). They may
only be used for decorative dividers, never for the border of something
the user has to find and click.

### 2.4 Status colours

Used **only** to convey state, always paired with a text label or icon
(never colour alone). Badge = tinted background + darker text.

| Status  | Text                | Background          | Contrast |
| ------- | ------------------- | ------------------- | -------- |
| Success | green-700 `#15803D` | green-50 `#F0FDF4`  | 4.8:1    |
| Warning | amber-800 `#92400E` | amber-50 `#FFFBEB`  | 6.8:1    |
| Danger  | red-700 `#B91C1C`   | red-50 `#FEF2F2`    | 5.9:1    |
| Info    | sky-800 `#075985`   | sky-50 `#F0F9FF`    | 7.1:1    |
| Neutral | slate-700 `#334155` | slate-100 `#F1F5F9` | 9.5:1    |

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

### 2.5 Dark mode tokens

Default is **light**. Dark mode ships after the light workspace is done,
via the same tokens (no `dark:` classes scattered in components).

| Token              | Value                                 | Contrast                                 |
| ------------------ | ------------------------------------- | ---------------------------------------- |
| `--bg`             | slate-950 `#020617`                   |                                          |
| `--surface`        | slate-900 `#0F172A`                   |                                          |
| `--text`           | slate-100 `#F1F5F9`                   | 16.3:1                                   |
| `--text-muted`     | slate-400 `#94A3B8`                   | 7.0:1                                    |
| `--border`         | slate-800                             | decorative                               |
| `--border-control` | slate-500                             | must stay 3:1 (slate-700 fails at 1.7:1) |
| `--primary`        | serene-300 `#7FC8C5`, text serene-950 | 8.4:1                                    |
| links / ring       | serene-400 `#47A9A7`                  | 6.4:1                                    |
| Status badges      | `*-300` text on `*-950` background    | 8.3 to 10.6:1                            |

### 2.6 Banned

No purple or "AI" gradients, no neon glows, no gradient text, no pure
black `#000000`, no second accent colour, no coloured dots used as
decoration (taste-skill AI tells).

---

## 3. Typography

| Role                           | Font                  | Why                                                                                                                                                                |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI and body                    | **Geist Sans**        | Compact, highly legible at 13 to 14px, tabular figures. Loaded with `next/font` (self-hosted, no external request). Taste-skill pairing; avoids the default Inter. |
| Numbers, IDs, codes            | **Geist Mono**        | Invoice numbers, token numbers, batch numbers, amounts in tables.                                                                                                  |
| Patient portal body (optional) | Atkinson Hyperlegible | ui-ux-pro-max healthcare recommendation for patient-facing, accessibility-critical text. Decide when patient-web is redesigned.                                    |

No serif anywhere (taste-skill: not for dashboards).

**Scale** (staff-web; 14px base because this is a dense desk tool):

| Token              | Size / line height | Weight    | Use                                           |
| ------------------ | ------------------ | --------- | --------------------------------------------- |
| `text-display`     | 24 / 32            | 600       | Page title (one per page)                     |
| `text-title`       | 18 / 28            | 600       | Section / card title                          |
| `text-body`        | 14 / 20            | 400       | Default UI text, table cells                  |
| `text-body-strong` | 14 / 20            | 500       | Labels, emphasised cells                      |
| `text-small`       | 13 / 18            | 400       | Helper text, metadata                         |
| `text-caption`     | 12 / 16            | 500       | Badges, table headers (never smaller than 12) |
| `text-kpi`         | 28 / 32            | 600, Mono | KPI numbers                                   |

Rules:

- Form inputs use **16px** text so mobile browsers don't zoom.
- All numeric columns use `font-variant-numeric: tabular-nums` and are
  right-aligned.
- Hierarchy comes from weight and colour, not oversized headings.
- Max reading width 65ch for prose (notes, instructions).

---

## 4. Space, layout, shape, elevation

**Spacing:** 4px grid. Use only 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Base text size is 15px (rem-based), so every space and size scales with it.

**Layout:**

- Sidebar 248px (collapsible to 64px icon rail), top bar 56px.
- Content max width 1440px, 40px page side padding on desktop, 20px on small screens, 40px above the page title block and 40px between a page header and its content.
- Gaps between cards and sections: 24px (gap-6); between a card's header and body 24px side padding; KPI tiles 24px padding.
- CSS Grid for page layouts, never percentage flex maths.
- Breakpoints: 640 / 768 / 1024 / 1280 / 1536. Desktop-first for
  staff-web (minimum supported width 1024px; tablets at the counter must
  work at 768px); patient-web is mobile-first from 375px.

**Density:**

- Table rows 52px (header 44px, 24px side padding). A tighter "compact" mode may come later for power users; it is not the default.
- Buttons 40px (small 36px), inputs and selects 44px, sidebar items 40px, top bar 64px.

**Shape (one documented rule, taste-skill shape lock):**

- Buttons, inputs, selects: `8px` radius.
- Cards, panels, dialogs, drawers: `12px` radius.
- Status badges only: full pill.

**Elevation:** border first, shadow rarely.

- Cards: 1px `--border` plus `shadow-card` (`0 1px 2px` and `0 1px 3px` at 4% slate), a hair of lift, never a heavy shadow.
- Interactive cards (KPI tiles that link to a desk) gain `shadow-card-hover` and a faint brand border on hover.
- Popovers, menus: `0 8px 24px rgba(15, 23, 42, 0.08)` (slate-tinted, never black).
- Dialogs: the same plus a `rgba(15, 23, 42, 0.4)` scrim.
- Use a card only when elevation means hierarchy; otherwise group with
  spacing or a divider.

---

## 5. Icons

- **Library: Phosphor** (`@phosphor-icons/react`). The curated set used
  by both skills. One family only; no Lucide, no hand-drawn SVGs, no
  emoji.
- **Weight:** `regular` everywhere; `fill` only for the active nav item
  and selected toggles.
- **Sizes:** 16 (inside tables, badges), 20 (buttons, inputs, default),
  24 (nav, empty states).
- **Accessibility:** decorative icons next to text get `aria-hidden`;
  icon-only buttons must have an `aria-label` and a tooltip.

**Icon map** (all verified to exist in Phosphor):

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
┌──────────────┬──────────────────────────────────────────────────────┐
│ SereneMed    │  Clinic switcher   Search patients (⌘K)   Bell  User  │  56px
│              ├──────────────────────────────────────────────────────┤
│ Today        │  Page title                         [Primary action] │
│ ─ Front desk │  Filters / tabs                                      │
│   Patients   │                                                      │
│   Queue      │  Content (tables, boards, records)                   │
│ ─ Clinical   │                                                      │
│   ...        │                                                      │
│ (248px)      │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

- Global patient search in the top bar (keyboard shortcut ⌘K / Ctrl+K).
- Notification bell shows the unread count from `GET /notifications`.
- User menu shows name, role and sign out.

### 6.2 RBAC rules (non-negotiable)

1. **The backend is the authority.** The UI hides what the role can't do
   for clarity, never as security. Every route is still enforced by
   `@RequirePermissions` on the API.
2. Navigation is generated from one config: each item declares the
   permission slug it needs, filtered with `can()` from
   `@serenemed/permissions`. **Hide, don't disable** items the role
   lacks.
3. Actions inside a page (buttons, row menus) follow the same rule.
4. A deep link to a page the role can't access shows a **"You don't have
   access to this page"** state (403), never a blank page or a 404.
5. Each role lands on its own home page after login (table below).
6. Patients never see staff-web; staff never see patient-web.

### 6.3 Navigation map

| Group      | Item                   | Permission                              | Default landing for    |
| ---------- | ---------------------- | --------------------------------------- | ---------------------- |
|            | Today                  | any staff                               | Administrator          |
| Front desk | Patients               | `patient:read`                          |                        |
|            | Appointments           | `appointment:read`                      |                        |
|            | Queue                  | `queue:manage`                          | Reception, Nurse       |
|            | Patient claims         | `patient:write`                         |                        |
| Clinical   | Consultations          | `patient-record:read-clinical`          | Junior / Senior Doctor |
|            | Labs                   | `lab-order:write` or `lab-result:write` | Lab Technician         |
|            | Procedures and surgery | `procedure:manage`                      | Surgery Coordinator    |
|            | Referrals              | `patient-record:read-clinical`          |                        |
|            | Follow-ups             | `follow-up:manage`                      |                        |
|            | Templates              | `clinical-template:manage`              |                        |
| Pharmacy   | Dispensing             | `pharmacy:dispense`                     | Pharmacy               |
|            | Inventory              | `inventory:manage`                      |                        |
| Finance    | Billing                | `invoice:manage`                        | Billing                |
|            | Insurance              | `insurance:manage`                      | Insurance              |
| Growth     | Leads                  | `lead:read`                             | Marketing              |
|            | Campaigns              | `campaign:manage`                       |                        |
|            | Reviews                | `review:manage`                         |                        |
| Team       | Messages               | `message:manage`                        |                        |
|            | Tasks                  | any staff                               |                        |
|            | Doctor schedules       | `schedule:manage`                       |                        |
| Admin      | Staff and roles        | `user:manage`                           |                        |
|            | Audit log              | `audit-log:read`                        |                        |

---

## 7. Components

Built once in `packages/ui`, used by both apps. Accessible behaviour
(focus trapping, keyboard, ARIA) comes from **Radix UI primitives**,
styled with our tokens (never shipped in a default library look).

| Component                         | Notes and required states                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                            | primary, secondary (outline), ghost, danger; sizes sm 32 / md 36; loading (spinner replaces icon, label stays), disabled; one primary per view |
| IconButton                        | requires `aria-label` + tooltip                                                                                                                |
| Input, Textarea, Select, Combobox | label above, helper below, error below in danger colour with icon; 16px text; `--border-control` border                                        |
| Checkbox, Radio, Switch           | 3:1 boundary contrast; label clickable                                                                                                         |
| DatePicker / DateTimePicker       | IST, `DD MMM YYYY` display                                                                                                                     |
| MoneyInput                        | rupees in the UI, converts to paise for the API                                                                                                |
| Badge / StatusBadge               | pill; maps domain status via section 2.4; always text                                                                                          |
| Card / Panel                      | 12px radius, border, no shadow                                                                                                                 |
| DataTable                         | sticky header, sortable, row hover, selectable rows, compact toggle, pagination, empty / loading (skeleton rows) / error states                |
| KPI tile                          | label, value (mono), delta with direction icon and text, optional sparkline                                                                    |
| Tabs                              | underline style, keyboard arrows                                                                                                               |
| Dialog                            | confirmation and short forms; danger variant for irreversible actions                                                                          |
| Drawer (right, 480px)             | record details without leaving the list                                                                                                        |
| Toast                             | transient success / info only; errors that need action stay inline                                                                             |
| Banner                            | page-level warning / info (e.g. "Unsigned drafts on this visit")                                                                               |
| Command palette                   | ⌘K patient search and navigation                                                                                                               |
| Timeline                          | patient record history (visits, notes, results)                                                                                                |
| QueueBoard                        | columns per station, token cards, call / start / move actions                                                                                  |
| PatientBanner                     | see section 8                                                                                                                                  |
| EmptyState                        | icon, one-line explanation, the action that fills it                                                                                           |
| Skeleton                          | matches the final layout's shape; no generic spinners for content                                                                              |

---

## 8. Clinical safety patterns

1. **Patient banner** on every clinical screen (consultation, vitals,
   prescribing, dispensing, procedures, billing for a patient): full
   name, age and sex, date of birth, phone, patient ID, and an
   **allergy strip** (red danger badge listing severe and moderate
   allergies, or "No known allergies" in neutral). It stays visible on
   scroll.
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
- Series colours: serene-500, slate-500, amber-600, sky-600, with
  different line styles (solid, dashed, dotted) so colour isn't the only
  difference; direct labels; a data-table fallback for screen readers.

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

## 14a. Polish layer (added after the first review)

Small touches that make the product feel finished without adding a second
accent or any decoration:

- **Sign in** is a split screen: a deep-teal brand panel (`--brand-deep`,
  serene-900) with the promise and three plain benefits, and the form on a
  calm background. The panel is the only large teal surface in the product.
  Password has a show/hide toggle.
- **People get avatars.** Initials in a tinted circle (`Avatar`,
  `PersonCell`); the tint is derived from the name, so a person keeps the
  same colour on every screen. Titles ("Dr.") are skipped for initials.
- **Page headers** may carry one small `eyebrow` line (the date) above the
  title. Not more than one per page.
- **KPI tiles** carry a tone for their icon (primary, info, warning,
  success, danger) and link to the desk that owns the number.
- **Top bar** has a global patient search (Ctrl/Cmd+K), the notification
  bell and the account menu. **Sidebar** ends with a clinic card, and the
  active item has a short brand bar at its left edge.
- **Today** is a briefing, not a wall of numbers: tiles, a time-ordered
  schedule that highlights who is next, queue bars, and a "Needs
  attention" list that links straight to the work.

## 15. Implementation plan

**Tokens:** one file, `packages/ui/src/styles/tokens.css`, using
Tailwind v4 `@theme` with the CSS variables from section 2, imported by
both apps' `globals.css`. Components use semantic utilities
(`bg-surface`, `text-muted`, `border-control`, `bg-primary`), never raw
palette classes.

**Dependencies to add** (none are installed yet):

```bash
pnpm --filter @serenemed/ui add @phosphor-icons/react @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu @radix-ui/react-popover @radix-ui/react-tabs \
  @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-checkbox
pnpm --filter staff-web add recharts
```

Fonts come from `next/font/google` (`Geist`, `Geist_Mono`); no new
package.

**Build order:**

1. Tokens + fonts + app shell (sidebar, top bar, RBAC navigation).
2. Core components: Button, inputs, Badge, DataTable, Dialog, Drawer,
   Toast, EmptyState, Skeleton.
3. Front desk: patient search, registration, queue board.
4. Clinical: consultation workspace (patient banner, vitals, notes,
   prescriptions, labs).
5. Pharmacy and billing desks.
6. Remaining workspaces, then dark mode.

---

## 16. Pre-delivery checklist (every screen)

- [ ] Uses tokens only (no raw hex, no slate/teal classes in components)
- [ ] Only the serene accent; status colours only for status, with text
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

- **Dark mode timing:** tokens are defined; ship after the light workspace.
- **Patient portal font:** Geist vs Atkinson Hyperlegible for body text.
- **Sidebar style:** light sidebar (default) vs dark `serene-950`
  sidebar. Both pass contrast.
- **Logo:** the official SereneMed logo file is needed (SVG) for the
  shell; until then the wordmark is set in Geist 600.
