'use client';

/**
 * DEVELOPMENT ONLY. One click signs in as each role of the demo clinic
 * (apps/api/scripts/seed-demo.ts) so the access rules can be shown live.
 * The login page renders this only when NODE_ENV !== 'production', so the
 * production bundle never contains it or the demo password; the seed
 * script and the API boot guard refuse production on their side as well.
 */
const DEMO_PASSWORD = 'dev-password-123';

const DEMO_ROLES: Array<{ email: string; label: string }> = [
  { email: 'admin@demo.local', label: 'Administrator' },
  { email: 'reception@demo.local', label: 'Reception' },
  { email: 'nurse@demo.local', label: 'Nurse' },
  { email: 'junior@demo.local', label: 'Junior doctor' },
  { email: 'senior@demo.local', label: 'Senior doctor' },
  { email: 'pharmacy@demo.local', label: 'Pharmacy' },
  { email: 'billing@demo.local', label: 'Billing' },
  { email: 'lab@demo.local', label: 'Lab technician' },
  { email: 'insurance@demo.local', label: 'Insurance' },
  { email: 'marketing@demo.local', label: 'Marketing' },
  { email: 'surgery@demo.local', label: 'Surgery coordinator' },
];

export function DemoLogins({
  onPick,
  disabled,
}: {
  onPick: (email: string, password: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-8 rounded-panel border border-dashed border-control p-4">
      <p className="text-[13px] font-semibold text-fg">Demo roles (development only)</p>
      <p className="mb-3 mt-0.5 text-xs text-fg-subtle">Click a role to sign in as them.</p>
      <div className="flex flex-wrap gap-2">
        {DEMO_ROLES.map((role) => (
          <button
            key={role.email}
            type="button"
            disabled={disabled}
            onClick={() => onPick(role.email, DEMO_PASSWORD)}
            className="h-8 cursor-pointer rounded-control border border-line bg-surface px-3 text-[13px] font-medium text-fg-muted transition-colors hover:border-control hover:bg-surface-muted hover:text-fg disabled:opacity-50"
          >
            {role.label}
          </button>
        ))}
      </div>
    </div>
  );
}
