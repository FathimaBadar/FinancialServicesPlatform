import { Fragment, useMemo } from 'react';
import { clsx } from 'clsx';
import { menuFor } from '../../../web-core/menu';
import type { PortalId } from '../../../web-core/menu';
import { cellsOf } from '../../core/manifest';
import { getWidget } from '../../registry';
import { TriCheckbox } from './TriCheckbox';
import { VERB_LABEL, buildMatrix, checkState, isActive, sharedGateLinks, toggleActive, toggleAll } from './model';
import type { MatrixCell, MatrixRow, PermissionDef, PermissionMatrixModel, VerbColumn } from './model';

export interface PermissionMatrixProps {
  /** whose sidebar the rows mirror (the portal the role's holders sign in to) */
  portal: PortalId;
  catalog: PermissionDef[];
  selected: ReadonlySet<string>;
  /** keys this person holds — only those can be granted or revoked (no escalation) */
  held: ReadonlySet<string>;
  editable: boolean;
  onChange: (next: Set<string>) => void;
}

const HEAD = 'whitespace-nowrap px-3 py-3 text-[10.5px] font-bold uppercase tracking-[.08em]';

const widgetKeys = (id: string): string[] => {
  const def = getWidget(id);
  return def ? cellsOf(def) : [];
};

/**
 * Menu × verb grid: one header row per sidebar group, one row per sidebar link (exactly the menu).
 * A group row selects its whole group; a link row has its own "select all"; each verb cell is ONE
 * box covering every key in it (listed in its tooltip); the Active box is the link itself (shows it
 * in the sidebar). Boxes the editor may not grant are locked, reason in the tooltip.
 */
export function PermissionMatrix({ portal, catalog, selected, held, editable, onChange }: PermissionMatrixProps) {
  const matrix: PermissionMatrixModel = useMemo(() => buildMatrix(menuFor(portal), catalog, widgetKeys), [portal, catalog]);
  const grantable = useMemo(() => (editable ? held : new Set<string>()), [editable, held]);
  const anyGrantable = (keys: readonly string[]) => keys.some((k) => grantable.has(k));
  const lockReason = editable ? 'You can only grant or revoke permissions you hold yourself' : undefined;

  /** One box per cell: it grants/revokes every key in the cell together (partial = indeterminate). */
  const cellBox = (rowLabel: string, column: VerbColumn, cell: MatrixCell[]) => {
    if (!cell.length) return null;
    const keys = cell.map((c) => c.key);
    const locked = !anyGrantable(keys);
    const detail = cell.map((c) => `${c.key} — ${c.title}`).join('\n');
    return (
      <TriCheckbox state={checkState(keys, selected)} disabled={locked}
        label={`${VERB_LABEL[column]} ${rowLabel}`}
        title={`${detail}${locked && lockReason ? `\n(${lockReason})` : ''}`}
        onToggle={() => onChange(toggleAll(keys, selected, grantable))} />
    );
  };

  /** The link itself: on = it shows in the sidebar. Unticking revokes its gate, which may hide links sharing it. */
  const activeBox = (r: MatrixRow) => {
    if (!r.gate.length) return null;
    const locked = !anyGrantable(r.gate);
    const shared = sharedGateLinks(matrix, r);
    const title = [
      `Shows "${r.label}" in the menu (${r.gate.join(' or ')})`,
      shared.length ? `Same permission as: ${shared.join(', ')}` : '',
      locked && lockReason ? `(${lockReason})` : '',
    ].filter(Boolean).join('\n');
    return (
      <TriCheckbox state={isActive(r.gate, selected) ? 'all' : 'none'} disabled={locked}
        label={`Active ${r.label}`} title={title}
        onToggle={() => onChange(toggleActive(r.gate, selected, grantable))} />
    );
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="bg-[var(--color-action-secondary)] text-[var(--color-action-text)]">
          <tr>
            <th scope="col" className={clsx(HEAD, 'text-left')}>Menu component</th>
            <th scope="col" className={clsx(HEAD, 'text-center')}>#</th>
            <th scope="col" className={clsx(HEAD, 'text-center')}>Select all</th>
            {matrix.columns.map((c) => <th key={c} scope="col" className={clsx(HEAD, 'text-center')}>{VERB_LABEL[c]}</th>)}
            <th scope="col" className={clsx(HEAD, 'text-center')}>Active</th>
          </tr>
        </thead>
        <tbody>
          {matrix.groups.map((g) => (
            <Fragment key={g.label}>
              <tr className="bg-surface-sunken">
                <th scope="row" className="border-t border-line px-3 py-3 text-left text-[13px] font-bold">{g.label}</th>
                <td className="text-dim border-t border-line px-3 py-3 text-center text-[12px] tabular-nums">
                  {g.keys.filter((k) => selected.has(k)).length}/{g.keys.length}
                </td>
                <td className="border-t border-line px-3 py-3 text-center">
                  <TriCheckbox state={checkState(g.keys, selected)} disabled={!anyGrantable(g.keys)}
                    label={`Select all ${g.label}`} title={anyGrantable(g.keys) ? undefined : lockReason}
                    onToggle={() => onChange(toggleAll(g.keys, selected, grantable))} />
                </td>
                <td colSpan={matrix.columns.length + 1} className="border-t border-line" />
              </tr>
              {g.rows.map((r) => (
                <tr key={r.link} className="bg-surface" data-menu-link={r.link}>
                  <th scope="row" className="border-t border-line py-2.5 pl-8 pr-3 text-left text-[13px] font-medium">{r.label}</th>
                  <td className="text-dim border-t border-line px-3 py-2.5 text-center text-[12px] tabular-nums">
                    {r.keys.filter((k) => selected.has(k)).length}/{r.keys.length}
                  </td>
                  <td className="border-t border-line px-3 py-2.5 text-center">
                    <TriCheckbox state={checkState(r.keys, selected)} disabled={!anyGrantable(r.keys)}
                      label={`Select all ${r.label}`} title={anyGrantable(r.keys) ? undefined : lockReason}
                      onToggle={() => onChange(toggleAll(r.keys, selected, grantable))} />
                  </td>
                  {matrix.columns.map((c) => (
                    <td key={c} className="border-t border-line px-3 py-2.5 text-center">
                      {cellBox(r.label, c, r.cells[c])}
                    </td>
                  ))}
                  <td className="border-t border-line px-3 py-2.5 text-center">{activeBox(r)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
