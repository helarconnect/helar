import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { canAccessPayments } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

export function RequirePaymentAccess({ children }: { children: ReactNode }) {
  const session = useAuthStore((state) => state.session)

  if (!canAccessPayments(session?.user.roleCodes)) {
    return <Navigate replace to="/app/dashboard" />
  }

  return <>{children}</>
}
