import { createRoot } from 'react-dom/client'
import './portals/boot'
import { ChooserScreen } from './ChooserScreen'

createRoot(document.getElementById('root')!).render(<ChooserScreen />)
