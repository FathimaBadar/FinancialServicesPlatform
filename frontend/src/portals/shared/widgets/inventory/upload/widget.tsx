import { useState } from 'react';
import { FileSpreadsheet, ListPlus } from 'lucide-react';
import { useWidgetRuntime } from '../../core/runtime';
import { Alert, Button, PageHeader, Panel } from '../../../ui/atoms';
import { NoticeBar } from '../../kit/Notice';
import type { Notice } from '../../kit/Notice';
import { DraftReview } from './DraftReview';
import { FilePicker } from './FilePicker';
import { RecentLists } from './RecentLists';
import { SavedList } from './SavedList';
import type { DraftList } from './model';

const WRITE = 'inventory.stock.upload';

type View =
  | { kind: 'start' }
  | { kind: 'file' }
  | { kind: 'draft'; draft: DraftList; notes: string[] }
  | { kind: 'saved'; listId: string };

const MANUAL_DRAFT: DraftList = { source: 'MANUAL', fileName: null, fileSize: null, sheetName: null, items: [] };

/**
 * Inventory upload: pick how to add the list (Excel/CSV file or item by item), review it with
 * the browser's checks, upload it as a draft, verify the server's copy, then submit it for a
 * second person to approve.
 */
export function InventoryUpload() {
  const { context } = useWidgetRuntime();
  const canWrite = context.permissions.includes(WRITE);
  const [view, setView] = useState<View>({ kind: 'start' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refresh, setRefresh] = useState(0);

  const toStart = () => {
    setRefresh((n) => n + 1);
    setView({ kind: 'start' });
  };

  const subtitle =
    view.kind === 'file' ? 'Step 1 of 3 · choose the file'
    : view.kind === 'draft' ? 'Step 2 of 3 · check the details before uploading'
    : view.kind === 'saved' ? 'Step 3 of 3 · verify the saved list and submit it'
    : 'Upload a spreadsheet or add items one by one. Stock counts only after a second person approves the list.';

  return (
    <Panel className="p-4">
      <PageHeader title="Inventory lists" subtitle={subtitle} />
      <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />

      {view.kind === 'start' && (
        <div className="flex flex-col gap-4">
          {!canWrite && <Alert kind="info">Adding inventory lists needs the inventory.stock.upload permission. You can still open existing lists.</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              variant="plain"
              data-action="upload-list"
              className="flex h-full flex-col items-start gap-1 rounded-xl p-4 text-left"
              disabled={!canWrite}
              onClick={() => setView({ kind: 'file' })}
            >
              <FileSpreadsheet size={20} aria-hidden />
              <span className="text-sm font-semibold">Upload a file</span>
              <span className="text-dim text-[12px] font-normal">Excel (.xlsx) or CSV with one item per row. You review every line before it is sent.</span>
            </Button>
            <Button
              variant="plain"
              data-action="add-item"
              className="flex h-full flex-col items-start gap-1 rounded-xl p-4 text-left"
              disabled={!canWrite}
              onClick={() => setView({ kind: 'draft', draft: MANUAL_DRAFT, notes: [] })}
            >
              <ListPlus size={20} aria-hidden />
              <span className="text-sm font-semibold">Add items manually</span>
              <span className="text-dim text-[12px] font-normal">Type the items one by one, then upload the list.</span>
            </Button>
          </div>
          <RecentLists refreshKey={refresh} onOpen={(listId) => setView({ kind: 'saved', listId })} />
        </div>
      )}

      {view.kind === 'file' && (
        <FilePicker onLoaded={(draft, notes) => setView({ kind: 'draft', draft, notes })} onCancel={toStart} />
      )}

      {view.kind === 'draft' && (
        <DraftReview
          draft={view.draft}
          notes={view.notes}
          canWrite={canWrite}
          onChange={(update) => setView((v) => (v.kind === 'draft' ? { ...v, draft: update(v.draft) } : v))}
          onDiscard={toStart}
          onUploaded={(list) => {
            setNotice({ id: Date.now(), kind: 'ok', text: `Uploaded ${list.itemCount} records as a draft. Verify them, then submit.` });
            setView({ kind: 'saved', listId: list.id });
          }}
        />
      )}

      {view.kind === 'saved' && (
        <SavedList
          listId={view.listId}
          canWrite={canWrite}
          onBack={toStart}
          onDeleted={() => {
            setNotice({ id: Date.now(), kind: 'ok', text: 'List deleted.' });
            toStart();
          }}
        />
      )}
    </Panel>
  );
}
