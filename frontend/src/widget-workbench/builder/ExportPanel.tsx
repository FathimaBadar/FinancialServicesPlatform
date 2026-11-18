import type { PortalLayout } from './layout';

export interface ExportPanelProps {
  layout: PortalLayout;
  errorCount: number;
}

function download(name: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The layout exactly as Publish sends it (PUT /v1/ui/layouts/{portal}/draft → layoutJson). */
export function ExportPanel({ layout, errorCount }: ExportPanelProps) {
  const name = `layout.${layout.portal}.json`;
  return (
    <div className="exp">
      {errorCount > 0 && <p className="bad">Fix the {errorCount} error(s) first — core would reject this layout.</p>}
      <div className="pane-h">
        <b className="mono">{name}</b>
        <span className="grow" />
        <button type="button" className="btn" disabled={errorCount > 0} onClick={() => download(name, layout)}>
          Download
        </button>
      </div>
      <pre>{JSON.stringify(layout, null, 2)}</pre>
    </div>
  );
}
