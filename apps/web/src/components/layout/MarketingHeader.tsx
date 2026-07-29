import { motion } from 'framer-motion'
import { ArrowRight, Menu } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { BrandMark } from '@/components/ui/BrandMark'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

const marketingLinks = [
  { href: '/', label: 'Home' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/connect', label: 'Helar Connect' },
  { href: '/contact', label: 'Contact' },
]

export function MarketingHeader() {
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const clearSession = useAuthStore((state) => state.clearSession)

  return (
    <header
      className={
        isHomePage
          ? 'absolute inset-x-0 top-0 z-40 text-white'
          : 'sticky top-0 z-40 border-b border-white/10 bg-[rgba(12,18,34,0.78)] text-white backdrop-blur-xl'
      }
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-6 lg:px-10"
        initial={{ opacity: 0, y: -18 }}
        transition={{ duration: 0.45 }}
      >
        <BrandMark className="text-white" />
        <nav className="hidden items-center gap-7 lg:flex">
          {marketingLinks.map((item) => (
            <NavLink
              key={`${item.label}-${item.href}`}
              className={({ isActive }) =>
                cn(
                  'nav-link-legal text-[0.98rem] text-white/82 transition hover:text-white',
                  isActive && 'text-[color:var(--color-accent-strong)]'
                )
              }
              to={item.href}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {isHomePage ? (
            <>
              {isAuthenticated ? (
                <>
                  <Link
                    className="hidden items-center gap-2 rounded-sm border border-white/20 px-5 py-3 font-heading text-sm text-white transition hover:bg-white/10 md:inline-flex"
                    to="/app/dashboard"
                  >
                    Dashboard
                  </Link>
                  <button
                    className="hidden font-heading text-base text-white/78 transition hover:text-white md:inline-flex"
                    onClick={clearSession}
                    type="button"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  className="hidden items-center gap-2 rounded-sm border border-[color:var(--color-accent)] px-5 py-3 font-heading text-sm text-white transition hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-surface)] md:inline-flex"
                  to="/auth/sign-in"
                >
                  Login
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </>
          ) : (
            <>
              <Link className="hidden font-heading text-base text-white/78 transition hover:text-white md:inline-flex" to="/auth/sign-in">
                Sign in
              </Link>
              <Link className="hidden items-center gap-2 rounded-sm border border-[color:var(--color-accent)] px-5 py-3 font-heading text-sm text-white transition hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-surface)] md:inline-flex" to="/auth/sign-up">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
          <Link className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-white/20 text-stone-100 transition hover:bg-white/10 lg:hidden" to="/pricing">
            <Menu className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    </header>
  )
}
