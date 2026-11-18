import { createRoot } from 'react-dom/client';
import '../portals/boot';
import { WorkbenchApp } from './WorkbenchApp';

createRoot(document.getElementById('root')!).render(<WorkbenchApp />);
