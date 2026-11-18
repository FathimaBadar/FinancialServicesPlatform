/**
 * The widgets registry — ported from SME registry.generated.ts. Vite eagerly
 * imports every widget folder's index.tsx default (the manifest); the builder
 * palette, RBAC screen, layout renderer and workbench all read THIS list.
 * (tools/widgets.ts `widgets:check` validates coherence at build time.)
 */
import type { WidgetDef } from './core/manifest';

const modules = import.meta.glob('../widgets/*/*/index.tsx', { eager: true }) as Record<
  string,
  { default: WidgetDef }
>;

export const WIDGETS: WidgetDef[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

export function getWidget(id: string): WidgetDef | undefined {
  return WIDGETS.find((w) => w.id === id);
}
