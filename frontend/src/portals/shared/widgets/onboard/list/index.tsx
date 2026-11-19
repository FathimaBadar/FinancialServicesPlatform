/**
 * onboard.list — the onboarding organization directory (platform root):
 * paginated, server-side searchable + sortable list of organizations; click one
 * to open its KYC screen. Gated on org.create (the platform creates tenants).
 */
import { defineWidget } from '../../core/manifest';
import { span } from '../../core/grid';
import { OnboardList } from './widget';

const onboardListWidget = defineWidget({
  id: 'onboard.list',
  version: '1.0.0',
  label: 'Organizations',
  description: 'Paginated, searchable, sortable directory of organizations; click one to open its KYC screen.',
  category: 'Onboarding',
  contexts: ['PLATFORM'],
  requires: ['org.create'],
  sources: ['onboard.orgs.list'],
  commands: [],
  actions: [],
  commandOperations: {},
  size: { xs: span.xs(4), sm: span.sm(8), md: span.md(12), lg: span.lg(12) },
  hideOn: ['forbidden'],
  render: OnboardList,
});

export default onboardListWidget;
