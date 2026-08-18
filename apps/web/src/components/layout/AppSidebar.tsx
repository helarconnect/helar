import { BookOpenText, CheckSquare, ChevronDown, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { BrandMark } from '@/components/ui/BrandMark'
import { useTheme } from '@/hooks/useTheme'
import { fetchLibraryHelarpedia, fetchLibraryLawReports } from '@/lib/admin-api'
import { getDashboardNav } from '@/lib/mock-api'
import { queryKeys } from '@/lib/query-keys'
import { cn, hasAdminAccess, isContentAdmin, isSuperAdmin } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useUiStore } from '@/store/ui-store'

const defaultLibraryFilters = {
  materialType: "all" as const,
  page: 1,
  pageSize: 12,
  search: "",
  sortBy: "reportNumber" as const,
  sortOrder: "desc" as const
};

// Minimum gap between two prefetch calls for the same library section. We use
// 55 seconds so it stays comfortably under the 60s staleTime window — any
// hover / mouseenter that falls inside this window is a no-op (no network).
// This prevents the classic triple-fetch problem: sidebar-mount → Library
// trigger-hover → submenu-row-hover all firing prefetch for the same first
// page within a 2-second window.
const PREFETCH_DEDUP_MS = 55_000;

type SidebarNavItem = { href: string; label: string }
type SidebarNavGroup = { label: string; children: SidebarNavItem[] }
type SidebarLibraryItem = SidebarNavItem | SidebarNavGroup

