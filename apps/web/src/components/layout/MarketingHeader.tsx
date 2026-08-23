import { motion } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isMobileMenuOpen])

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
          <button
            aria-label="Open menu"
            aria-expanded={isMobileMenuOpen}
            className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-white/20 text-stone-100 transition hover:bg-white/10 lg:hidden"
            onClick={() => setIsMobileMenuOpen(true)}
            type="button"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-4 right-4 top-4 rounded-[22px] border border-white/10 bg-[rgba(12,18,34,0.9)] p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            initial={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">Menu</p>
              <button
                aria-label="Close menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/5 transition hover:bg-white/10"
                onClick={() => setIsMobileMenuOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              {marketingLinks.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold transition hover:bg-white/10',
                      isActive && 'border-[color:var(--color-accent-strong)]/40 bg-white/10',
                    )
                  }
                  key={`${item.label}-${item.href}-mobile`}
                  onClick={() => setIsMobileMenuOpen(false)}
                  to={item.href}
                >
                  <span>{item.label}</span>
                  <ArrowRight className="h-4 w-4 text-white/70" />
                </NavLink>
              ))}
            </div>

            <div className="mt-6 grid gap-2">
              {isAuthenticated ? (
                <>
                  <Link
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold transition hover:bg-white/10"
                    onClick={() => setIsMobileMenuOpen(false)}
                    to="/app/dashboard"
                  >
                    <span>Dashboard</span>
                    <ArrowRight className="h-4 w-4 text-white/70" />
                  </Link>
                  <button
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left text-sm font-semibold transition hover:bg-white/10"
                    onClick={() => {
                      clearSession()
                      setIsMobileMenuOpen(false)
                    }}
                    type="button"
                  >
                    <span>Log out</span>
                    <ArrowRight className="h-4 w-4 text-white/70" />
                  </button>
                </>
              ) : (
                <>
                  <Link
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold transition hover:bg-white/10"
                    onClick={() => setIsMobileMenuOpen(false)}
                    to="/auth/sign-in"
                  >
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4 text-white/70" />
                  </Link>
                  <Link
                    className="flex items-center justify-between rounded-2xl border border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/15 px-4 py-4 text-sm font-semibold text-white transition hover:bg-[color:var(--color-accent)]/25"
                    onClick={() => setIsMobileMenuOpen(false)}
                    to="/auth/sign-up"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4 text-white" />
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </header>
  )
}
