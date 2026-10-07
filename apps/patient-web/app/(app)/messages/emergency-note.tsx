'use client';

/**
 * Shown once, next to where the patient types (the new-message form and
 * the reply box), so it is read at the moment it matters and not twice.
 */
export function EmergencyNote() {
  return (
    <p className="rounded-2xl bg-info-bg px-5 py-4 text-info-fg">
      The clinic replies during opening hours. This is not for emergencies.{' '}
      <strong>For an emergency, call 108.</strong>
    </p>
  );
}
