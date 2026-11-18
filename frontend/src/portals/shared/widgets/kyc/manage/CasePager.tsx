import { Button } from '../../../ui/atoms';
import { PAGE_SIZES } from './model';

export interface CasePagerProps {
  page: number;
  size: number;
  shown: number;
  hasNext: boolean;
  busy: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}

/**
 * Totals-free pager (AGENTS §4A): the server says only whether a next page exists, so the
 * pager shows "Page n · rows a–b" with previous / next and a page-size choice.
 */
export function CasePager({ page, size, shown, hasNext, busy, onPage, onSize }: CasePagerProps) {
  const from = page * size + 1;
  const to = page * size + shown;
  return (
    <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px]">
      <span className="text-dim tabular-nums" aria-live="polite">
        Page {page + 1}
        {shown > 0 && ` · rows ${from}–${to}`}
      </span>
      <span className="flex-1" />
      <label className="text-dim flex items-center gap-2">
        Rows per page
        <select className="fsp-field w-auto cursor-pointer py-1" value={size} onChange={(e) => onSize(Number(e.target.value))}>
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <Button variant="ghost" disabled={page === 0 || busy} onClick={() => onPage(page - 1)}>
        ‹ Previous
      </Button>
      <Button variant="ghost" disabled={!hasNext || busy} onClick={() => onPage(page + 1)}>
        Next ›
      </Button>
    </nav>
  );
}
