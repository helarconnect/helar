import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuthStore } from '@/store/auth-store'

export function RequireCbtAccess({ children }: { children: ReactNode }) {
  const session = useAuthStore((state) => state.session)

  if (session?.user.roleCodes.includes('judge')) {
    return <Navigate replace to="/app/dashboard" />
  }

  return <>{children}</>
}