export function AppSidebar() {
  const closeSidebar = useUiStore((state) => state.closeSidebar)
  const session = useAuthStore((state) => state.session)
  const { isDark } = useTheme()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Module-scope (per-mount) timestamps — survives re-renders, resets on
  // client-side navigation reload but NOT on React strict-mode double-mount.
  const lastPrefetchAtRef = useRef<Map<string, number>>(new Map());
  const roleCodes = session?.user.roleCodes ?? []
  const userName = session?.user.fullName ?? 'Chidi Adebayo'
  const isAdminWorkspace = hasAdminAccess(roleCodes)
  const userTrack = isSuperAdmin(roleCodes)
    ? 'Super admin workspace'
    : isContentAdmin(roleCodes)
      ? 'Content admin workspace'
      : isAdminWorkspace
        ? 'Admin workspace'
        : 'Student workspace'
  const navigationItems = getDashboardNav(roleCodes)

  // Deduplicated prefetch helper. Checks both the React Query cache state AND
  // the last-fired timestamp so we never issue a duplicate network call for
  // the same first-page list inside the 60s stale window.
  const prefetchLibrarySection = useMemo(() => {
    const sectionFetchers: Record<string, () => Promise<unknown>> = {
      "student-law-reports": () => fetchLibraryLawReports(defaultLibraryFilters),
      "student-helarpedia": () => fetchLibraryHelarpedia(defaultLibraryFilters),
    };
    return (section: "student-law-reports" | "student-helarpedia") => {
      const now = Date.now();
      const lastAt = lastPrefetchAtRef.current.get(section) ?? 0;
      if (now - lastAt < PREFETCH_DEDUP_MS) return;
      const queryKey = queryKeys.adminLibrary(section, defaultLibraryFilters);
      const cached = queryClient.getQueryState(queryKey);
      if (cached && cached.data) {
        // Already cached — update the in-ref timestamp so next hover short
        // circuits even faster, no work needed.
        lastPrefetchAtRef.current.set(section, now);
        return;
      }
      lastPrefetchAtRef.current.set(section, now);
      void queryClient.prefetchQuery({
        queryKey,
        queryFn: sectionFetchers[section],
        staleTime: 60_000,
      });
    };
  }, [queryClient]);

  // Prefetch both library list results ONCE per session mount (deduped by the
  // helper above — if mount fires at 0s and user hovers at 2s the hover call
  // is a no-op, not a duplicate network call).
  const firstPageLawReportsCacheKey = useMemo(
    () => JSON.stringify(defaultLibraryFilters),
    []
  );
  useEffect(() => {
    prefetchLibrarySection('student-law-reports');
    prefetchLibrarySection('student-helarpedia');
  }, [prefetchLibrarySection, firstPageLawReportsCacheKey]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(
    location.pathname.startsWith('/app/admin/library') || location.pathname.startsWith('/app/library'),
  )
  const [isCbtOpen, setIsCbtOpen] = useState(
    location.pathname.startsWith('/app/admin/cbt'),
  )
  const [isBarFinalExamOpen, setIsBarFinalExamOpen] = useState(
    location.pathname.startsWith('/app/bar-final-exams') || location.pathname.startsWith('/app/admin/bar-final-exams'),
  )
  const [isSubjectSummariesOpen, setIsSubjectSummariesOpen] = useState(
    location.pathname === '/app/admin/library/cases-and-ratios' || location.pathname === '/app/library/cases-and-ratios',
  )

  useEffect(() => {
    if (location.pathname.startsWith('/app/admin/library') || location.pathname.startsWith('/app/library')) {
      setIsLibraryOpen(true)
    }
    if (location.pathname.startsWith('/app/admin/cbt')) {
      setIsCbtOpen(true)
    }
    if (location.pathname.startsWith('/app/bar-final-exams') || location.pathname.startsWith('/app/admin/bar-final-exams')) {
      setIsBarFinalExamOpen(true)
    }
    if (location.pathname === '/app/admin/library/cases-and-ratios' || location.pathname === '/app/library/cases-and-ratios') {
      setIsSubjectSummariesOpen(true)
    }
  }, [location.pathname])

  function isLibraryHrefActive(href: string) {
    const url = new URL(href, 'http://localhost')
    if (location.pathname !== url.pathname) {
      return false
    }
    const expectedModuleType = url.searchParams.get('moduleType')
    if (!expectedModuleType) {
      return true
    }
    const currentModuleType = new URLSearchParams(location.search).get('moduleType')
    return (currentModuleType || 'FACULTY') === expectedModuleType
  }

  function isBarFinalExamHrefActive(href: string) {
    if (location.pathname === href) {
      return true
    }

    return location.pathname.startsWith(`${href}/`)
  }

  const libraryItems: SidebarLibraryItem[] = isAdminWorkspace
    ? [
        { href: '/app/admin/library/law-reports', label: 'Law Reports' },
        { href: '/app/admin/library/helarpedia', label: 'Helarpedia' },
        { href: '/app/admin/library/subject-summaries', label: 'Cases and Ratios' },
        {
          label: 'Subject Summaries',
          children: [
            { href: '/app/admin/library/cases-and-ratios?moduleType=FACULTY', label: 'Faculty summaries' },
            { href: '/app/admin/library/cases-and-ratios?moduleType=NLS', label: 'NLS summaries' },
          ],
        },
      ]
    : [
        { href: '/app/library/law-reports', label: 'Law Reports' },
        { href: '/app/library/helarpedia', label: 'Helarpedia' },
        { href: '/app/library/subject-summaries', label: 'Cases and Ratios' },
        {
          label: 'Subject Summaries',
          children: [
            { href: '/app/library/cases-and-ratios?moduleType=FACULTY', label: 'Faculty summaries' },
            { href: '/app/library/cases-and-ratios?moduleType=NLS', label: 'NLS summaries' },
          ],
        },
      ]

  const cbtItems = isAdminWorkspace
    ? [
        { href: '/app/admin/cbt', label: 'CBT Management' },
        { href: '/app/admin/cbt/question-bank', label: 'Question Bank' },
      ]
    : []

  const barFinalExamItems: SidebarNavItem[] = isAdminWorkspace
    ? [
        { href: '/app/admin/bar-final-exams-nls-mcq', label: 'NLS Theory' },
        { href: '/app/admin/bar-final-exams-mcq', label: 'MCQ' },
      ]
    : [
        { href: '/app/bar-final-exams-nls-mcq', label: 'NLS Theory' },
        { href: '/app/bar-final-exams-mcq', label: 'MCQ' },
      ]

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden p-5 shadow-[0_30px_100px_rgba(2,8,20,0.26)]',
        isDark
          ? 'border-r border-white/10 bg-[linear-gradient(180deg,#111b32_0%,#162545_100%)]'
          : 'border-r border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f8fc_100%)]',
      )}
    >
      <div className={cn('flex items-center justify-between gap-3 border-b pb-5', isDark ? 'border-white/10' : 'border-slate-200')}>
        <BrandMark className={isDark ? 'text-white' : 'text-slate-950'} />
        <button
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-2xl border lg:hidden',
            isDark ? 'border-white/15 bg-white/5 text-slate-200' : 'border-slate-200 bg-white text-slate-700',
          )}
          onClick={closeSidebar}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className={cn('mt-6 rounded-[24px] border p-4', isDark ? 'border-white/10 bg-white/6' : 'border-slate-200 bg-slate-50')}>
        <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-white/45' : 'text-slate-400')}>Active workspace</p>
        <p className={cn('mt-3 text-xl font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{userName}</p>
        <p className={cn('mt-1 text-sm', isDark ? 'text-white/68' : 'text-slate-600')}>{userTrack}</p>
      </div>
      <div className="mt-6 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const shouldShowLibraryTrigger = !isAdminWorkspace && item.href === '/app/library'
          const shouldShowAdminLibraryAfterItem = isAdminWorkspace && item.href === '/app/admin/users'
          const shouldShowAdminCbtAfterItem = isAdminWorkspace && item.href === '/app/admin/cbt'
          const shouldShowBarFinalExamTrigger = item.href === '/app/bar-final-exams-nls-mcq' || item.href === '/app/admin/bar-final-exams-nls-mcq'

          return (
            <div key={item.href}>
              {!shouldShowLibraryTrigger && !shouldShowAdminCbtAfterItem && !shouldShowBarFinalExamTrigger ? (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm uppercase tracking-[0.12em] transition',
                      isDark
                        ? 'border-transparent text-white/75 hover:border-white/10 hover:bg-white/6 hover:text-white'
                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                      isActive && (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                    )
                  }
                  onClick={closeSidebar}
                  to={item.href}
                >
                  <Icon className="h-4 w-4 text-[color:var(--color-accent-strong)]" />
                  <span>{item.label}</span>
                </NavLink>
              ) : null}

              {shouldShowBarFinalExamTrigger ? (
                <div className="mt-2">
                  <button
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm uppercase tracking-[0.12em] transition',
                      isDark
                        ? 'border-transparent text-white/75 hover:border-white/10 hover:bg-white/6 hover:text-white'
                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                      (location.pathname.startsWith('/app/bar-final-exams') || location.pathname.startsWith('/app/admin/bar-final-exams')) &&
                        (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                    )}
                    onClick={() => setIsBarFinalExamOpen((current) => !current)}
                    type="button"
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-[color:var(--color-accent-strong)]" />
                      <span>Bar Final Exam</span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 transition', isBarFinalExamOpen ? 'rotate-180' : '')} />
                  </button>

                  {isBarFinalExamOpen ? (
                    <div className="mt-2 space-y-2 pl-4">
                      {barFinalExamItems.map((barItem) => (
                        <NavLink
                          key={barItem.href}
                          className={() =>
                            cn(
                              'flex items-center rounded-2xl border px-4 py-3 text-sm transition',
                              isDark
                                ? 'border-transparent text-white/70 hover:border-white/10 hover:bg-white/6 hover:text-white'
                                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                              isBarFinalExamHrefActive(barItem.href) &&
                                (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                            )
                          }
                          onClick={closeSidebar}
                          to={barItem.href}
                        >
                          {barItem.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {shouldShowLibraryTrigger || shouldShowAdminLibraryAfterItem ? (
                <div className="mt-2">
                  <button
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm uppercase tracking-[0.12em] transition',
                      isDark
                        ? 'border-transparent text-white/75 hover:border-white/10 hover:bg-white/6 hover:text-white'
                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                      (location.pathname.startsWith('/app/admin/library') || location.pathname.startsWith('/app/library')) &&
                        (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                    )}
                    onClick={() => setIsLibraryOpen((current) => !current)}
                    onMouseEnter={() => {
                      // Warm both library lists the moment the user hovers
                      // the Library dropdown. By the time the menu animates
                      // open the first-page fetch has usually already landed,
                      // so the click to open the list is instant.
                      prefetchLibrarySection('student-law-reports');
                      prefetchLibrarySection('student-helarpedia');
                    }}
                    type="button"
                  >
                    <span className="flex items-center gap-3">
                      <BookOpenText className="h-4 w-4 text-[color:var(--color-accent-strong)]" />
                      <span>Library</span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 transition', isLibraryOpen ? 'rotate-180' : '')} />
                  </button>

                  {isLibraryOpen ? (
                    <div className="mt-2 space-y-2 pl-4">
                      {libraryItems.map((libraryItem) =>
                        'href' in libraryItem ? (
                          <NavLink
                            key={libraryItem.href}
                            className={() =>
                              cn(
                                'flex items-center rounded-2xl border px-4 py-3 text-sm transition',
                                isDark
                                  ? 'border-transparent text-white/70 hover:border-white/10 hover:bg-white/6 hover:text-white'
                                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                                isLibraryHrefActive(libraryItem.href) &&
                                  (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                              )
                            }
                            onClick={closeSidebar}
                            onMouseEnter={() => {
                              // Warm each section-specific list as the user
                              // hovers the submenu row — this fires even if
                              // the Library trigger was never hovered (e.g.
                              // dropdown already expanded from a previous visit).
                              if (libraryItem.href.includes('/law-reports')) {
                                prefetchLibrarySection('student-law-reports');
                              } else if (libraryItem.href.includes('/helarpedia')) {
                                prefetchLibrarySection('student-helarpedia');
                              }
                            }}
                            to={libraryItem.href}
                          >
                            {libraryItem.label}
                          </NavLink>
                        ) : (
                          <div key={libraryItem.label} className="space-y-2">
                            <button
                              className={cn(
                                'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition',
                                isDark
                                  ? 'border-transparent text-white/70 hover:border-white/10 hover:bg-white/6 hover:text-white'
                                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                                libraryItem.children.some((child) => isLibraryHrefActive(child.href)) &&
                                  (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                              )}
                              onClick={() => setIsSubjectSummariesOpen((current) => !current)}
                              type="button"
                            >
                              <span>{libraryItem.label}</span>
                              <ChevronDown className={cn('h-4 w-4 transition', isSubjectSummariesOpen ? 'rotate-180' : '')} />
                            </button>

                            {isSubjectSummariesOpen ? (
                              <div className="space-y-2 pl-4">
                                {libraryItem.children.map((child) => (
                                  <NavLink
                                    key={child.href}
                                    className={() =>
                                      cn(
                                        'flex items-center rounded-2xl border px-4 py-3 text-sm transition',
                                        isDark
                                          ? 'border-transparent text-white/70 hover:border-white/10 hover:bg-white/6 hover:text-white'
                                          : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                                        isLibraryHrefActive(child.href) &&
                                          (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                                      )
                                    }
                                    onClick={closeSidebar}
                                    to={child.href}
                                  >
                                    {child.label}
                                  </NavLink>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {shouldShowAdminCbtAfterItem ? (
                <div className="mt-2">
                  <button
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm uppercase tracking-[0.12em] transition',
                      isDark
                        ? 'border-transparent text-white/75 hover:border-white/10 hover:bg-white/6 hover:text-white'
                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                      location.pathname.startsWith('/app/admin/cbt') &&
                        (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                    )}
                    onClick={() => setIsCbtOpen((current) => !current)}
                    type="button"
                  >
                    <span className="flex items-center gap-3">
                      <CheckSquare className="h-4 w-4 text-[color:var(--color-accent-strong)]" />
                      <span>CBT</span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 transition', isCbtOpen ? 'rotate-180' : '')} />
                  </button>

                  {isCbtOpen ? (
                    <div className="mt-2 space-y-2 pl-4">
                      {cbtItems.map((cbtItem) => (
                        <NavLink
                          key={cbtItem.href}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center rounded-2xl border px-4 py-3 text-sm transition',
                              isDark
                                ? 'border-transparent text-white/70 hover:border-white/10 hover:bg-white/6 hover:text-white'
                                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
                              isActive && (isDark ? 'border-white/10 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-950'),
                            )
                          }
                          onClick={closeSidebar}
                          to={cbtItem.href}
                        >
                          {cbtItem.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
