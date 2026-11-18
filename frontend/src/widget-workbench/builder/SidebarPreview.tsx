import type { PortalLayout } from './layout';

export interface SidebarPreviewProps {
  layout: PortalLayout;
  portalLabel: string;
}

/** The sidebar as a portal user will see it (menus without submenus never show). */
export function SidebarPreview({ layout, portalLabel }: SidebarPreviewProps) {
  return (
    <div className="sb-prev">
      <div className="dim small">Sidebar as a {portalLabel} user sees it (each entry still gated by its permissions).</div>
      {layout.menus
        .filter((m) => m.screens.length)
        .map((m, mi) => (
          <div key={`${m.id}:${mi}`}>
            <div className="sb-m">{m.icon ? `${m.icon} ` : ''}{m.label}</div>
            {m.screens.map((s, si) => <div key={`${s.id}:${si}`} className="sb-s">{s.label}</div>)}
          </div>
        ))}
    </div>
  );
}
