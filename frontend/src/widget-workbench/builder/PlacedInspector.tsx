import { TIERS } from '../../portals/shared/widgets/core/grid';
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

export function PlacedInspector({ def, placed, onSpan, onConfig, onRemove }: PlacedInspectorProps) {
  const fields = Object.entries(def.config ?? {}).map(([key, field]) => ({ key, field: field as ConfigField }));
  return (
    <>
      <div className="pane-h">
        <b>{def.label}</b>
        <span className="grow" />
        <button type="button" className="lnk bad" onClick={onRemove}>Remove</button>
      </div>
      <div className="mono small dim">{def.id}@{def.version} · instance {placed.id}</div>
      <b className="small">Size per tier</b>
      {TIERS.map((t) => {
        const z = def.size[t];
        if (z.kind === 'hidden') {
          return <div key={t} className="small dim">{TIER_LABEL[t]}: hidden ({z.reason})</div>;
        }
        return (
          <label key={t} className="row">
            {TIER_LABEL[t]}
            <input
              type="number"
              min={z.min}
              max={z.max}
              value={placedSpan(def, placed, t) ?? z.default}
              onChange={(e) => onSpan(t, Number(e.target.value))}
            />
            <span className="dim small">{z.min}–{z.max}</span>
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
      <b className="small">Permissions it names</b>
      <div className="mono small">
        {cellsOf(def).map((c) => <div key={c}>{c}</div>)}
      </div>
    </>
  );
}
