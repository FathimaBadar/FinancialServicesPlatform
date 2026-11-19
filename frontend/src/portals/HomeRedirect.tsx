import { Navigate } from 'react-router-dom';
import { FullscreenSpinner } from './shared/web-core/guards';
import { firstCodedLink } from './shared/web-core/menu';
import type { PortalId } from './shared/web-core/menu';
import { useSession } from './shared/web-core/session-core';
import { getWidget } from './shared/widgets/registry';
import { firstVisibleLink, useSignedLayout } from './signed/signed-layout';

/**
 * Portal home: the first published screen the user can see, else the first coded menu
 * point they hold. Never a hard-coded route — a portal without that point would loop.
 */
export function HomeRedirect({ portalId }: { portalId: PortalId }) {
  const { status, permissions } = useSession();
  const layout = useSignedLayout();
  if (status === 'loading') return <FullscreenSpinner label="Restoring session" />;
  const target = (layout ? firstVisibleLink(layout, permissions, getWidget) : null)
    ?? firstCodedLink(portalId, permissions);
  return <Navigate to={target ?? '/no-access'} replace />;
}
