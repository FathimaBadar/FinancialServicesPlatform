import { describe, expect, it } from 'vitest';
import { emptyHistory, pushHistory, redoHistory, undoHistory } from './history';
import type { PortalLayout } from './layout';

function layout(portal: string): PortalLayout {
  return {
    portal,
    menus: [{ id: 'main', label: 'Main', screens: [{ id: 'p1', label: 'Page', placedWidgets: [] }] }],
  };
}

describe('builder history', () => {
  it('undoes and redoes a single edit', () => {
    const first = layout('admin');
    const second = layout('other');
    let hist = emptyHistory();
    hist = pushHistory(hist, first);
    const u = undoHistory(hist, second);
    expect(u.layout).toEqual(first);
    const r = redoHistory(u.hist, u.layout ?? first);
    expect(r.layout).toEqual(second);
    const u2 = undoHistory(r.hist, second);
    expect(u2.layout).toEqual(first);
  });

  it('new edits clear the redo branch', () => {
    const first = layout('a');
    const second = layout('b');
    const third = layout('c');
    let hist = emptyHistory();
    hist = pushHistory(hist, first);       // edit 1: first → second
    hist = pushHistory(hist, second);      // edit 2: second → third (state is now third)
    const u = undoHistory(hist, third);
    expect(u.layout).toEqual(second);
    const u2 = undoHistory(u.hist, u.layout!);
    expect(u2.layout).toEqual(first);
    // a brand-new edit from the undone state clears the redo branch; the undo stack
    // still holds the state before the new edit
    hist = pushHistory(u2.hist, u2.layout!);
    expect(undoHistory(hist, first).layout).toEqual(first);
    expect(redoHistory(hist, first).layout).toBeNull();
  });

  it('undo/redo on an empty history is a no-op', () => {
    const hist = emptyHistory();
    const cur = layout('x');
    expect(undoHistory(hist, cur).layout).toBeNull();
    expect(redoHistory(hist, cur).layout).toBeNull();
  });

  it('history is bounded', () => {
    let hist = emptyHistory();
    let cur: PortalLayout | null = layout('seed');
    for (let i = 0; i < 150; i++) {
      hist = pushHistory(hist, cur!);
      cur = layout(`p${i}`);
    }
    expect(hist.past.length).toBeLessThanOrEqual(100);
  });
});
