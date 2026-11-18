/**
 * Layout geometry of a rendered widget cell — the checks a screenshot diff misses
 * (SME widget-workbench/measure.ts). Also exposed as window.__wb.measure for e2e suites.
 *
 *   overflowX    elements whose content is wider than their box and not scrollable by design
 *   outsideCell  elements that stick out of the widget's grid cell
 *   smallTargets (phone tier) tap targets under 44×44 px — reported, not yet failing
 */
export interface Geometry {
  tier: string;
  cellWidth: number;
  overflowX: string[];
  outsideCell: string[];
  smallTargets: string[];
}

const TAP = 'button, a[href], select, input:not([type=hidden]), [role=button], [role=radio], [role=checkbox], [role=switch]';

function describe(el: Element): string {
  const cls = [...el.classList].filter((c) => !c.startsWith('wb-')).slice(0, 2).join('.');
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
}

export function measure(cell: HTMLElement, tier: string, mark = false): Geometry {
  const cellRect = cell.getBoundingClientRect();
  const out: Geometry = { tier, cellWidth: Math.round(cellRect.width), overflowX: [], outsideCell: [], smallTargets: [] };
  for (const el of cell.querySelectorAll('.wb-bad')) el.classList.remove('wb-bad');
  const all = [cell, ...Array.from(cell.querySelectorAll<HTMLElement>('*'))].filter(visible);
  for (const el of all) {
    const cs = getComputedStyle(el);
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    // deliberate truncation (overflow hidden + ellipsis) clips by design, it is not a layout bug
    const clipsByDesign = cs.textOverflow === 'ellipsis' && cs.overflowX === 'hidden';
    // visually-hidden text (sr-only: absolute, 1px, clipped) is for screen readers by design
    const srOnly = cs.position === 'absolute' && el.clientWidth <= 1;
    // form controls scroll their own text (a long name in an input is not a layout bug)
    const own = ['svg', 'path', 'input', 'textarea', 'select'].includes(el.tagName.toLowerCase());
    if (!scrolls && !own && !clipsByDesign && !srOnly && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.overflowX.push(describe(el));
      if (mark) el.classList.add('wb-bad');
    }
    const r = el.getBoundingClientRect();
    if (el !== cell && !srOnly && (r.right > cellRect.right + 1 || r.left < cellRect.left - 1)) {
      // only report the outermost element that escapes
      const pr = el.parentElement?.getBoundingClientRect();
      if (!pr || (pr.right <= cellRect.right + 1 && pr.left >= cellRect.left - 1)) {
        out.outsideCell.push(describe(el));
        if (mark) el.classList.add('wb-bad');
      }
    }
  }
  if (tier === 'xs') {
    for (const el of Array.from(cell.querySelectorAll<HTMLElement>(TAP)).filter(visible)) {
      const target = el.closest('label') ?? el;
      const r = target.getBoundingClientRect();
      if (r.height < 44 && r.width < 44 * 3) out.smallTargets.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  return out;
}
