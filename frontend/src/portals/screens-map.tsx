/**
 * Screen registry — THE map from menu point → coded screen (components above in
 * screens.tsx). Own file so screens.tsx stays react-refresh clean.
 */
import { EmptyState } from './shared/ui/atoms';
import { OverviewScreen, WidgetScreen } from './screens';
import type { ScreenProps } from './screens';

export const SCREENS: Record<string, (p: ScreenProps) => JSX.Element> = {
  '/overview': OverviewScreen,
  '/no-access': () => <EmptyState title="No access" />,
  '*': WidgetScreen,
};
