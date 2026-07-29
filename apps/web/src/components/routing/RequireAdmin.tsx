import { Navigate, Outlet } from 'react-router-dom'

import { hasAdminAccess } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

export function RequireAdmin() {
  const session = useAuthStore((state) => state.session)

  if (!hasAdminAccess(session?.user.roleCodes)) {
    return <Navigate replace to="/app/dashboard" />
  }

  return <Outlet />
}
