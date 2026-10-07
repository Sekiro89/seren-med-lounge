# Pharmacy / Inventory

```
PRESCRIPTION → PHARMACY → DISPENSING → INVENTORY MOVEMENT → PATIENT RECORD
```

## Modules involved

`prescriptions` (clinical spine), `pharmacy`, `inventory`.

## Rules

- Prescription and pharmacy fulfilment stay connected: a `Dispensing`
  record always references the `PrescriptionItem` it fulfills — pharmacy
  never records a dispense against a free-text drug name.
- Inventory uses **FEFO** (first-expiry-first-out), not FIFO, given
  medication expiry constraints — the eventual `StockMovement` allocation
  logic picks the soonest-expiring batch first.
- Home delivery/dispatch is a status on `Dispensing`, not a separate
  disconnected fulfilment record.

## Status

Implemented (`inventory`, `pharmacy` modules; `pharmacy.e2e-spec.ts`):
medication catalogue with reorder levels; batch receipt (repeat batch tops
up, mismatched expiry refused, expired refused); stock adjustments and
wastage; an append-only `StockMovement` ledger; FEFO allocation across
unexpired batches under row locks (concurrent dispensing of the last units
can't oversell; CHECK keeps `quantityOnHand >= 0`); dispensing against a
`PrescriptionItem` with PICKUP (PREPARED → HANDED_OVER) or HOME_DELIVERY
(PREPARED → OUT_FOR_DELIVERY → DELIVERED); cancelling a PREPARED dispense
returns stock to the exact batches; `GET /pharmacy/pending` worklist; low
stock and expiring lists; a PHARMACY_PREPARE in-app alert when a
prescription is issued. Not built: dispensing doesn't add invoice lines
automatically, and over-dispensing can't be checked because prescription
items have no total quantity (open-questions.md#16).
