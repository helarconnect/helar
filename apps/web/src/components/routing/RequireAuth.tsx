import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '@/store/auth-store'

export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace to={`/auth/sign-in?redirect=${encodeURIComponent(redirect)}`} />
  }

  return <Outlet />
}
