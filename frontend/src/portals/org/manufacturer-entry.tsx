import { createRoot } from 'react-dom/client'
import '../boot'
import { PortalRoot } from '../portal-app'
import { PORTAL_MANUFACTURER } from '../portal-config'

createRoot(document.getElementById('root')!).render(
  <PortalRoot portal={PORTAL_MANUFACTURER} portalId="org" />,
)
