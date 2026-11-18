/**
 * Fail-closed tampered-UI boundary (plans/signed-portal-delivery-plan.md §3.1, binds ui-std).
 * Full-screen `danger` role, no degraded menu, no cached layout, no retry affordance.
 * Evidence: the local verification evidence id + the delivery kid/digest so the security
 * team (redteam@mindlabsolutions.com) can match the server-side bundle row.
 */
import type { ReactNode } from 'react';

export interface TamperedBoundaryProps {
  reason: string;
  evidenceId: string;
  kid?: string;
  digest?: string;
  portal: string;
}

export function TamperedBoundary(props: TamperedBoundaryProps): ReactNode {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="grid h-[100dvh] place-items-center px-4"
      style={{ background: 'color-mix(in srgb, var(--color-status-danger) 8%, var(--bg-canvas, #0b0e14))' }}
    >
      <div className="fsp-panel max-w-lg p-6">
        <div className="fsp-chip-bad fsp-chip mb-4">UI metadata tampered</div>
        <h1 className="mb-3 text-xl font-bold">
          UI metadata tampered — this portal will not load
        </h1>
        <p className="text-dim text-sm leading-relaxed">
          Signed content failed verification ({props.reason}) for portal{' '}
          <code className="tabular-nums">{props.portal}</code>. Do not retry and do not refresh in
          expectation of recovery.
        </p>
        <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-dim">
          <dt>Reason</dt>
          <dd className="tabular-nums">{props.reason}</dd>
          <dt>Evidence id</dt>
          <dd className="tabular-nums select-all">{props.evidenceId}</dd>
          {props.kid && (
            <>
              <dt>Signing key</dt>
              <dd className="tabular-nums">{props.kid}</dd>
            </>
          )}
          {props.digest && (
            <>
              <dt>Delivered digest</dt>
              <dd className="tabular-nums break-all">{props.digest}</dd>
            </>
          )}
        </dl>
        <p className="text-sm">
          Get in touch:{' '}
          <a
            className="underline"
            href="mailto:redteam@mindlabsolutions.com?subject=UI%20metadata%20tamper%20evidence&body=evidence%20id%3A"
            onClick={(e) => {
              const link = e.currentTarget;
              link.href = `mailto:redteam@mindlabsolutions.com?subject=UI metadata tamper evidence&body=evidence id: ${props.evidenceId}`;
            }}
          >
            redteam@mindlabsolutions.com
          </a>
        </p>
      </div>
    </div>
  );
}
