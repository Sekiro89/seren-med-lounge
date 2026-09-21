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

`pharmacy` and `inventory` are lean module shells — no catalogue,
dispensing, or stock-movement logic implemented yet.
