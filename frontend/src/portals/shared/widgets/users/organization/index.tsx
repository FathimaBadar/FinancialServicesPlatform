/**
 * users.organization — ONE widget for the whole user lifecycle of an organization:
 * list · search/filter · view · add · modify (details + roles) · deactivate · activate · remove.
 *
 * Every action is gated server-side by `user.manage` on the target org (core
 * UserAdminController); self-lockout and role escalation are refused by core and
 * pre-empted here. List filters and the open user live in the URL
 * (ui-std §7) so a view can be linked and survives reload.
 */
import { defineWidget } from '../../core/manifest';
import { span } from '../../core/grid';
import { UsersOrganization } from './widget';

const usersOrganizationWidget = defineWidget({
  id: 'users.organization',
  version: '2.0.0',
  label: 'User management',
  description: 'List, view, add, modify, deactivate, activate and remove the users of an organization.',
  category: 'Access',
  contexts: ['ANY'],
  requires: ['user.manage'],
  sources: ['users.list', 'users.get', 'users.roles'],
  commands: ['user.create', 'user.update', 'user.deactivate', 'user.activate', 'user.remove'],
  actions: [
    { id: 'user.create', label: 'Add user', cell: 'user.manage', command: 'user.create', kind: 'primary' },
    { id: 'user.update', label: 'Edit user', cell: 'user.manage', command: 'user.update' },
    { id: 'user.deactivate', label: 'Deactivate', cell: 'user.manage', command: 'user.deactivate', kind: 'ghost' },
    { id: 'user.activate', label: 'Activate', cell: 'user.manage', command: 'user.activate', kind: 'ghost' },
    { id: 'user.remove', label: 'Remove', cell: 'user.manage', command: 'user.remove', kind: 'danger' },
  ],
  commandOperations: {
    'user.create': 'create',
    'user.update': 'modify',
    'user.deactivate': 'modify',
    'user.activate': 'modify',
    'user.remove': 'modify',
  },
  size: { xs: span.xs(4), sm: span.sm(8), md: span.md(12), lg: span.lg(12) },
  hideOn: ['forbidden'],
  render: UsersOrganization,
});

export default usersOrganizationWidget;
