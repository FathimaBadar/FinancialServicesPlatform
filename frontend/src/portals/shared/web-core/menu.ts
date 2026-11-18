/**
 * THE menu registry — one canonical catalogue of every FSP portal's sidebar
 * (ported from SME shared/web-core/menu.ts; permission KEYS are OURS —
 * plans/ui-portals-plan.md §2.4/§6.2, flat seeded keys, no verb grid).
 *
 * Rules (fail-closed, same as SME):
 *  1. One menu point, one label — everywhere it renders.
 *  2. One menu point, one permission-key list (OR semantics) — the sidebar
 *     and every route guard read this same registry.
 *  3. No ungated items: an unmapped path denies (route guards use the
 *     '__no_menu_point__' sentinel); an empty perm list shows nothing.
 *  4. A shared page is gated by the union of the rows its panels need.
 *
 * Keys must exist in the FSP `permissions` table (V2 seed). The screens are
 * widget compositions (layouts land next); until then each point maps to a
 * coded screen id in the portal's route table.
 */
export type PortalId = 'platform' | 'org';

export type MenuWidget =
  | 'kyc.orgs' | 'kyc.tasks' | 'kyc.application' | 'kyc.decisions'
  | 'tenant.directory' | 'onboard.child'
  | 'approvals.queue' | 'journal.entry' | 'audit.trail'
  | 'rbac.matrix' | 'permissions.catalogue'
  | 'users.organization' | 'users.signin'
  | 'ledger.accounts' | 'period.control'
  | 'overview.tiles';

export interface MenuItem {
  id: string;
  /** THE label — one name per menu point, everywhere. */
  label: string;
  icon: string;
  /** Route path relative to the portal base. */
  link: string;
  /** Permission keys (OR semantics). Required. */
  perm: string[];
  /** Optional sidebar group header, rendered once when the group changes. */
  group?: string;
  portals: PortalId[];
  widgets: MenuWidget[];
}

export const MENU_ITEMS: MenuItem[] = [
  // ---------------- governance (both portals, governance-first like SME)
  { id: 'overview', label: 'Overview', icon: '◫', link: '/overview',
    perm: ['audit.view'], portals: ['platform', 'org'], widgets: ['overview.tiles'] },
  { id: 'onboarding', label: 'Onboarding', icon: '⇲', link: '/onboarding',
    perm: ['org.create', 'org.onboard_child'], portals: ['platform', 'org'], widgets: ['onboard.child'] },
  { id: 'network', label: 'My network', icon: '⑃', link: '/network',
    perm: ['kyc.review'], portals: ['org'], widgets: ['kyc.orgs'] },
  { id: 'users', label: 'User management', icon: '☰', link: '/users',
    perm: ['user.manage'], portals: ['platform', 'org'], widgets: ['users.organization'] },

  // ---------------- KYC (one screen family: the directory / queue / case)
  { id: 'kyc-applications', label: 'KYC applications', icon: '◈', link: '/kyc/applications',
    perm: ['kyc.review'], portals: ['platform'], group: 'KYC', widgets: ['kyc.orgs'] },
  { id: 'kyc-reviews', label: 'Review queue', icon: '✓', link: '/kyc/reviews',
    perm: ['kyc.approve', 'kyc.reject'], portals: ['platform', 'org'], group: 'KYC', widgets: ['kyc.tasks'] },
  { id: 'kyc-decisions', label: 'My organization', icon: '◈', link: '/kyc',
    perm: ['kyc.review'], portals: ['org'], group: 'KYC', widgets: ['kyc.application'] },

  // ---------------- operations (money-adjacent: four-eyes surfaces)
  { id: 'approvals', label: 'Approvals', icon: '✓', link: '/approvals',
    perm: ['kyc.approve', 'je.approve', 'org.approve_child', 'bank.account.approve', 'gl.account.approve'],
    portals: ['platform', 'org'], group: 'Operations', widgets: ['approvals.queue'] },
  { id: 'journal', label: 'Journal entries', icon: '⇄', link: '/journal',
    perm: ['je.view', 'je.create', 'je.approve'], portals: ['platform', 'org'],
    group: 'Operations', widgets: ['journal.entry'] },
  { id: 'ledger-audit', label: 'Audit trail', icon: '☰', link: '/audit',
    perm: ['audit.view'], portals: ['platform', 'org'], group: 'Operations', widgets: ['audit.trail'] },

  // ---------------- platform admin surface
  { id: 'rbac', label: 'Roles and permissions', icon: '⚿', link: '/rbac',
    perm: ['role.manage'], portals: ['platform'], group: 'Access', widgets: ['rbac.matrix'] },
  { id: 'permissions', label: 'All permissions', icon: '⌗', link: '/permissions',
    perm: ['audit.view', 'role.manage', 'kyc.review'], portals: ['platform', 'org'],
    group: 'Access', widgets: ['permissions.catalogue'] },
  { id: 'ledger', label: 'Chart of accounts', icon: '▣', link: '/ledger',
    perm: ['gl.account.view'], portals: ['platform', 'org'], group: 'Access', widgets: ['ledger.accounts'] },
  { id: 'periods', label: 'Accounting periods', icon: '◷', link: '/periods',
    perm: ['gl.account.view', 'period.open', 'period.close'], portals: ['platform', 'org'],
    group: 'Access', widgets: ['period.control'] },
];

export function menuFor(portal: PortalId): MenuItem[] {
  return MENU_ITEMS.filter((i) => i.portals.includes(portal));
}

/** [route, permission keys] for one portal's menu. */
export function menuPerms(portal: PortalId): Array<readonly [string, string[]]> {
  return menuFor(portal).map((i) => [i.link, i.perm] as const);
}

/** Exact permission set for one route ('__no_menu_point__' sentinel ⇒ fail-closed deny). */
export function permsForRoute(portal: PortalId, link: string): string[] {
  return menuFor(portal).find((i) => i.link === link)?.perm ?? ['__no_menu_point__'];
}

export type MenuNavEntry =
  | { kind: 'group'; label: string }
  | { kind: 'item'; label: string; icon: string; link: string; icon2?: string };

/**
 * Flattens a portal's menu into sidebar render entries: drop refused points,
 * emit each group header once when the first point of the group shows.
 */
export function navEntries(
  portal: PortalId,
  visible: (item: MenuItem) => boolean,
): MenuNavEntry[] {
  const out: MenuNavEntry[] = [];
  let lastGroup: string | undefined;
  for (const item of menuFor(portal)) {
    if (!visible(item)) continue;
    if (item.group && item.group !== lastGroup) out.push({ kind: 'group', label: item.group });
    lastGroup = item.group;
    out.push({ kind: 'item', label: item.label, icon: item.icon, link: item.link });
  }
  return out;
}
