/**
 * The widget workbench (SME projects/widget-workbench): develop widgets against fixtures at
 * every grid tier, check the registry, and build + publish portal layouts. Fixture views
 * work signed out; live data, the registry server and publishing use the BFF session
 * (FAPI2: hosted IdP sign-in, no tokens in the browser) and core re-checks every call.
 */
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { SessionProvider } from '../portals/shared/web-core/session';
import { WORKBENCH_PORTAL } from '../portals/portal-config';
import { WIDGETS } from '../portals/shared/widgets/registry';
import { BuilderPage } from './builder/BuilderPage';
import { ConnectionProvider } from './ConnectionProvider';
import { NewWidgetPage } from './NewWidgetPage';
import { RegistryPage } from './RegistryPage';
import { WidgetPage } from './WidgetPage';
import { WorkbenchShell } from './WorkbenchShell';
import './workbench.css';

function makeRouter() {
  return createBrowserRouter(
    [
      {
        path: '/',
        element: <WorkbenchShell />,
        children: [
          { index: true, element: <Navigate to={WIDGETS.length ? `/w/${WIDGETS[0].id}` : '/registry'} replace /> },
          { path: 'w/:id', element: <WidgetPage /> },
          { path: 'registry', element: <RegistryPage /> },
          { path: 'new', element: <NewWidgetPage /> },
          { path: 'builder', element: <BuilderPage /> },
          { path: '*', element: <Navigate to="/registry" replace /> },
        ],
      },
    ],
    { basename: WORKBENCH_PORTAL.basePath },
  );
}

export function WorkbenchApp() {
  const [router] = useState(makeRouter);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (n, e) => {
              const s = (e as { status?: number }).status ?? 0;
              return s !== 401 && s !== 403 && s !== 404 && n < 1;
            },
          },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider portal={WORKBENCH_PORTAL}>
        <ConnectionProvider>
          <RouterProvider router={router} />
        </ConnectionProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
