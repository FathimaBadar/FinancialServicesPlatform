import { defineWidget } from '../../core/manifest';
import { span } from '../../core/grid';
import { AuditTrail } from './widget';

const auditTrailWidget = defineWidget({
  id: 'audit.trail',
  version: '1.0.1',
  label: 'Audit trail',
  description: 'Who did what to which record and when, newest first, with paging.',
  category: 'Compliance',
  contexts: ['ANY'],
  requires: ['audit.view'],
  sources: ['audit.trail.page'],
  commands: [],
  actions: [],
  commandOperations: {},
  size: { xs: span.xs(4), sm: span.sm(8), md: span.md(12), lg: span.lg(12) },
  hideOn: ['forbidden'],
  render: AuditTrail,
});

export default auditTrailWidget;
