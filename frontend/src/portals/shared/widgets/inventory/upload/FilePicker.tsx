import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { clsx } from 'clsx';
import { Alert, Button } from '../../../ui/atoms';
import { FIELD_LABEL, ITEM_FIELDS, MAX_FILE_BYTES, MAX_ITEMS, formatBytes, mapRows } from './model';
import type { DraftList } from './model';
import { SheetError, readFileBytes, readSheet } from './sheet';

export interface FilePickerProps {
  onLoaded: (draft: DraftList, notes: string[]) => void;
  onCancel: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string; fileSize: number; fraction: number; step: string }
  | { kind: 'failed'; fileName: string; message: string };

const ACCEPT = '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLUMNS = ITEM_FIELDS.map((f) => FIELD_LABEL[f]).join(', ');

/**
 * Step 1 of an upload: the user picks (or drops) a file; it is read and checked in the browser
 * with visible progress. Nothing is sent to the server until the user confirms the review.
 */
export function FilePicker({ onLoaded, onCancel }: FilePickerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const run = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async (file: File) => {
    const id = (run.current += 1);
    const fail = (message: string) => {
      if (run.current === id) setPhase({ kind: 'failed', fileName: file.name, message });
    };
    if (file.size === 0) return fail('The file is empty.');
    if (file.size > MAX_FILE_BYTES) return fail(`The file is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_FILE_BYTES)}.`);
    const step = (fraction: number, label: string) => {
      if (run.current === id) setPhase({ kind: 'reading', fileName: file.name, fileSize: file.size, fraction, step: label });
    };
    try {
      step(0, 'Reading the file');
      const buf = await readFileBytes(file, (f) => step(f * 0.7, 'Reading the file'));
      step(0.75, 'Opening the spreadsheet');
      const sheet = await readSheet(file.name, buf);
      step(0.9, 'Checking the rows');
      const mapped = mapRows(sheet.rows, `u${id}`);
      if (run.current !== id) return undefined;
      if (mapped.missing.length > 0) {
        const names = mapped.missing.map((f) => FIELD_LABEL[f]).join(', ');
        return fail(`Missing column${mapped.missing.length > 1 ? 's' : ''}: ${names}. The first row must hold the column names (${COLUMNS}).`);
      }
      if (mapped.items.length === 0) return fail('The file has column names but no items under them.');
      const notes: string[] = [];
      if (mapped.headerRow > 1) notes.push(`Column names were found on row ${mapped.headerRow}.`);
      if (mapped.skippedEmpty > 0) notes.push(`${mapped.skippedEmpty} empty row${mapped.skippedEmpty > 1 ? 's were' : ' was'} skipped.`);
      if (mapped.truncated) notes.push(`Only the first ${MAX_ITEMS} items were read; split larger lists into several files.`);
      step(1, 'Done');
      onLoaded({ source: 'UPLOAD', fileName: file.name, fileSize: file.size, sheetName: sheet.sheetName, items: mapped.items }, notes);
    } catch (e) {
      fail(e instanceof SheetError ? e.message : 'The file could not be read. Check that it is a valid .xlsx or .csv file.');
    }
    return undefined;
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void load(file);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void load(file);
  };

  const reading = phase.kind === 'reading';

  return (
    <div className="flex flex-col gap-3">
      <label
        className={clsx(
          'flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center',
          dragging ? 'border-line-strong bg-raised' : 'border-line',
          reading && 'pointer-events-none opacity-60',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <FileSpreadsheet size={28} aria-hidden />
        <span className="text-sm font-semibold">Choose a file or drop it here</span>
        <span className="text-dim text-[12px]">Excel (.xlsx) or CSV, up to {formatBytes(MAX_FILE_BYTES)}. The first row holds the column names: {COLUMNS}.</span>
        <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={onPick} disabled={reading} />
      </label>

      {phase.kind === 'reading' && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold">{phase.fileName}</span>
            <span className="text-dim shrink-0 tabular-nums">{formatBytes(phase.fileSize)} · {Math.round(phase.fraction * 100)}%</span>
          </div>
          <progress className="w-full" value={phase.fraction} max={1} aria-label={`${phase.step}: ${Math.round(phase.fraction * 100)}%`} />
          <span className="text-dim text-[12px]">{phase.step}…</span>
        </div>
      )}

      {phase.kind === 'failed' && (
        <Alert kind="bad">
          <strong>{phase.fileName}</strong>: {phase.message}
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={reading}>Back</Button>
        <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={reading}>
          {phase.kind === 'failed' ? 'Choose another file' : 'Choose file'}
        </Button>
      </div>
    </div>
  );
}
