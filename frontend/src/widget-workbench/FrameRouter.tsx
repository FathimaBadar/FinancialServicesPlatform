import type { ReactNode } from 'react';
import {
  MemoryRouter,
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
} from 'react-router-dom';

/** A route context that is NOT inside a data route (fresh, no matches). */
const NO_ROUTE = { outlet: null, matches: [], isDataRoute: false };

export interface FrameRouterProps {
  children: ReactNode;
}

/**
 * Widgets keep their own state in the URL (ui-std §7). Inside the workbench every frame /
 * canvas cell gets a private in-memory URL, so opening a user in the phone frame does not
 * open it in the desktop frame too, and nothing leaks into the workbench's own URL.
 *
 * The workbench runs a DATA router (createBrowserRouter): useNavigate takes the data
 * router's navigate when the surrounding RouteContext is a data route, and reads the data
 * router contexts — so the route, location and data-router contexts are all reset here.
 * Otherwise a widget's setSearchParams would navigate the workbench itself.
 */
export function FrameRouter({ children }: FrameRouterProps) {
  return (
    <UNSAFE_DataRouterContext.Provider value={null}>
      <UNSAFE_DataRouterStateContext.Provider value={null}>
        <UNSAFE_LocationContext.Provider value={null as never}>
          <UNSAFE_RouteContext.Provider value={NO_ROUTE}>
            <MemoryRouter>{children}</MemoryRouter>
          </UNSAFE_RouteContext.Provider>
        </UNSAFE_LocationContext.Provider>
      </UNSAFE_DataRouterStateContext.Provider>
    </UNSAFE_DataRouterContext.Provider>
  );
}
