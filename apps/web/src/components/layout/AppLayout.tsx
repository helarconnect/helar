import { AlertCircle, ChevronDown, LogOut, MailCheck, Menu, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AppSidebar } from '@/components/layout/AppSidebar'
import { AdminNotificationBell } from '@/components/layout/AdminNotificationBell'
import { LibrarySearchControl } from '@/components/layout/LibrarySearchControl'
import { StudyNotesFab } from '@/components/layout/StudyNotesFab'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { useTheme } from '@/hooks/useTheme'
import { cn, hasAdminAccess, isContentAdmin, isSuperAdmin } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useUiStore } from '@/store/ui-store'

const studentPageTitles: Record<string, string> = {
  '/app/library/cases-and-ratios': 'Cases and Ratios',
  '/app/bar-final-exams-nls-mcq': 'Bar Final Exam • NLS Theory',
  '/app/bar-final-exams-mcq': 'Bar Final Exam • MCQ',
  '/app/dashboard': 'Student Dashboard',
  '/app/library': 'Library',
  '/app/library/law-reports': 'Law Reports',
  '/app/profile': 'Profile',
  '/app/library/subject-summaries': 'Cases and Ratios',
  '/app/subscription': 'Subscription',
}

const adminPageTitles: Record<string, string> = {
  '/app/admin/content': 'Content Review',
  '/app/admin/library/cases-and-ratios': 'Cases and Ratios',
  '/app/admin/library/cases-and-ratios/materials': 'Subject Summary Materials',
  '/app/admin/library/law-reports': 'Law Reports',
  '/app/admin/library/subject-summaries': 'Cases and Ratios',
  '/app/admin/library/subject-summaries/cases': 'Subject Summary Cases',
  '/app/admin/library/subject-summaries/materials': 'Cases and Ratios Materials',
  '/app/admin/library/subject-summaries/subjects': 'Subject Summary Subjects',
  '/app/admin/library/subject-summaries/topics': 'Subject Summary Topics',
  '/app/admin/bar-final-exams-nls-mcq': 'Bar Final Exam • NLS Theory',
  '/app/admin/bar-final-exams-mcq': 'Bar Final Exam • MCQ',
  '/app/admin/payments': 'Payments',
  '/app/admin/settings': 'Admin Settings',
  '/app/admin/users': 'User Management',
  '/app/dashboard': 'Admin Dashboard',
  '/app/profile': 'Profile',
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const closeSidebar = useUiStore((state) => state.closeSidebar)
  const session = useAuthStore((state) => state.session)
  const clearSession = useAuthStore((state) => state.clearSession)
  const { isDark } = useTheme()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false)
  const roleCodes = session?.user.roleCodes ?? []
  const isEmailVerificationPending = session?.user.emailVerifiedAt === null
  const isAdminWorkspace = hasAdminAccess(roleCodes)
  const isSuperAdminWorkspace = isSuperAdmin(roleCodes)
  const isContentAdminWorkspace = isContentAdmin(roleCodes)
  const pageTitles = isAdminWorkspace ? adminPageTitles : studentPageTitles
  const pageTitle =
    (location.pathname === '/app/dashboard'
      ? isSuperAdminWorkspace
        ? 'Super Admin Dashboard'
        : isContentAdminWorkspace
          ? 'Content Admin Dashboard'
          : pageTitles[location.pathname]
      : pageTitles[location.pathname]) ??
    (location.pathname.startsWith('/app/library/law-reports/')
      ? 'Law Report Reader'
      : location.pathname.startsWith('/app/library/subject-summaries/cases/')
        ? 'Case Detail'
        : location.pathname.startsWith('/app/bar-final-exams-nls-mcq/')
          ? 'Bar Final Exam'
          : location.pathname.startsWith('/app/admin/bar-final-exams-nls-mcq/')
            ? 'Bar Final Exam'
        : location.pathname.startsWith('/app/admin/library/law-reports/')
          ? 'Law Report Reader'
          : location.pathname.startsWith('/app/admin/library/subject-summaries/cases/')
            ? 'Case Detail'
            : 'Workspace')
  const moduleType = new URLSearchParams(location.search).get('moduleType') === 'NLS' ? 'NLS' : 'FACULTY'
  const modulePageTitle =
    moduleType === 'NLS' ? 'NLS Summaries' : 'Faculty Summaries'
  const resolvedPageTitle =
    location.pathname === '/app/library/cases-and-ratios' || location.pathname === '/app/admin/library/cases-and-ratios'
      ? modulePageTitle
      : pageTitle
  const userName = session?.user.fullName ?? 'Helar learner'

  function handleLogout() {
    clearSession()
    setIsProfileMenuOpen(false)
    navigate('/')
  }

  useEffect(() => {
    if (session?.user.email && session.user.emailVerifiedAt === null) {
      setShowVerificationPrompt(true)
      return
    }

    setShowVerificationPrompt(false)
  }, [session?.user.email, session?.user.emailVerifiedAt])

  useEffect(() => {
    if (isAdminWorkspace) {
      return
    }

    const preventReadOnlyCopyAction = (event: Event) => {
      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
    }

    const preventReadOnlyShortcut = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      const isCopyShortcut = (event.ctrlKey || event.metaKey) && ['a', 'c', 'x'].includes(event.key.toLowerCase())

      if (isCopyShortcut) {
        event.preventDefault()
      }
    }

    document.addEventListener('copy', preventReadOnlyCopyAction)
    document.addEventListener('cut', preventReadOnlyCopyAction)
    document.addEventListener('contextmenu', preventReadOnlyCopyAction)
    document.addEventListener('dragstart', preventReadOnlyCopyAction)
    document.addEventListener('selectstart', preventReadOnlyCopyAction)
    document.addEventListener('keydown', preventReadOnlyShortcut)

    return () => {
      document.removeEventListener('copy', preventReadOnlyCopyAction)
      document.removeEventListener('cut', preventReadOnlyCopyAction)
      document.removeEventListener('contextmenu', preventReadOnlyCopyAction)
      document.removeEventListener('dragstart', preventReadOnlyCopyAction)
      document.removeEventListener('selectstart', preventReadOnlyCopyAction)
      document.removeEventListener('keydown', preventReadOnlyShortcut)
    }
  }, [isAdminWorkspace])

  return (
    <div
      className={cn(
        'min-h-screen',
        !isAdminWorkspace && 'student-no-copy',
        isDark
          ? 'bg-[radial-gradient(circle_at_top_left,rgba(254,83,61,0.08),transparent_20%),linear-gradient(180deg,#0b1220_0%,#111827_100%)]'
          : 'bg-[radial-gradient(circle_at_top_left,rgba(254,83,61,0.08),transparent_20%),linear-gradient(180deg,#f5f7fb_0%,#eef3f8_100%)]',
      )}
    >
      <div className="min-h-screen w-full">
        <div className="fixed inset-y-0 left-0 z-30 hidden w-[290px] lg:block">
          <AppSidebar />
        </div>
        {isSidebarOpen ? (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={closeSidebar}>
            <div className="h-full w-[88%] max-w-[320px]" onClick={(event) => event.stopPropagation()}>
              <AppSidebar />
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            'min-h-screen overflow-x-hidden overflow-y-visible shadow-[0_30px_120px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:ml-[290px]',
            isDark
              ? 'border-l border-slate-800 bg-[rgba(11,18,32,0.72)]'
              : 'border-l border-slate-200/80 bg-[rgba(255,255,255,0.72)]',
          )}
        >
          <div
            className={cn(
              'flex items-center justify-between gap-4 border-b px-5 py-5 sm:px-8',
              isDark ? 'border-slate-800 bg-slate-950/55' : 'border-slate-200/80 bg-white/72',
            )}
          >
            <div className="flex items-center gap-3">
              <button
                className={cn(
                  'inline-flex h-11 w-11 items-center justify-center rounded-2xl border lg:hidden',
                  isDark ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900',
                )}
                onClick={toggleSidebar}
                type="button"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <p className={cn('text-xs uppercase tracking-[0.26em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Workspace</p>
                <h1 className={cn('mt-1 font-heading text-3xl', isDark ? 'text-white' : 'text-slate-950')}>{resolvedPageTitle}</h1>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <ThemeToggle />
              <LibrarySearchControl audience={isAdminWorkspace ? 'admin' : 'student'} />
              {isAdminWorkspace ? (
                <AdminNotificationBell isDark={isDark} isSuperAdminWorkspace={isSuperAdminWorkspace} />
              ) : null}

              <div className="relative">
                <button
                  className={cn(
                    'flex items-center gap-3 rounded-full border px-4 py-2 transition',
                    isDark
                      ? 'border-slate-700 bg-slate-900 text-white hover:border-slate-600'
                      : 'border-slate-200 bg-white text-slate-950 hover:border-slate-300',
                  )}
                  onClick={() => setIsProfileMenuOpen((current) => !current)}
                  type="button"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-medium text-white">
                    {userName.charAt(0)}
                  </span>
                  <div className="text-left">
                    <p className={cn('text-sm font-medium', isDark ? 'text-white' : 'text-slate-950')}>{userName}</p>
                    <p className={cn('text-xs uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-400')}>
                      Synced just now
                    </p>
                  </div>
                  <ChevronDown className={cn('h-4 w-4 transition', isProfileMenuOpen && 'rotate-180')} />
                </button>

                {isProfileMenuOpen ? (
                  <div
                    className={cn(
                      'absolute right-0 top-[calc(100%+12px)] z-20 w-52 rounded-2xl border p-2 shadow-[0_24px_60px_rgba(15,23,42,0.16)]',
                      isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white',
                    )}
                  >
                    <Link
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition',
                        isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50',
                      )}
                      onClick={() => setIsProfileMenuOpen(false)}
                      to="/app/profile"
                    >
                      <User className="h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                    <button
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition',
                        isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50',
                      )}
                      onClick={handleLogout}
                      type="button"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {isEmailVerificationPending && session?.user.email ? (
            <div
              className={cn(
                'border-b px-5 py-4 sm:px-8',
                isDark ? 'border-amber-500/20 bg-amber-500/10' : 'border-amber-200 bg-amber-50/90',
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl',
                      isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-700',
                    )}
                  >
                    <MailCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold', isDark ? 'text-amber-100' : 'text-amber-950')}>
                      Verify your email to fully activate your Helar account
                    </p>
                    <p className={cn('mt-1 text-sm leading-6', isDark ? 'text-amber-200/85' : 'text-amber-900/80')}>
                      We sent a verification email to <span className="font-semibold">{session.user.email}</span>. Please
                      check your inbox and also check your spam or junk folder if you do not see it right away.
                    </p>
                  </div>
                </div>
                <button
                  className={cn(
                    'inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition',
                    isDark
                      ? 'border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100',
                  )}
                  onClick={() => setShowVerificationPrompt(true)}
                  type="button"
                >
                  View reminder
                </button>
              </div>
            </div>
          ) : null}
          <div className="p-5 sm:p-8">
            <Outlet />
          </div>
        </div>
      </div>
      <StudyNotesFab isAdminWorkspace={isAdminWorkspace} />
        {showVerificationPrompt && isEmailVerificationPending && session?.user.email ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div
            className={cn(
              'w-full max-w-xl rounded-[28px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:p-7',
              isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-950',
            )}
          >
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
                  isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-700',
                )}
              >
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-semibold uppercase tracking-[0.24em]', isDark ? 'text-amber-300' : 'text-amber-700')}>
                  Action required
                </p>
                <h2 className={cn('mt-2 text-2xl font-semibold', isDark ? 'text-white' : 'text-slate-950')}>
                  Please verify your email address
                </h2>
                <p className={cn('mt-3 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600')}>
                  You are signed in, but your Helar account is not verified yet. We sent a verification email to{' '}
                  <span className="font-semibold">{session.user.email}</span>.
                </p>
                <div
                  className={cn(
                    'mt-5 rounded-2xl border px-4 py-4 text-sm leading-6',
                    isDark ? 'border-slate-800 bg-slate-900/80 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700',
                  )}
                >
                  Please open that message and click the verification link. If it is not in your inbox, check your spam,
                  junk, and promotions folders as well.
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    className={cn(
                      'inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition',
                      isDark ? 'bg-white text-slate-950 hover:bg-slate-200' : 'bg-slate-950 text-white hover:bg-slate-800',
                    )}
                    onClick={() => setShowVerificationPrompt(false)}
                    type="button"
                  >
                    I will check my email
                  </button>
                  <button
                    className={cn(
                      'inline-flex items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold transition',
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                    )}
                    onClick={() => navigate('/app/profile')}
                    type="button"
                  >
                    Go to profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
