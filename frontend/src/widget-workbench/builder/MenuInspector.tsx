import { ArmButton } from './ArmButton';
import type { LayoutMenu } from './layout';

export interface MenuInspectorProps {
  menu: LayoutMenu;
  onChange: (patch: Partial<Pick<LayoutMenu, 'id' | 'label' | 'icon'>>) => void;
  onMove: (by: number) => void;
  onDelete: () => void;
}

export function MenuInspector({ menu, onChange, onMove, onDelete }: MenuInspectorProps) {
  return (
    <>
      <div className="pane-h">
        <b>Menu</b>
        <span className="grow" />
        <button type="button" className="lnk" onClick={() => onMove(-1)} aria-label="Move up">↑</button>
        <button type="button" className="lnk" onClick={() => onMove(1)} aria-label="Move down">↓</button>
        <ArmButton label="Delete" armedLabel="Click again: delete menu + submenus" onConfirm={onDelete} />
      </div>
      <label className={menu.label.trim() ? undefined : 'miss'}>
        Label
        <input value={menu.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label>
        Id (route segment)
        <input value={menu.id} onChange={(e) => onChange({ id: e.target.value.trim().toLowerCase() })} />
      </label>
      <label>
        Icon
        <input value={menu.icon ?? ''} onChange={(e) => onChange({ icon: e.target.value.trim() || undefined })} placeholder="optional" />
      </label>
    </>
  );
}
