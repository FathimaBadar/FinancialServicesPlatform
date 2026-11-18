import { createRoot } from 'react-dom/client'
import '../boot'
import { PortalRoot } from '../portal-app'
import { PORTAL_WHOLESALER } from '../portal-config'

createRoot(document.getElementById('root')!).render(
  <PortalRoot portal={PORTAL_WHOLESALER} portalId="org" />,
)
