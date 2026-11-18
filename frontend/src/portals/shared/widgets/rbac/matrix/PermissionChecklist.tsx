import { Chip } from '../../../ui/atoms';
import { byComponent } from './model';
import type { PermissionDef } from './model';

export interface PermissionChecklistProps {
  catalog: PermissionDef[];
  selected: ReadonlySet<string>;
  /** keys this person holds — only those can be added or removed (no escalation) */
  held: ReadonlySet<string>;
  editable: boolean;
  onToggle: (key: string) => void;
}

/** The permission catalog by component; boxes the editor cannot grant/revoke are locked with a reason. */
export function PermissionChecklist({ catalog, selected, held, editable, onToggle }: PermissionChecklistProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {byComponent(catalog).map(([component, defs]) => (
        <fieldset key={component} className="rounded-xl border border-line p-3">
          <legend className="fsp-eyebrow px-1">{component}</legend>
          <ul className="grid gap-1.5">
            {defs.map((d) => {
              const locked = !editable || !held.has(d.key);
              return (
                <li key={d.key}>
                  <label className="flex items-start gap-2 text-[13px]" title={!held.has(d.key) && editable ? 'You can only grant or revoke permissions you hold yourself' : undefined}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected.has(d.key)}
                      disabled={locked}
                      onChange={() => onToggle(d.key)}
                      aria-describedby={`perm-${d.key}`}
                    />
                    <span className="min-w-0">
                      <span className="mono block text-[12px] font-semibold">{d.key}</span>
                      <span id={`perm-${d.key}`} className="text-dim block text-[12px]">{d.title}</span>
                    </span>
                    {d.risk === 'FOUR_EYES' && <Chip tone="warn">four-eyes</Chip>}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
