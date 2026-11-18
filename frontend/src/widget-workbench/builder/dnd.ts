/** Native drag-and-drop payload types (SME used @angular/cdk; FSP uses the platform API). */
export const DND_WIDGET = 'application/x-fsp-widget';
export const DND_PLACED = 'application/x-fsp-placed';
export const DND_MENU = 'application/x-fsp-menu';
export const DND_SCREEN = 'application/x-fsp-screen';

export function carries(e: { dataTransfer: DataTransfer }, ...types: string[]): boolean {
  return types.some((t) => e.dataTransfer.types.includes(t));
}
