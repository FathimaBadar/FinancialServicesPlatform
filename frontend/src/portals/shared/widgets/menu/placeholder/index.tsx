import { defineWidget } from '../../core/manifest';
import { span } from '../../core/grid';
import { MenuPlaceholder } from './widget';

/**
 * menu.placeholder — the landing pane of a menu point whose feature has not been built yet
 * (admin console: Reset Password, Customer, Component, Sub Component, Branch, Department).
 * It reads and sends nothing; the menu point's own permission still gates the route.
 */
const menuPlaceholderWidget = defineWidget({
  id: 'menu.placeholder',
  version: '1.0.0',
  label: 'Coming soon',
  description: 'Reserved menu point — nothing here yet.',
  category: 'Navigation',
  contexts: ['ANY'],
  // the union of the gates of the menu points that land here (each route is still gated by its own)
  requires: ['user.manage', 'role.manage'],
  sources: [],
  commands: [],
  actions: [],
  commandOperations: {},
  size: { xs: span.xs(4), sm: span.sm(8), md: span.md(12), lg: span.lg(12) },
  hideOn: [],
  render: MenuPlaceholder,
});

export default menuPlaceholderWidget;
