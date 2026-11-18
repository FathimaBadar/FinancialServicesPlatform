/**
 * Shared boot primitives — fail-closed route guarding lives in portal-app (GuardedScreen),
 * which checks the same registry; these helpers render the shared boot states.
 */
export function FullscreenSpinner({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-3 text-dim">
        <Spinner />
        <span className="text-sm">{label}…</span>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <span
      aria-label="loading"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line-strong"
      style={{ borderTopColor: 'var(--portal-accent)' }}
    />
  );
}
