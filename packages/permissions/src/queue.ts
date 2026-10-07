import { StaffRole } from '@serenemed/types';
import type { Permission } from './permissions';
import { roleHasPermission } from './matrix';

/** The desks a token passes through during a visit, in their usual order. */
export const QUEUE_STATIONS = [
  'VITALS',
  'JUNIOR_DOCTOR',
  'SENIOR_DOCTOR',
  'LAB',
  'BILLING',
  'PHARMACY',
] as const;

export type QueueStationKey = (typeof QUEUE_STATIONS)[number];

/**
 * The permission that makes someone a desk for each station. A role
 * sees, calls and hands on the tokens waiting at the stations it serves,
 * so a patient sent to Pharmacy shows up for the pharmacist. `queue:manage`
 * (front desk, administrators) sees and moves every token.
 */
export const STATION_PERMISSION: Record<QueueStationKey, Permission> = {
  VITALS: 'vitals:write',
  JUNIOR_DOCTOR: 'clinical-note:write-draft',
  SENIOR_DOCTOR: 'clinical-note:sign-off',
  LAB: 'lab-result:write',
  BILLING: 'invoice:manage',
  PHARMACY: 'pharmacy:dispense',
};

/** Stations this role works at (its own desks), in visit order. */
export function stationsServedBy(role: StaffRole): QueueStationKey[] {
  return QUEUE_STATIONS.filter((station) => roleHasPermission(role, STATION_PERMISSION[station]));
}

/** True when the role can see the whole board and move any token. */
export function managesWholeQueue(role: StaffRole): boolean {
  return roleHasPermission(role, 'queue:manage');
}

/** True when the role has anything to do with the queue at all. */
export function usesQueue(role: StaffRole): boolean {
  return managesWholeQueue(role) || stationsServedBy(role).length > 0;
}

/** Whether this role may act on a token currently at `station`. */
export function canActAtStation(role: StaffRole, station: QueueStationKey): boolean {
  return managesWholeQueue(role) || stationsServedBy(role).includes(station);
}
