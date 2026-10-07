'use client';

/**
 * Shown once, next to where the patient types (the new-message form and
 * the reply box), so it is read at the moment it matters and not twice.
 */
export function EmergencyNote() {
  return (
    <p className="border-l-2 border-primary py-1 pl-4 text-fg">
      The clinic replies during opening hours. This is not for emergencies.{' '}
      <strong className="font-semibold">
        For an emergency, call <span className="font-mono">108</span>.
      </strong>
    </p>
  );
}
