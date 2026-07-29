import { AdminDashboardPage } from '@/pages/AdminDashboardPage'
import { SuperAdminDashboardPage } from '@/pages/SuperAdminDashboardPage'
import { StudentDashboardPage } from '@/pages/StudentDashboardPage'
import { useAuthStore } from '@/store/auth-store'
import { hasAdminAccess, hasExecutiveDashboardAccess } from '@/lib/utils'

export function WorkspaceDashboardPage() {
  const session = useAuthStore((state) => state.session)
  const roleCodes = session?.user.roleCodes ?? []

  if (hasExecutiveDashboardAccess(roleCodes)) {
    return <SuperAdminDashboardPage />
  }

  if (hasAdminAccess(roleCodes)) {
    return <AdminDashboardPage />
  }

  return <StudentDashboardPage />
}
