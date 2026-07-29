import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthUser = {
  addressLine1?: string
  addressLine2?: string
  avatarUrl?: string
  city?: string
  id: string
  fullName: string
  email: string
  emailVerifiedAt: string | null
  phoneNumber?: string
  sex?: 'MALE' | 'FEMALE'
  institutionName?: string
  institutionOtherName?: string
  institutionState?: string
  postalCode?: string
  roleCodes: string[]
  state?: string
  institutionId: string
  twoFactorEnabled: boolean
  country?: string
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: AuthUser
}

type AuthStore = {
  hasHydrated: boolean
  session: AuthSession | null
  isAuthenticated: boolean
  setHasHydrated: (value: boolean) => void
  setSession: (session: AuthSession) => void
  updateSessionUser: (user: Partial<AuthUser>) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      hasHydrated: false,
      session: null,
      isAuthenticated: false,
      setHasHydrated: (value) =>
        set({
          hasHydrated: value,
        }),
      setSession: (session) =>
        set({
          session,
          isAuthenticated: true,
        }),
      updateSessionUser: (user) =>
        set((state) => ({
          session: state.session
            ? {
                ...state.session,
                user: {
                  ...state.session.user,
                  ...user,
                },
              }
            : null,
        })),
      clearSession: () =>
        set({
          session: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'helar-auth-session',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
