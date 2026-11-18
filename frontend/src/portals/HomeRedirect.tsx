import { Navigate } from 'react-router-dom';
import { FullscreenSpinner } from './shared/web-core/guards';
import { useSession } from './shared/web-core/session-core';
import { getWidget } from './shared/widgets/registry';
import { firstVisibleLink, useSignedLayout } from './signed/signed-layout';

/** Portal home: the first published screen the user can see, else the coded overview. */
export function HomeRedirect() {
  const { status, permissions } = useSession();
  const layout = useSignedLayout();
  if (status === 'loading') return <FullscreenSpinner label="Restoring session" />;
  const target = layout ? firstVisibleLink(layout, permissions, getWidget) : null;
  return <Navigate to={target ?? '/overview'} replace />;
}
