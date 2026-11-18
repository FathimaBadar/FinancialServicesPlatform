import { createRoot } from 'react-dom/client'
import '../boot'
import { PortalRoot } from '../portal-app'
import { ADMIN_PORTAL } from '../portal-config'

createRoot(document.getElementById('root')!).render(
  <PortalRoot portal={ADMIN_PORTAL} portalId="platform" />,
)
