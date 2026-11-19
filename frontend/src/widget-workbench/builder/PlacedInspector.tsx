import { useState } from 'react';
import { COLS, TIERS } from '../../portals/shared/widgets/core/grid';
import type { Tier } from '../../portals/shared/widgets/core/grid';
import type { ConfigField, WidgetDef } from '../../portals/shared/widgets/core/manifest';
import { cellsOf } from '../../portals/shared/widgets/core/manifest';
import { TIER_LABEL } from '../model';
import { placedSpan } from './layout';
import type { PlacedWidget } from './layout';

export interface PlacedInspectorProps {
  def: WidgetDef;
  placed: PlacedWidget;
  onSpan: (tier: Tier, value: number) => void;
  onConfig: (key: string, value: unknown) => void;
  onRemove: () => void;
}

/** Human width names for a tier's column count (Full/Half/Third/Quarter). */
function widthOptions(tier: Tier): Array<{ v: number; label: string }> {
  const cols = COLS[tier];
  const out: Array<{ v: number; label: string }> = [];
  for (const parts of [1, 2, 3, 4]) {
    if (cols % parts === 0) out.push({ v: cols / parts, label: parts === 1 ? 'Full' : `${['Half', 'Third', 'Quarter'][parts - 2]}` });
  }
  return out;
}

function widthLabel(tier: Tier, v: number | null, fallback: number): string {
  const opts = widthOptions(tier);
  const hit = opts.find((o) => o.v === (v ?? fallback));
  return hit ? hit.label : `${v ?? fallback} cols`;
}

export function PlacedInspector({ def, placed, onSpan, onConfig, onRemove }: PlacedInspectorProps) {
  const [details, setDetails] = useState(false);
  const fields = Object.entries(def.config ?? {}).map(([key, field]) => ({ key, field: field as ConfigField }));
  return (
    <>
      <div className="pane-h">
        <b>{def.label}</b>
        <span className="grow" />
        <button type="button" className="lnk bad" onClick={onRemove}>Remove from page</button>
      </div>
      <b className="small">Width</b>
      {TIERS.map((t) => {
        const z = def.size[t];
        if (z.kind === 'hidden') {
          return <div key={t} className="small dim">{TIER_LABEL[t]}: hidden — {z.reason}</div>;
        }
        const now = placedSpan(def, placed, t) ?? z.default;
        const opts = widthOptions(t).filter((o) => o.v >= z.min && o.v <= z.max);
        return (
          <label key={t} className="row">
            {TIER_LABEL[t]}
            <select value={String(now)} onChange={(e) => onSpan(t, Number(e.target.value))}>
              {opts.map((o) => <option key={o.v} value={o.v}>{o.label} · {o.v} of {COLS[t]}</option>)}
              {!opts.some((o) => o.v === now) && <option value={now}>{widthLabel(t, now, z.default)}</option>}
            </select>
            {placed.span[t] === undefined && <span className="dim small">default</span>}
          </label>
        );
      })}
      {fields.length > 0 && <b className="small">Settings</b>}
      {fields.map(({ key, field }) => (
        <label key={key}>
          {field.label ?? key}
          {field.type === 'enum' ? (
            <select value={String(placed.config[key] ?? field.default)} onChange={(e) => onConfig(key, e.target.value)}>
              {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : field.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={(placed.config[key] ?? field.default) === true}
              onChange={(e) => onConfig(key, e.target.checked)}
            />
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={String(placed.config[key] ?? field.default)}
              onChange={(e) => onConfig(key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
            />
          )}
        </label>
      ))}
      <button type="button" className="lnk small" onClick={() => setDetails(!details)}>
        {details ? 'Hide details' : 'Details'} <span className="dim">{details ? '▾' : '▸'}</span>
      </button>
      {details && (
        <>
          <div className="mono small dim">{def.id}@{def.version} · instance {placed.id}</div>
          <dl className="facts">
            <dt>columns (raw)</dt>
            <dd className="mono">{TIERS.map((t) => `${t}=${placedSpan(def, placed, t) ?? '·'}`).join(' ')}</dd>
            <dt>permissions it names</dt>
            <dd className="mono">{cellsOf(def).join(', ') || 'none'}</dd>
          </dl>
        </>
      )}
    </>
  );
}
