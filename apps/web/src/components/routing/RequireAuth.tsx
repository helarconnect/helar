import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '@/store/auth-store'

export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const session = useAuthStore((state) => state.session)
  const location = useLocation()

  if (!isAuthenticated || !session?.user.emailVerifiedAt) {
    const redirect = `${location.pathname}${location.search}${location.hash}`
    const verification = session && !session.user.emailVerifiedAt
      ? `&verification=required&email=${encodeURIComponent(session.user.email)}` : ''
    return <Navigate replace to={`/auth/sign-in?redirect=${encodeURIComponent(redirect)}${verification}`} />
  }

  return <Outlet />
}
