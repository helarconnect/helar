import { create } from 'zustand'

export type BillingCycle = 'monthly' | 'annual'
export type ThemeMode = 'dark' | 'light'

type UiStore = {
  billingCycle: BillingCycle
  isSidebarOpen: boolean
  theme: ThemeMode
  setBillingCycle: (billingCycle: BillingCycle) => void
  toggleSidebar: () => void
  closeSidebar: () => void
  toggleTheme: () => void
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const storedTheme = window.localStorage.getItem('lexlearn-theme')
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useUiStore = create<UiStore>((set, get) => ({
  billingCycle: 'annual',
  isSidebarOpen: false,
  theme: getInitialTheme(),
  setBillingCycle: (billingCycle) => set({ billingCycle }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark'
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lexlearn-theme', nextTheme)
    }
    set({ theme: nextTheme })
  },
}))
