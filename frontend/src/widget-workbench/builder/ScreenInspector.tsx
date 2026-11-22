import { ArmButton } from './ArmButton';
import type { LayoutScreen } from './layout';

export interface ScreenInspectorProps {
  screen: LayoutScreen;
  route: string;
  resources: readonly string[];
  onChange: (patch: Partial<Pick<LayoutScreen, 'id' | 'label'>>) => void;
  onMove: (by: number) => void;
  onDelete: () => void;
}

export function ScreenInspector({ screen, route, resources, onChange, onMove, onDelete }: ScreenInspectorProps) {
  return (
    <>
      <div className="pane-h">
        <b>Submenu</b>
        <span className="grow" />
        <button type="button" className="lnk" onClick={() => onMove(-1)} aria-label="Move up">↑</button>
        <button type="button" className="lnk" onClick={() => onMove(1)} aria-label="Move down">↓</button>
        <ArmButton label="Delete" armedLabel="Click again: delete submenu" onConfirm={onDelete} />
      </div>
      <label className={screen.label.trim() ? undefined : 'miss'}>
        Label
        <input value={screen.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label>
        Id (route segment)
        <input value={screen.id} onChange={(e) => onChange({ id: e.target.value.trim().toLowerCase() })} />
      </label>
      <dl className="facts">
        <dt>route</dt>
        <dd className="mono">{route}</dd>
        <dt>shows with</dt>
        <dd className="mono">{resources.join(', ') || 'nothing placed yet'}</dd>
        <dt>widgets</dt>
        <dd>{screen.placedWidgets.length}</dd>
      </dl>
    </>
  );
}
