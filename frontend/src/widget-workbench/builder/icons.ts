/**
 * THE browsable icon palette for the portal builder's menu inspector.
 *
 * Grounded in the canonical menu registry (`web-core/menu.ts`): every glyph that
 * has actually shipped in a portal sidebar, deduplicated. Sticking to this set
 * keeps builder-made menus visually consistent with the coded portals — the
 * sidebar renders whatever glyph the layout publishes verbatim (web-core
 * AppShell / signed sidebar), so a freehand field only produced drift.
 *
 * A menu may still carry no icon — the sidebar then falls back to '▤' (Rail).
 */
export interface IconChoice {
  glyph: string;
  /** What existing portals use it for — shown as the cell tooltip / aria label. */
  usedFor: string;
}

export const ICON_CHOICES: IconChoice[] = [
  { glyph: '☰', usedFor: 'Lists — back office users, user management, audit trail' },
  { glyph: '☺', usedFor: 'Customers' },
  { glyph: '◈', usedFor: 'Organizations' },
  { glyph: '⇲', usedFor: 'Onboarding' },
  { glyph: '✓', usedFor: 'Approvals / review queue' },
  { glyph: '◫', usedFor: 'Overview' },
  { glyph: '⇄', usedFor: 'Journal entries' },
  { glyph: '▣', usedFor: 'Chart of accounts' },
  { glyph: '◷', usedFor: 'Accounting periods' },
  { glyph: '₪', usedFor: 'Bank accounts' },
  { glyph: '⚿', usedFor: 'Roles and permissions' },
  { glyph: '⌗', usedFor: 'All permissions' },
  { glyph: '⌂', usedFor: 'Branches' },
  { glyph: '⊞', usedFor: 'Departments' },
  { glyph: '▦', usedFor: 'Components' },
  { glyph: '▤', usedFor: 'Sub-components (also the sidebar fallback glyph)' },
  { glyph: '⑃', usedFor: 'My network' },
  { glyph: '⚷', usedFor: 'Reset password' },
];

/** Collapses a label like "Lists — back office users, audit trail" for short hints. */
export function iconHint(choice: IconChoice): string {
  return choice.usedFor.split(' — ')[0];
}
