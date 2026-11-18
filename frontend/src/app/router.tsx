import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '@/routes/login/page'
import { DashboardPage } from '@/routes/dashboard/page'
import { AppShell } from '@/design-system/templates/AppShell'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
    ],
  },
])
