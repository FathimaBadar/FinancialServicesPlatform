/** What the builder's inspector is pointed at. */
export type Sel =
  | { kind: 'menu'; m: number }
  | { kind: 'screen'; m: number; s: number }
  | { kind: 'widget'; m: number; s: number; id: string }
  | null;

export type BuilderView = 'canvas' | 'sidebar' | 'publish' | 'export';

export const BUILDER_VIEWS: readonly { id: BuilderView; label: string }[] = [
  { id: 'canvas', label: 'Screen' },
  { id: 'sidebar', label: 'Sidebar preview' },
  { id: 'publish', label: 'Publish' },
  { id: 'export', label: 'Export' },
];
