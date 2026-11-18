/**
 * FAPI 2.0 compliant login page — the browser NEVER collects credentials.
 * Clicking "Sign in" redirects to BFF /bff/auth/login which initiates PAR flow
 * and redirects to the IdP hosted sign-in page.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Spinner } from '@/portals/shared/web-core/guards';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const returnTo = searchParams.get('return_to') ?? '/';

  useEffect(() => {
    // Initiate FAPI 2.0 PAR flow via the BFF. The browser never sends credentials.
    window.location.href = `/bff/auth/login?return_to=${encodeURIComponent(returnTo)}`;
  }, [returnTo]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="fsp-eyebrow mb-2">FSP Financial Services Platform</div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
        </div>
        <div className="fsp-panel p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm">Redirecting to secure sign-in…</span>
          </div>
          <p className="text-dim text-xs">
            You will be redirected to the FSP Identity Provider for authentication.
            The browser never sends credentials to this application.
          </p>
          {error && (
            <p role="alert" className="fsp-chip fsp-chip-bad mt-4 block whitespace-normal text-sm">
              {error === 'session_expired' ? 'Session expired. Please sign in again.' :
               error === 'invalid_state' ? 'Invalid login state. Please try again.' :
               'Sign-in failed: ' + error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
