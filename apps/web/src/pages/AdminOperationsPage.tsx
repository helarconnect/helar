import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BriefcaseBusiness, CheckCheck, Download, FileClock, GraduationCap, LibraryBig, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AdminUsersWorkspace } from '@/components/admin/AdminUsersWorkspace'
import { useTheme } from '@/hooks/useTheme'
import {
  activateAdminSubscriptionManually,
  approveAdminLibraryMaterial,
  approveAdminSubjectSummaryCase,
  approveAdminSubjectSummaryEntry,
  declineAdminLibraryMaterial,
  declineAdminSubjectSummaryCase,
  declineAdminSubjectSummaryEntry,
  fetchAdminBillingSnapshot,
  fetchAdminContentReviewQueue,
} from '@/lib/admin-api'
import { fetchAdminDashboardSnapshot } from '@/lib/mock-api'
import { queryKeys } from '@/lib/query-keys'
import { cn, isSuperAdmin } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import type { AdminAccessRequest, AdminContentReviewItem, AdminPaymentIssue } from '@/types/domain'

function statusClasses(isDark: boolean, tone: 'amber' | 'blue' | 'green' | 'red' | 'slate') {
  const palette = {
    amber: isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-700',
    blue: isDark ? 'border-sky-500/30 bg-sky-500/10 text-sky-200' : 'border-sky-200 bg-sky-50 text-sky-700',
    green: isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-700',
    slate: isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700',
  } as const

  return palette[tone]
}

function AdminPanel({
  children,
  className,
  isDark,
}: {
  children: ReactNode
  className?: string
  isDark: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]',
        isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white',
        className,
      )}
    >
      {children}
    </section>
  )
}

function AdminStatusPill({
  children,
  isDark,
  tone,
}: {
  children: ReactNode
  isDark: boolean
  tone: 'amber' | 'blue' | 'green' | 'red' | 'slate'
}) {
  return <span className={cn('rounded-full border px-3 py-1 text-xs font-medium capitalize', statusClasses(isDark, tone))}>{children}</span>
}

function AdminPageHero({
  badge,
  description,
  title,
}: {
  badge: string
  description: string
  title: string
}) {
  return (
    <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#25112b_0%,#0f1f4d_55%,#112a5b_100%)] p-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.24)] lg:p-8">
      <p className="text-xs uppercase tracking-[0.24em] text-white/45">{badge}</p>
      <h2 className="mt-4 max-w-3xl font-heading text-3xl leading-tight text-white lg:text-[2.75rem]">{title}</h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">{description}</p>
    </section>
  )
}

function LoadingState() {
  const { isDark } = useTheme()

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className={cn('h-[220px] animate-pulse rounded-[30px]', isDark ? 'bg-slate-800/70' : 'bg-slate-200/70')} />
      <div className={cn('h-[220px] animate-pulse rounded-[30px]', isDark ? 'bg-slate-800/70' : 'bg-slate-200/70')} />
    </div>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

function downloadTableAsExcel(fileName: string, headers: string[], rows: string[][]) {
  const body = rows
    .map((columns) => `<tr>${columns.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`)
    .join('')
  const tableHtml = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table border="1">
          <thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>
  `

  downloadBlob(new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' }), fileName)
}

function saveTableAsPdf(title: string, subtitle: string, headers: string[], rows: string[][]) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900')

  if (!printWindow) {
    return false
  }

  const tableRows = rows
    .map((columns) => `<tr>${columns.map((value) => `<td>${escapeHtml(value || '-')}</td>`).join('')}</tr>`)
    .join('')

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
          h1 { margin-bottom: 6px; }
          p { color: #475569; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 12px; vertical-align: top; }
          th { background: #e2e8f0; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        <table>
          <thead>
            <tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}

function useAdminOperationsState() {
  const snapshotQuery = useQuery({
    queryKey: queryKeys.adminDashboard,
    queryFn: fetchAdminDashboardSnapshot,
  })

  const [accessRequests, setAccessRequests] = useState<AdminAccessRequest[]>([])
  const [reviewQueue, setReviewQueue] = useState<AdminContentReviewItem[]>([])
  const [paymentIssues, setPaymentIssues] = useState<AdminPaymentIssue[]>([])
  const [alerts, setAlerts] = useState<string[]>([])

  useEffect(() => {
    if (!snapshotQuery.data) {
      return
    }

    // Keep a local working copy so admin actions feel immediate while the data is still mocked.
    setAccessRequests(snapshotQuery.data.accessRequests)
    setReviewQueue(snapshotQuery.data.reviewQueue)
    setPaymentIssues(snapshotQuery.data.paymentIssues)
    setAlerts(snapshotQuery.data.liveAlerts)
  }, [snapshotQuery.data])

  const summary = useMemo(
    () => ({
      pendingApprovals: accessRequests.filter((item) => item.status !== 'approved').length,
      queuedReviews: reviewQueue.filter((item) => item.status !== 'approved').length,
      paymentEscalations: paymentIssues.filter((item) => item.status !== 'cleared').length,
    }),
    [accessRequests, paymentIssues, reviewQueue],
  )

  function updateAccessStatus(requestId: string, status: AdminAccessRequest['status']) {
    setAccessRequests((current) => current.map((request) => (request.id === requestId ? { ...request, status } : request)))
    setAlerts((current) => [`Access request ${status.replace('_', ' ')}.`, ...current].slice(0, 5))
  }

  function updateRequestedRole(requestId: string, requestedRole: string) {
    setAccessRequests((current) =>
      current.map((request) => (request.id === requestId ? { ...request, requestedRole } : request)),
    )
  }

  function updateReviewStatus(reviewId: string, status: AdminContentReviewItem['status']) {
    setReviewQueue((current) => current.map((item) => (item.id === reviewId ? { ...item, status } : item)))
    setAlerts((current) => [`Content item ${status.replace('_', ' ')}.`, ...current].slice(0, 5))
  }

  function updatePaymentStatus(paymentId: string, status: AdminPaymentIssue['status']) {
    setPaymentIssues((current) => current.map((item) => (item.id === paymentId ? { ...item, status } : item)))
    setAlerts((current) => [`Payment issue ${status}.`, ...current].slice(0, 5))
  }

  return {
    accessRequests,
    alerts,
    paymentIssues,
    reviewQueue,
    snapshotQuery,
    summary,
    updateAccessStatus,
    updatePaymentStatus,
    updateRequestedRole,
    updateReviewStatus,
  }
}

export function AdminUsersPage() {
  return <AdminUsersWorkspace />
}

export function AdminContentPage() {
  const { isDark } = useTheme()
  const queryClient = useQueryClient()
  const roleCodes = useAuthStore((state) => state.session?.user.roleCodes ?? [])
  const isSuperAdminWorkspace = isSuperAdmin(roleCodes)
  const pendingQueueRef = useRef<HTMLDivElement | null>(null)
  const [declineTarget, setDeclineTarget] = useState<null | {
    id: string
    resourceId: string
    title: string
    type: 'library_material' | 'subject_summary_case' | 'subject_summary_entry'
  }>(null)
  const [declineReason, setDeclineReason] = useState('')
  const contentReviewQuery = useQuery({
    queryKey: queryKeys.adminContentReview,
    queryFn: fetchAdminContentReviewQueue,
    enabled: isSuperAdminWorkspace,
  })

  const approveMutation = useMutation({
    mutationFn: async (item: { id: string; resourceId: string; type: 'library_material' | 'subject_summary_case' | 'subject_summary_entry' }) => {
      if (item.type === 'library_material') {
        return approveAdminLibraryMaterial(item.resourceId)
      }

      if (item.type === 'subject_summary_case') {
        return approveAdminSubjectSummaryCase(item.resourceId)
      }

      return approveAdminSubjectSummaryEntry(item.resourceId)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminContentReview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications }),
        queryClient.invalidateQueries({ queryKey: ['admin-library'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-module-admin-entries'] }),
      ])
    },
  })

  const declineMutation = useMutation({
    mutationFn: async (item: { id: string; reason: string; resourceId: string; type: 'library_material' | 'subject_summary_case' | 'subject_summary_entry' }) => {
      if (item.type === 'library_material') {
        return declineAdminLibraryMaterial(item.resourceId, item.reason)
      }

      if (item.type === 'subject_summary_case') {
        return declineAdminSubjectSummaryCase(item.resourceId, item.reason)
      }

      return declineAdminSubjectSummaryEntry(item.resourceId, item.reason)
    },
    onSuccess: async () => {
      setDeclineTarget(null)
      setDeclineReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminContentReview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications }),
        queryClient.invalidateQueries({ queryKey: ['admin-library'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-module-admin-entries'] }),
      ])
    },
  })

  if (isSuperAdminWorkspace && contentReviewQuery.isLoading) {
    return <LoadingState />
  }

  function openDeclineDialog(item: {
    id: string
    resourceId: string
    title: string
    type: 'library_material' | 'subject_summary_case' | 'subject_summary_entry'
  }) {
    setDeclineTarget(item)
    setDeclineReason('')
  }

  async function submitDecline() {
    if (!declineTarget || declineReason.trim().length < 3) {
      return
    }

    await declineMutation.mutateAsync({
      ...declineTarget,
      reason: declineReason.trim(),
    })
  }

  const reviewQueue = contentReviewQuery.data
  const iconByType = {
    library_material: LibraryBig,
    subject_summary_case: GraduationCap,
    subject_summary_entry: FileClock,
  } as const

  if (!isSuperAdminWorkspace) {
    return (
      <div className="space-y-6">
        <AdminPageHero
          badge="Content review"
          description="This workspace is reserved for the super admin approval desk. Content admins submit materials here and receive notifications after approval."
          title="Your submissions move through the super admin review workflow."
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <AdminPanel isDark={isDark}>
            <div className="flex items-center gap-3">
              <span className={cn('inline-flex h-12 w-12 items-center justify-center rounded-2xl', isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-950')}>
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Approval flow</p>
                <h3 className={cn('mt-1 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Submission pipeline</h3>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                'Create or update your content inside the library and subject-summary workspaces.',
                'All publish-ready submissions move into the pending approval queue automatically.',
                'You receive a notification bell update as soon as the super admin approves the item.',
              ].map((item) => (
                <div
                  className={cn('rounded-[22px] border px-4 py-4 text-sm leading-6', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel isDark={isDark}>
            <div className="space-y-3">
              {[
                'Library uploads stay hidden from learners until approved.',
                'Subject summary cases stay in Pending Approval until published by super admin.',
                'Subject summary revision entries follow the same approval rule.',
              ].map((item) => (
                <div
                  className={cn('rounded-[20px] border px-4 py-4 text-sm leading-6', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </AdminPanel>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#25112b_0%,#0f1f4d_55%,#112a5b_100%)] p-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.24)] lg:p-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Content review</p>
            <h2 className="mt-4 max-w-4xl font-heading text-3xl leading-tight text-white lg:text-[2.75rem]">
              Run a professional approval desk for every pending content release.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200">
              Review every pending submission from the content admin, approve publication-ready items, and keep Helar
              releases consistent across the library and subject-summary modules.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  label: 'Total pending',
                  value: reviewQueue?.summary.totalPending ?? 0,
                },
                {
                  label: 'Submitted today',
                  value: reviewQueue?.summary.itemsSubmittedToday ?? 0,
                },
                {
                  label: 'Oldest pending',
                  value: `${reviewQueue?.summary.oldestPendingHours ?? 0}h`,
                },
              ].map((item) => (
                <div
                  className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-sm"
                  key={item.label}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">{item.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-slate-100"
                onClick={() => pendingQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                type="button"
              >
                Open pending queue
                <ArrowRight className="h-4 w-4" />
              </button>
              <AdminStatusPill isDark={isDark} tone="amber">
                {reviewQueue?.summary.totalPending ?? 0} waiting for decision
              </AdminStatusPill>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">Queue contents</p>
                <h3 className="mt-1 font-heading text-2xl text-white">What needs review</h3>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {[
                {
                  label: 'Library materials',
                  value: reviewQueue?.summary.libraryMaterials ?? 0,
                },
                {
                  label: 'Subject summary cases',
                  value: reviewQueue?.summary.subjectSummaryCases ?? 0,
                },
                {
                  label: 'Subject summary entries',
                  value: reviewQueue?.summary.subjectSummaryEntries ?? 0,
                },
              ].map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-slate-950/15 px-4 py-3"
                  key={item.label}
                >
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">Pending approval</p>
                  </div>
                  <span className="text-2xl font-semibold text-white">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[18px] border border-white/10 bg-slate-950/15 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Relevant info</p>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                All items in this desk were submitted by the content admin and remain hidden from learners until the
                super admin approves them.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]" ref={pendingQueueRef}>
        <AdminPanel className="scroll-mt-24" isDark={isDark}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div id="pending-approval-queue">
              <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Release workflow</p>
              <h3 className={cn('mt-1 font-heading text-3xl', isDark ? 'text-white' : 'text-slate-950')}>Pending approval queue</h3>
            </div>
            <AdminStatusPill isDark={isDark} tone="amber">
              {reviewQueue?.summary.totalPending ?? 0} waiting for decision
            </AdminStatusPill>
          </div>

          <div className="mt-6 space-y-3">
            {reviewQueue?.items.length ? (
              reviewQueue.items.map((item) => {
                const ItemIcon = iconByType[item.type]

                return (
                  <article
                    className={cn('rounded-[24px] border p-5', isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50')}
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <span className={cn('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-950')}>
                          <ItemIcon className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={cn('text-base font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{item.title}</p>
                            <AdminStatusPill isDark={isDark} tone="amber">
                              Pending approval
                            </AdminStatusPill>
                          </div>
                          <p className={cn('mt-2 text-sm', isDark ? 'text-slate-300' : 'text-slate-700')}>{item.subtitle}</p>
                          <div className={cn('mt-3 flex flex-wrap items-center gap-2 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                            <span>{item.contentTypeLabel}</span>
                            <span>•</span>
                            <span>Submitted by {item.submittedBy}</span>
                            <span>•</span>
                            <span>{new Date(item.createdAt).toLocaleString()}</span>
                          </div>
                          <Link className={cn('mt-3 inline-flex items-center gap-2 text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700')} to={item.reviewPath}>
                            Review content
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link className="button-secondary !px-4 !py-3" to={item.editPath}>
                        <span className="inline-flex items-center gap-2">
                          Edit
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </Link>
                      <button
                        className={cn(
                          'inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition',
                          isDark
                            ? 'border-rose-500/20 bg-rose-500/10 text-rose-100 hover:border-rose-400/30'
                            : 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300'
                        )}
                        disabled={declineMutation.isPending && declineMutation.variables?.id === item.id}
                        onClick={() => openDeclineDialog(item)}
                        type="button"
                      >
                        Decline
                      </button>
                      <button
                        className="button-primary !px-4 !py-3"
                        disabled={approveMutation.isPending && approveMutation.variables?.id === item.id}
                        onClick={() => void approveMutation.mutateAsync(item)}
                        type="button"
                      >
                        <span className="inline-flex items-center gap-2">
                          <CheckCheck className="h-4 w-4" />
                          {approveMutation.isPending && approveMutation.variables?.id === item.id ? 'Approving...' : 'Approve now'}
                        </span>
                      </button>
                    </div>
                  </article>
                )
              })
            ) : (
              <div className={cn('rounded-[24px] border px-5 py-10 text-center', isDark ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500')}>
                There are no pending approvals right now.
              </div>
            )}
          </div>
        </AdminPanel>

        <div className="space-y-6">
          <AdminPanel isDark={isDark}>
            <div className="flex items-center gap-3">
              <span className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-950')}>
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Desk summary</p>
                <h3 className={cn('mt-1 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>What to clear next</h3>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {[
                `${reviewQueue?.summary.subjectSummaryEntries ?? 0} subject summary entries are waiting in the revision queue.`,
                `${reviewQueue?.summary.subjectSummaryCases ?? 0} case records are waiting for publish approval.`,
                `${reviewQueue?.summary.libraryMaterials ?? 0} library materials still need executive sign-off.`,
              ].map((item) => (
                <div
                  className={cn('rounded-[20px] border px-4 py-4 text-sm leading-6', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel isDark={isDark}>
            <div className="space-y-3">
              {[
                `Oldest pending item has been waiting ${reviewQueue?.summary.oldestPendingHours ?? 0} hour(s).`,
                'Use Review content to open the exact record before making a decision.',
                'Approvals from this desk automatically notify the submitting content admin.',
              ].map((item) => (
                <div
                  className={cn('rounded-[20px] border px-4 py-4 text-sm leading-6', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </AdminPanel>
        </div>
      </div>

      {declineTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className={cn('w-full max-w-2xl rounded-[28px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]', isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Decline content</p>
                <h3 className={cn('mt-2 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Send revision feedback to the content admin</h3>
                <p className={cn('mt-3 text-sm leading-7', isDark ? 'text-slate-300' : 'text-slate-600')}>
                  Add a clear reason for declining <span className={cn('font-semibold', isDark ? 'text-white' : 'text-slate-950')}>"{declineTarget.title}"</span>. The content admin will receive this note in their notification.
                </p>
              </div>
              <button
                className={cn('rounded-full border px-3 py-1 text-sm', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600')}
                onClick={() => {
                  setDeclineTarget(null)
                  setDeclineReason('')
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-6">
              <label className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700')} htmlFor="decline-reason">
                Decline reason
              </label>
              <textarea
                className={cn(
                  'mt-3 min-h-[160px] w-full rounded-[22px] border px-4 py-4 text-sm outline-none transition',
                  isDark
                    ? 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'
                )}
                id="decline-reason"
                maxLength={500}
                onChange={(event) => setDeclineReason(event.target.value)}
                placeholder="Explain what needs to be corrected before this content can be approved."
                value={declineReason}
              />
              <div className={cn('mt-2 flex items-center justify-between text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
                <span>{declineReason.trim().length < 3 ? 'Enter at least 3 characters.' : 'This message will be sent to the content admin.'}</span>
                <span>{declineReason.length}/500</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="button-secondary !px-4 !py-3"
                onClick={() => {
                  setDeclineTarget(null)
                  setDeclineReason('')
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={cn(
                  'inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition',
                  isDark
                    ? 'border-rose-500/20 bg-rose-500/10 text-rose-100 hover:border-rose-400/30 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500'
                    : 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
                )}
                disabled={declineMutation.isPending || declineReason.trim().length < 3}
                onClick={() => void submitDecline()}
                type="button"
              >
                {declineMutation.isPending ? 'Sending decline...' : 'Decline with reason'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AdminPaymentsPage() {
  type PaymentWindowFilter = 'all' | 'current_month' | 'previous_month' | 'current_year' | 'previous_year'
  const { isDark } = useTheme()
  const queryClient = useQueryClient()
  const roleCodes = useAuthStore((state) => state.session?.user.roleCodes ?? [])
  const isSuperAdminWorkspace = isSuperAdmin(roleCodes)
  const [search, setSearch] = useState('')
  const [manualSearch, setManualSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<'all' | 'monthly' | 'six_months' | 'annual'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'inactive' | 'past_due' | 'canceled'>('all')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [tablePage, setTablePage] = useState(1)
  const [isManualActivationModalOpen, setIsManualActivationModalOpen] = useState(false)
  const [isRecentPaymentsModalOpen, setIsRecentPaymentsModalOpen] = useState(false)
  const [isFinancialStatementsModalOpen, setIsFinancialStatementsModalOpen] = useState(false)
  const [paymentsWindowFilter, setPaymentsWindowFilter] = useState<PaymentWindowFilter>('current_month')
  const [selectedPaymentYear, setSelectedPaymentYear] = useState<'all' | number>('all')
  const [manualPlanCode, setManualPlanCode] = useState<'monthly' | 'six_months' | 'annual'>('monthly')
  const [manualNote, setManualNote] = useState('')
  const [activeUserExport, setActiveUserExport] = useState<null | 'excel' | 'pdf'>(null)
  const [activePaymentExport, setActivePaymentExport] = useState<null | 'excel' | 'pdf'>(null)
  const [activeStatementExport, setActiveStatementExport] = useState<null | 'excel' | 'pdf'>(null)
  const [notice, setNotice] = useState<null | { message: string; tone: 'green' | 'red' }>(null)
  const billingQuery = useQuery({
    queryKey: queryKeys.adminBilling,
    queryFn: fetchAdminBillingSnapshot,
  })

  const activationMutation = useMutation({
    mutationFn: (payload: { note?: string; planCode: 'monthly' | 'six_months' | 'annual'; userId: string }) => activateAdminSubscriptionManually(payload),
    onSuccess: async (result) => {
      setNotice({
        message: `${result.user.fullName} now has an active ${result.subscription.plan.name.toLowerCase()}.`,
        tone: 'green',
      })
      setManualNote('')
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminBilling })
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error?.message ||
        error?.message ||
        'Could not activate the subscription right now.'

      setNotice({ message, tone: 'red' })
    },
  })

  useEffect(() => {
    if (!selectedUserId && billingQuery.data?.users[0]) {
      setSelectedUserId(billingQuery.data.users[0].id)
    }
  }, [billingQuery.data, selectedUserId])

  const filteredUsers = useMemo(() => {
    if (!billingQuery.data) {
      return []
    }

    const normalizedSearch = search.trim().toLowerCase()

    return billingQuery.data.users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.fullName.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        (user.phoneNumber ?? '').toLowerCase().includes(normalizedSearch)

      const matchesPlan =
        planFilter === 'all' ||
        user.subscriptionPlanCode === planFilter

      const matchesStatus = statusFilter === 'all' || user.subscriptionStatus === statusFilter

      return matchesSearch && matchesPlan && matchesStatus
    })
  }, [billingQuery.data, planFilter, search, statusFilter])

  const tablePageSize = 10
  const totalTablePages = Math.max(1, Math.ceil(filteredUsers.length / tablePageSize))
  const paginatedUsers = filteredUsers.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize)

  const manualActivationUsers = useMemo(() => {
    if (!billingQuery.data) {
      return []
    }

    const normalizedSearch = manualSearch.trim().toLowerCase()

    const matches = billingQuery.data.users.filter((user) => {
      if (!normalizedSearch) {
        return true
      }

      return (
        user.fullName.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        (user.phoneNumber ?? '').toLowerCase().includes(normalizedSearch)
      )
    })

    return matches.slice(0, 8)
  }, [billingQuery.data, manualSearch])

  const availablePaymentYears = useMemo(() => {
    if (!billingQuery.data) {
      return []
    }

    return Array.from(
      new Set(billingQuery.data.recentPayments.map((payment) => new Date(payment.createdAt).getFullYear()).filter((year) => Number.isFinite(year))),
    ).sort((left, right) => right - left)
  }, [billingQuery.data])

  const filteredRecentPayments = useMemo(() => {
    if (!billingQuery.data) {
      return []
    }

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const previousMonthDate = new Date(currentYear, currentMonth - 1, 1)
    const previousMonth = previousMonthDate.getMonth()
    const previousMonthYear = previousMonthDate.getFullYear()

    return billingQuery.data.recentPayments.filter((payment) => {
      const paymentDate = new Date(payment.createdAt)
      const paymentMonth = paymentDate.getMonth()
      const paymentYear = paymentDate.getFullYear()
      const matchesSelectedYear = selectedPaymentYear === 'all' || paymentYear === selectedPaymentYear

      if (!matchesSelectedYear) {
        return false
      }

      switch (paymentsWindowFilter) {
        case 'current_month':
          return paymentMonth === currentMonth && paymentYear === currentYear
        case 'previous_month':
          return paymentMonth === previousMonth && paymentYear === previousMonthYear
        case 'current_year':
          return paymentYear === currentYear
        case 'previous_year':
          return paymentYear === currentYear - 1
        default:
          return true
      }
    })
  }, [billingQuery.data, paymentsWindowFilter, selectedPaymentYear])

  const selectedUser =
    billingQuery.data?.users.find((user) => user.id === selectedUserId) ??
    manualActivationUsers[0] ??
    filteredUsers[0] ??
    null

  const paymentStatements = useMemo(() => {
    if (!billingQuery.data) {
      return []
    }

    const statements = new Map<
      string,
      {
        currency: string
        failedCount: number
        key: string
        label: string
        latestActivityAt: string
        month: number
        paymentCount: number
        pendingCount: number
        succeededCount: number
        totalAmountMinor: number
        year: number
      }
    >()

    for (const payment of billingQuery.data.recentPayments) {
      const paymentDate = new Date(payment.createdAt)
      const year = paymentDate.getFullYear()
      const month = paymentDate.getMonth()
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
      const existingStatement = statements.get(key)

      if (!existingStatement) {
        statements.set(key, {
          currency: payment.currency,
          failedCount: payment.status === 'FAILED' ? 1 : 0,
          key,
          label,
          latestActivityAt: payment.createdAt,
          month,
          paymentCount: 1,
          pendingCount: payment.status === 'PENDING' ? 1 : 0,
          succeededCount: payment.status === 'SUCCEEDED' ? 1 : 0,
          totalAmountMinor: payment.status === 'SUCCEEDED' ? payment.amountMinor : 0,
          year,
        })
        continue
      }

      existingStatement.paymentCount += 1
      existingStatement.latestActivityAt =
        new Date(payment.createdAt).getTime() > new Date(existingStatement.latestActivityAt).getTime()
          ? payment.createdAt
          : existingStatement.latestActivityAt

      if (payment.status === 'SUCCEEDED') {
        existingStatement.succeededCount += 1
        existingStatement.totalAmountMinor += payment.amountMinor
      } else if (payment.status === 'PENDING') {
        existingStatement.pendingCount += 1
      } else if (payment.status === 'FAILED') {
        existingStatement.failedCount += 1
      }
    }

    return Array.from(statements.values()).sort((left, right) => {
      if (left.year !== right.year) {
        return right.year - left.year
      }

      return right.month - left.month
    })
  }, [billingQuery.data])

  const currentMonthStatement = useMemo(() => {
    const now = new Date()

    return (
      paymentStatements.find((statement) => statement.year === now.getFullYear() && statement.month === now.getMonth()) ?? {
        currency: billingQuery.data?.recentPayments[0]?.currency ?? 'NGN',
        failedCount: 0,
        key: 'current-month',
        label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(now.getFullYear(), now.getMonth(), 1)),
        latestActivityAt: new Date().toISOString(),
        month: now.getMonth(),
        paymentCount: 0,
        pendingCount: 0,
        succeededCount: 0,
        totalAmountMinor: 0,
        year: now.getFullYear(),
      }
    )
  }, [billingQuery.data, paymentStatements])

  const previousFinancialStatements = useMemo(() => {
    const now = new Date()

    return paymentStatements.filter((statement) => !(statement.year === now.getFullYear() && statement.month === now.getMonth()))
  }, [paymentStatements])

  useEffect(() => {
    setTablePage(1)
  }, [search, planFilter, statusFilter])

  useEffect(() => {
    if (tablePage > totalTablePages) {
      setTablePage(totalTablePages)
    }
  }, [tablePage, totalTablePages])

  function formatShortDate(value: string | null) {
    if (!value) {
      return 'Not available'
    }

    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  }

  function formatLongDate(value: string | null) {
    if (!value) {
      return 'Not available'
    }

    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  }

  function formatCount(value: number) {
    return new Intl.NumberFormat('en-US').format(value)
  }

  function formatMoneyMinor(amountMinor: number, currency = 'NGN') {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amountMinor / 100)
  }

  function getSubscriptionTone(status: 'active' | 'canceled' | 'expired' | 'inactive' | 'past_due') {
    switch (status) {
      case 'active':
        return 'green' as const
      case 'past_due':
        return 'amber' as const
      case 'canceled':
      case 'expired':
        return 'red' as const
      default:
        return 'slate' as const
    }
  }

  function getPaymentTone(status: 'FAILED' | 'PENDING' | 'REFUNDED' | 'SUCCEEDED') {
    switch (status) {
      case 'SUCCEEDED':
        return 'green' as const
      case 'PENDING':
        return 'amber' as const
      case 'FAILED':
      case 'REFUNDED':
        return 'red' as const
      default:
        return 'slate' as const
    }
  }

  function prettifyStatus(value: string) {
    return value.replace(/_/g, ' ')
  }

  function formatPaymentWindowLabel(value: PaymentWindowFilter) {
    switch (value) {
      case 'current_month':
        return 'Current month'
      case 'previous_month':
        return 'Previous month'
      case 'current_year':
        return 'Current year'
      case 'previous_year':
        return 'Previous year'
      default:
        return 'All payments'
    }
  }

  async function handleExportUsers(format: 'excel' | 'pdf') {
    try {
      setActiveUserExport(format)

      if (!filteredUsers.length) {
        setNotice({ message: 'There are no users in the current table to export.', tone: 'red' })
        return
      }

      const headers = ['Full name', 'Email', 'Phone number', 'Plan', 'Status', 'Registered', 'Latest payment']
      const rows = filteredUsers.map((user) => [
        user.fullName,
        user.email,
        user.phoneNumber || 'Not provided',
        user.latestSubscription?.plan.name || 'No subscription yet',
        prettifyStatus(user.subscriptionStatus),
        formatShortDate(user.registeredAt),
        user.latestPayment ? `${user.latestPayment.formattedAmount} (${prettifyStatus(user.latestPayment.status)})` : 'No payment record',
      ])

      if (format === 'excel') {
        downloadTableAsExcel(`helar-payment-users-${new Date().toISOString().slice(0, 10)}.xls`, headers, rows)
        setNotice({ message: 'Saved the current user table as an Excel file.', tone: 'green' })
        return
      }

      if (saveTableAsPdf('Helar Subscription User Table', `Generated on ${formatLongDate(new Date().toISOString())}`, headers, rows)) {
        setNotice({ message: 'Opened the user table report. Choose Save as PDF in the print dialog.', tone: 'green' })
        return
      }

      setNotice({ message: 'The PDF window was blocked by the browser. Allow pop-ups and try again.', tone: 'red' })
    } finally {
      setActiveUserExport(null)
    }
  }

  async function handleExportRecentPayments(format: 'excel' | 'pdf') {
    try {
      setActivePaymentExport(format)

      if (!filteredRecentPayments.length) {
        setNotice({ message: 'There are no payments in this period to export.', tone: 'red' })
        return
      }

      const headers = ['Customer', 'Email', 'Plan', 'Amount', 'Status', 'Created']
      const rows = filteredRecentPayments.map((payment) => [
        payment.user.fullName,
        payment.user.email,
        payment.plan?.name ?? 'Subscription payment',
        payment.formattedAmount,
        prettifyStatus(payment.status),
        formatLongDate(payment.createdAt),
      ])

      if (format === 'excel') {
        const fileYearSegment = selectedPaymentYear === 'all' ? paymentsWindowFilter : `${selectedPaymentYear}`
        downloadTableAsExcel(`helar-payments-${fileYearSegment}-${new Date().toISOString().slice(0, 10)}.xls`, headers, rows)
        setNotice({ message: 'Saved the filtered payment list as an Excel file.', tone: 'green' })
        return
      }

      const reportWindowLabel =
        selectedPaymentYear === 'all' ? formatPaymentWindowLabel(paymentsWindowFilter) : `Payments for ${selectedPaymentYear}`

      if (
        saveTableAsPdf(
          'Helar Subscription Payments',
          `${reportWindowLabel} report generated on ${formatLongDate(new Date().toISOString())}`,
          headers,
          rows,
        )
      ) {
        setNotice({ message: 'Opened the payment report. Choose Save as PDF in the print dialog.', tone: 'green' })
        return
      }

      setNotice({ message: 'The PDF window was blocked by the browser. Allow pop-ups and try again.', tone: 'red' })
    } finally {
      setActivePaymentExport(null)
    }
  }

  async function handleExportFinancialStatements(format: 'excel' | 'pdf') {
    try {
      setActiveStatementExport(format)

      if (!previousFinancialStatements.length) {
        setNotice({ message: 'There are no previous financial statements available to export.', tone: 'red' })
        return
      }

      const headers = ['Statement period', 'Revenue', 'Successful payments', 'Pending payments', 'Failed payments', 'All payment records', 'Latest activity']
      const rows = previousFinancialStatements.map((statement) => [
        statement.label,
        formatMoneyMinor(statement.totalAmountMinor, statement.currency),
        formatCount(statement.succeededCount),
        formatCount(statement.pendingCount),
        formatCount(statement.failedCount),
        formatCount(statement.paymentCount),
        formatLongDate(statement.latestActivityAt),
      ])

      if (format === 'excel') {
        downloadTableAsExcel(`helar-financial-statements-${new Date().toISOString().slice(0, 10)}.xls`, headers, rows)
        setNotice({ message: 'Saved the previous financial statements as an Excel file.', tone: 'green' })
        return
      }

      if (
        saveTableAsPdf(
          'Helar Previous Financial Statements',
          `Generated on ${formatLongDate(new Date().toISOString())}`,
          headers,
          rows,
        )
      ) {
        setNotice({ message: 'Opened the statement report. Choose Save as PDF in the print dialog.', tone: 'green' })
        return
      }

      setNotice({ message: 'The PDF window was blocked by the browser. Allow pop-ups and try again.', tone: 'red' })
    } finally {
      setActiveStatementExport(null)
    }
  }

  async function handleManualActivation() {
    if (!selectedUser) {
      setNotice({ message: 'Select a registered user first.', tone: 'red' })
      return
    }

    await activationMutation.mutateAsync({
      note: manualNote.trim() || undefined,
      planCode: manualPlanCode,
      userId: selectedUser.id,
    })
  }

  if (billingQuery.isLoading) {
    return <LoadingState />
  }

  if (billingQuery.isError || !billingQuery.data) {
    return (
      <div className="space-y-6">
        <AdminPageHero
          badge="Finance operations"
          description="Manage payment reflection issues, subscription visibility, and user access from one billing workspace."
          title="Keep subscriptions accurate and easy to audit."
        />

        <AdminPanel isDark={isDark}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={cn('text-lg font-semibold', isDark ? 'text-white' : 'text-slate-950')}>Could not load the payment workspace.</p>
              <p className={cn('mt-2 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                Refresh the data to load registered users, subscription status, and recent payments again.
              </p>
            </div>
            <button className="button-primary !px-4 !py-3" onClick={() => billingQuery.refetch()} type="button">
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Reload workspace
              </span>
            </button>
          </div>
        </AdminPanel>
      </div>
    )
  }

  const summaryCards = [
    {
      description: 'All registered users currently on Helar.',
      label: 'Registered users',
      value: formatCount(billingQuery.data.summary.registeredUsers),
    },
    {
      description: 'Users with an active subscription right now.',
      label: 'Active subscriptions',
      value: formatCount(billingQuery.data.summary.activeSubscriptions),
    },
    {
      description: 'Users whose current or latest plan is the monthly package.',
      label: 'Monthly subscribers',
      value: formatCount(billingQuery.data.summary.monthlySubscribers),
    },
    {
      description: 'Users whose current or latest plan is the 6-month package.',
      label: '6-month subscribers',
      value: formatCount(billingQuery.data.summary.sixMonthSubscribers),
    },
    {
      description: 'Users whose current or latest plan is the 1-year package.',
      label: '1-year subscribers',
      value: formatCount(billingQuery.data.summary.annualSubscribers),
    },
    {
      description: 'Payments still waiting for successful reflection.',
      label: 'Pending payments',
      value: formatCount(billingQuery.data.summary.pendingPayments),
    },
    {
      description: 'Payments that need manual finance follow-up.',
      label: 'Failed payments',
      value: formatCount(billingQuery.data.summary.failedPayments),
    },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHero
        badge="Finance operations"
        description="Track registered users, monitor active subscription coverage, and manually activate monthly, 6-month, or 1-year access when payment reflection needs superadmin intervention."
        title="Manage subscriptions with a live payment control center."
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <AdminPanel isDark={isDark} key={card.label}>
            <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>{card.label}</p>
            <p className={cn('mt-4 text-3xl font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{card.value}</p>
            <p className={cn('mt-3 text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-600')}>{card.description}</p>
          </AdminPanel>
        ))}

        <AdminPanel isDark={isDark}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Amount made this month</p>
              <p className={cn('mt-4 text-3xl font-semibold', isDark ? 'text-white' : 'text-slate-950')}>
                {formatMoneyMinor(currentMonthStatement.totalAmountMinor, currentMonthStatement.currency)}
              </p>
            </div>
            <span className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-950')}>
              <FileClock className="h-5 w-5" />
            </span>
          </div>
          <p className={cn('mt-3 text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-600')}>
            Successful subscription collections recorded in {currentMonthStatement.label}. {formatCount(currentMonthStatement.succeededCount)} successful payment
            {currentMonthStatement.succeededCount === 1 ? '' : 's'} contributed to this total.
          </p>
          <button
            className={cn(
              'mt-5 inline-flex items-center gap-2 rounded-full px-0 text-sm font-medium transition',
              isDark ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-800'
            )}
            onClick={() => setIsFinancialStatementsModalOpen(true)}
            type="button"
          >
            See previous financial statements
            <ArrowRight className="h-4 w-4" />
          </button>
        </AdminPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <AdminPanel isDark={isDark}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Subscriber registry</p>
              <h3 className={cn('mt-1 font-heading text-3xl', isDark ? 'text-white' : 'text-slate-950')}>Registered users and subscription status</h3>
            </div>
            <AdminStatusPill isDark={isDark} tone="blue">
              {filteredUsers.length} visible record{filteredUsers.length === 1 ? '' : 's'}
            </AdminStatusPill>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="relative block">
              <Search className={cn('pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2', isDark ? 'text-slate-500' : 'text-slate-400')} />
              <input
                className={cn(
                  'h-12 w-full rounded-2xl border pl-11 pr-4 text-sm outline-none transition',
                  isDark ? 'border-slate-700 bg-slate-800 text-white placeholder:text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400',
                )}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, or phone"
                type="search"
                value={search}
              />
            </label>

            <select
              className={cn(
                'h-12 rounded-2xl border px-4 text-sm outline-none transition',
                isDark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-900',
              )}
              onChange={(event) => setPlanFilter(event.target.value as 'all' | 'monthly' | 'six_months' | 'annual')}
              value={planFilter}
            >
              <option value="all">All plan types</option>
              <option value="monthly">Monthly subscribers</option>
              <option value="six_months">6-month subscribers</option>
              <option value="annual">1-year subscribers</option>
            </select>

            <select
              className={cn(
                'h-12 rounded-2xl border px-4 text-sm outline-none transition',
                isDark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-900',
              )}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'expired' | 'inactive' | 'past_due' | 'canceled')}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: `All users (${formatCount(billingQuery.data.summary.registeredUsers)})`, value: 'all' as const },
              { label: `Monthly (${formatCount(billingQuery.data.summary.monthlySubscribers)})`, value: 'monthly' as const },
              { label: `6 months (${formatCount(billingQuery.data.summary.sixMonthSubscribers)})`, value: 'six_months' as const },
              { label: `1 year (${formatCount(billingQuery.data.summary.annualSubscribers)})`, value: 'annual' as const },
            ].map((item) => (
              <button
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition',
                  planFilter === item.value
                    ? isDark
                      ? 'border-white/10 bg-white/10 text-white'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                      ? 'border-slate-700 bg-slate-800 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-700',
                )}
                key={item.value}
                onClick={() => setPlanFilter(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                isDark
                  ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                  : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
              )}
              disabled={activeUserExport !== null}
              onClick={() => void handleExportUsers('excel')}
              type="button"
            >
              <Download className="h-4 w-4" />
              {activeUserExport === 'excel' ? 'Preparing Excel...' : 'Export users to Excel'}
            </button>
            <button
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                isDark
                  ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                  : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
              )}
              disabled={activeUserExport !== null}
              onClick={() => void handleExportUsers('pdf')}
              type="button"
            >
              <Download className="h-4 w-4" />
              {activeUserExport === 'pdf' ? 'Preparing PDF...' : 'Export users to PDF'}
            </button>
          </div>

          <div className="mt-6">
            {filteredUsers.length ? (
              <>
                <div className={cn('overflow-hidden rounded-[24px] border', isDark ? 'border-slate-700' : 'border-slate-200')}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className={cn(isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600')}>
                        <tr>
                          <th className="px-4 py-3 font-medium">User</th>
                          <th className="px-4 py-3 font-medium">Phone</th>
                          <th className="px-4 py-3 font-medium">Plan</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Registered</th>
                          <th className="px-4 py-3 font-medium">Latest payment</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className={cn(isDark ? 'bg-slate-900' : 'bg-white')}>
                        {paginatedUsers.map((user) => (
                          <tr
                            className={cn(
                              'border-t transition',
                              isDark ? 'border-slate-800' : 'border-slate-200',
                              selectedUser?.id === user.id ? (isDark ? 'bg-blue-500/10' : 'bg-blue-50') : ''
                            )}
                            key={user.id}
                          >
                            <td className="px-4 py-4 align-top">
                              <div className="min-w-[220px]">
                                <p className={cn('font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{user.fullName}</p>
                                <p className={cn('mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>{user.email}</p>
                              </div>
                            </td>
                            <td className={cn('px-4 py-4 align-top text-xs', isDark ? 'text-slate-300' : 'text-slate-700')}>
                              {user.phoneNumber || 'Not provided'}
                            </td>
                            <td className="px-4 py-4 align-top">
                              {user.latestSubscription ? (
                                <div className="space-y-1">
                                  <p className={cn('text-xs font-medium', isDark ? 'text-white' : 'text-slate-900')}>{user.latestSubscription.plan.name}</p>
                                  <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>
                                    Ends {formatShortDate(user.latestSubscription.endsAt)}
                                  </p>
                                </div>
                              ) : (
                                <span className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>No subscription yet</span>
                              )}
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="flex flex-col gap-2">
                                <AdminStatusPill isDark={isDark} tone={getSubscriptionTone(user.subscriptionStatus)}>
                                  {prettifyStatus(user.subscriptionStatus)}
                                </AdminStatusPill>
                                <AdminStatusPill isDark={isDark} tone={user.emailVerifiedAt ? 'green' : 'amber'}>
                                  {user.emailVerifiedAt ? 'Verified email' : 'Email pending'}
                                </AdminStatusPill>
                              </div>
                            </td>
                            <td className={cn('px-4 py-4 align-top text-xs', isDark ? 'text-slate-300' : 'text-slate-700')}>
                              {formatShortDate(user.registeredAt)}
                            </td>
                            <td className="px-4 py-4 align-top">
                              {user.latestPayment ? (
                                <div className="space-y-1">
                                  <p className={cn('text-xs font-medium', isDark ? 'text-white' : 'text-slate-900')}>
                                    {user.latestPayment.formattedAmount}
                                  </p>
                                  <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>
                                    {prettifyStatus(user.latestPayment.status)}
                                  </p>
                                </div>
                              ) : (
                                <span className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>No payment record</span>
                              )}
                            </td>
                            <td className="px-4 py-4 align-top">
                              <button
                                className={cn(
                                  'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition',
                                  isDark
                                    ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                                )}
                                onClick={() => setSelectedUserId(user.id)}
                                type="button"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                    Showing {(tablePage - 1) * tablePageSize + 1}-{Math.min(tablePage * tablePageSize, filteredUsers.length)} of {filteredUsers.length} users
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      className={cn(
                        'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                        isDark
                          ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                          : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                      )}
                      disabled={tablePage <= 1}
                      onClick={() => setTablePage((current) => Math.max(1, current - 1))}
                      type="button"
                    >
                      Previous
                    </button>
                    <div className={cn('rounded-2xl border px-4 py-2 text-sm', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                      Page {tablePage} of {totalTablePages}
                    </div>
                    <button
                      className={cn(
                        'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                        isDark
                          ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                          : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                      )}
                      disabled={tablePage >= totalTablePages}
                      onClick={() => setTablePage((current) => Math.min(totalTablePages, current + 1))}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={cn('rounded-[20px] border px-5 py-6 text-sm', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                No registered users match the current payment filters.
              </div>
            )}
          </div>
        </AdminPanel>

        <div className="space-y-6">
          <AdminPanel isDark={isDark}>
            <div className="flex items-center gap-3">
              <span className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-950')}>
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Workspace actions</p>
                <h3 className={cn('mt-1 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Open detailed payment tools</h3>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <button
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition',
                  isDark
                    ? 'border-sky-500/30 bg-sky-500/12 text-sky-100 hover:border-sky-400/40 hover:bg-sky-500/18'
                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100'
                )}
                onClick={() => setIsRecentPaymentsModalOpen(true)}
                type="button"
              >
                Open recent payments
              </button>
              <button
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition',
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                )}
                onClick={() => setIsManualActivationModalOpen(true)}
                type="button"
              >
                Open manual activation
              </button>

              {!isSuperAdminWorkspace ? (
                <div className={cn('rounded-[22px] border px-4 py-4 text-sm leading-6', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                    Manual monthly, 6-month, and 1-year activation is restricted to the superadmin workspace.
                </div>
              ) : null}
            </div>

            {notice ? (
              <div
                className={cn(
                  'mt-4 rounded-[20px] border px-4 py-4 text-sm',
                  notice.tone === 'green'
                    ? isDark
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : isDark
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                      : 'border-rose-200 bg-rose-50 text-rose-700',
                )}
              >
                {notice.message}
              </div>
            ) : null}
          </AdminPanel>

        </div>
      </div>

      {isRecentPaymentsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className={cn('w-full max-w-3xl rounded-[28px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]', isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Recent payments</p>
                <h3 className={cn('mt-2 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Latest subscription activity</h3>
                <p className={cn('mt-2 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                  View payment activity by month, previous month, current year, previous year, or pick a database year from the dropdown.
                </p>
              </div>
              <button
                className={cn('rounded-full border px-3 py-1 text-sm', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600')}
                onClick={() => setIsRecentPaymentsModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { label: 'Current month', value: 'current_month' as const },
                { label: 'Previous month', value: 'previous_month' as const },
                { label: 'Current year', value: 'current_year' as const },
                { label: 'Previous year', value: 'previous_year' as const },
                { label: 'All', value: 'all' as const },
              ].map((item) => (
                <button
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition',
                    paymentsWindowFilter === item.value
                      ? isDark
                        ? 'border-white/10 bg-white/10 text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : isDark
                        ? 'border-slate-700 bg-slate-800 text-slate-300'
                        : 'border-slate-200 bg-slate-50 text-slate-700',
                  )}
                  key={item.value}
                  onClick={() => {
                    setPaymentsWindowFilter(item.value)
                    if (item.value !== 'all') {
                      setSelectedPaymentYear('all')
                    }
                  }}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 md:min-w-[220px]">
                <label className={cn('text-xs uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-400')}>
                  Payment year
                </label>
                <select
                  className={cn(
                    'h-12 rounded-2xl border px-4 text-sm outline-none transition',
                    isDark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-900',
                  )}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    if (nextValue === 'all') {
                      setSelectedPaymentYear('all')
                      return
                    }

                    setSelectedPaymentYear(Number(nextValue))
                    setPaymentsWindowFilter('all')
                  }}
                  value={selectedPaymentYear}
                >
                  <option value="all">All available years</option>
                  {availablePaymentYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                Showing {filteredRecentPayments.length} payment record{filteredRecentPayments.length === 1 ? '' : 's'} for{' '}
                {selectedPaymentYear === 'all'
                  ? formatPaymentWindowLabel(paymentsWindowFilter).toLowerCase()
                  : `${selectedPaymentYear}`}.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                  )}
                  disabled={activePaymentExport !== null}
                  onClick={() => void handleExportRecentPayments('excel')}
                  type="button"
                >
                  <Download className="h-4 w-4" />
                  {activePaymentExport === 'excel' ? 'Preparing Excel...' : 'Export to Excel'}
                </button>
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                  )}
                  disabled={activePaymentExport !== null}
                  onClick={() => void handleExportRecentPayments('pdf')}
                  type="button"
                >
                  <Download className="h-4 w-4" />
                  {activePaymentExport === 'pdf' ? 'Preparing PDF...' : 'Export to PDF'}
                </button>
              </div>
            </div>

            <div className="mt-6 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {filteredRecentPayments.length ? filteredRecentPayments.map((payment) => (
                <div
                  className={cn('rounded-[20px] border px-4 py-4', isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50')}
                  key={payment.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn('truncate text-sm font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{payment.user.fullName}</p>
                      <p className={cn('mt-1 truncate text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>{payment.user.email}</p>
                    </div>
                    <AdminStatusPill isDark={isDark} tone={getPaymentTone(payment.status)}>
                      {prettifyStatus(payment.status)}
                    </AdminStatusPill>
                  </div>
                  <p className={cn('mt-3 text-sm', isDark ? 'text-slate-300' : 'text-slate-700')}>
                    {payment.plan?.name ?? 'Subscription payment'} • {payment.formattedAmount}
                  </p>
                  <p className={cn('mt-1 text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
                    {formatLongDate(payment.createdAt)}
                  </p>
                </div>
              )) : (
                <div className={cn('rounded-[20px] border px-5 py-6 text-sm', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                  No payment activity was found for this reporting window.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isFinancialStatementsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className={cn('w-full max-w-4xl rounded-[28px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]', isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Financial statements</p>
                <h3 className={cn('mt-2 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Previous monthly financial statements</h3>
                <p className={cn('mt-2 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                  Review previously closed monthly payment statements and download the report as Excel or PDF.
                </p>
              </div>
              <button
                className={cn('rounded-full border px-3 py-1 text-sm', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600')}
                onClick={() => setIsFinancialStatementsModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                {previousFinancialStatements.length
                  ? `${previousFinancialStatements.length} statement${previousFinancialStatements.length === 1 ? '' : 's'} available for download.`
                  : 'No previous statements have been generated from payment activity yet.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                  )}
                  disabled={activeStatementExport !== null}
                  onClick={() => void handleExportFinancialStatements('excel')}
                  type="button"
                >
                  <Download className="h-4 w-4" />
                  {activeStatementExport === 'excel' ? 'Preparing Excel...' : 'Download Excel'}
                </button>
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                  )}
                  disabled={activeStatementExport !== null}
                  onClick={() => void handleExportFinancialStatements('pdf')}
                  type="button"
                >
                  <Download className="h-4 w-4" />
                  {activeStatementExport === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
                </button>
              </div>
            </div>

            <div className="mt-6 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {previousFinancialStatements.length ? (
                previousFinancialStatements.map((statement) => (
                  <div
                    className={cn('rounded-[20px] border px-5 py-5', isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50')}
                    key={statement.key}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className={cn('text-base font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{statement.label}</p>
                        <p className={cn('mt-1 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                          Latest activity {formatLongDate(statement.latestActivityAt)}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className={cn('text-xs uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Revenue</p>
                        <p className={cn('mt-2 text-2xl font-semibold', isDark ? 'text-white' : 'text-slate-950')}>
                          {formatMoneyMinor(statement.totalAmountMinor, statement.currency)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: 'Successful payments', value: formatCount(statement.succeededCount) },
                        { label: 'Pending payments', value: formatCount(statement.pendingCount) },
                        { label: 'Failed payments', value: formatCount(statement.failedCount) },
                        { label: 'All payment records', value: formatCount(statement.paymentCount) },
                      ].map((item) => (
                        <div
                          className={cn('rounded-[18px] border px-4 py-3', isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-700')}
                          key={`${statement.key}-${item.label}`}
                        >
                          <p className={cn('text-xs uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-400')}>{item.label}</p>
                          <p className={cn('mt-2 text-lg font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className={cn('rounded-[20px] border px-5 py-6 text-sm', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                  No previous monthly statements are available yet. Once Helar records payments in an earlier month, they will appear here automatically.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isManualActivationModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className={cn('w-full max-w-3xl rounded-[28px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]', isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Manual activation</p>
                <h3 className={cn('mt-2 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Payment reflection support</h3>
              </div>
              <button
                className={cn('rounded-full border px-3 py-1 text-sm', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600')}
                onClick={() => setIsManualActivationModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            {isSuperAdminWorkspace ? (
              <div className="mt-6 space-y-4">
                <label className="relative block">
                  <Search className={cn('pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2', isDark ? 'text-slate-500' : 'text-slate-400')} />
                  <input
                    className={cn(
                      'h-12 w-full rounded-2xl border pl-11 pr-4 text-sm outline-none transition',
                      isDark ? 'border-slate-700 bg-slate-800 text-white placeholder:text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400',
                    )}
                    onChange={(event) => setManualSearch(event.target.value)}
                    placeholder="Search by name, email, or phone"
                    type="search"
                    value={manualSearch}
                  />
                </label>

                <div className={cn('max-h-64 overflow-y-auto rounded-[22px] border', isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50')}>
                  {manualActivationUsers.length ? manualActivationUsers.map((user) => (
                    <button
                      className={cn(
                        'flex w-full items-start justify-between gap-3 border-b px-4 py-3 text-left last:border-b-0',
                        isDark ? 'border-slate-700 text-white hover:bg-slate-700/60' : 'border-slate-200 text-slate-900 hover:bg-white',
                        selectedUser?.id === user.id ? (isDark ? 'bg-blue-500/10' : 'bg-blue-50') : ''
                      )}
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      type="button"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{user.fullName}</p>
                        <p className={cn('mt-1 truncate text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>{user.email}</p>
                        <p className={cn('mt-1 truncate text-xs', isDark ? 'text-slate-500' : 'text-slate-500')}>{user.phoneNumber || 'No phone number'}</p>
                      </div>
                      <AdminStatusPill isDark={isDark} tone={getSubscriptionTone(user.subscriptionStatus)}>
                        {prettifyStatus(user.subscriptionStatus)}
                      </AdminStatusPill>
                    </button>
                  )) : (
                    <div className={cn('px-4 py-4 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
                      No users match this activation search.
                    </div>
                  )}
                </div>

                {selectedUser ? (
                  <div className={cn('rounded-[22px] border p-4', isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50')}>
                    <p className={cn('text-base font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{selectedUser.fullName}</p>
                    <p className={cn('mt-1 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>{selectedUser.email}</p>
                    <p className={cn('mt-1 text-sm', isDark ? 'text-slate-500' : 'text-slate-500')}>{selectedUser.phoneNumber || 'No phone number recorded'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AdminStatusPill isDark={isDark} tone={getSubscriptionTone(selectedUser.subscriptionStatus)}>
                        {prettifyStatus(selectedUser.subscriptionStatus)}
                      </AdminStatusPill>
                      {selectedUser.latestSubscription ? (
                        <AdminStatusPill isDark={isDark} tone="blue">
                          {selectedUser.latestSubscription.plan.name}
                        </AdminStatusPill>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Activate month', value: 'monthly' as const },
                    { label: 'Activate 6 months', value: 'six_months' as const },
                    { label: 'Activate 1 year', value: 'annual' as const },
                  ].map((option) => (
                    <button
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-sm font-medium transition',
                        manualPlanCode === option.value
                          ? isDark
                            ? 'border-white/10 bg-white/10 text-white'
                            : 'border-slate-900 bg-slate-900 text-white'
                          : isDark
                            ? 'border-slate-700 bg-slate-800 text-slate-300'
                            : 'border-slate-200 bg-slate-50 text-slate-700',
                      )}
                      key={option.value}
                      onClick={() => setManualPlanCode(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <textarea
                  className={cn(
                    'min-h-[120px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition',
                    isDark ? 'border-slate-700 bg-slate-800 text-white placeholder:text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400',
                  )}
                  onChange={(event) => setManualNote(event.target.value)}
                  placeholder="Optional note: explain the payment reflection issue or support decision."
                  value={manualNote}
                />

                <button
                  className="button-primary !w-full !px-4 !py-3"
                  disabled={activationMutation.isPending || !selectedUser}
                  onClick={() => void handleManualActivation()}
                  type="button"
                >
                  {activationMutation.isPending ? 'Activating subscription...' : 'Activate selected user'}
                </button>

                <p className={cn('text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-600')}>
                  Use this only when payment has been confirmed outside the normal reflection flow and the user needs access restored immediately.
                </p>
              </div>
            ) : (
              <div className={cn('mt-6 rounded-[22px] border px-4 py-4 text-sm leading-6', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                Manual monthly, 6-month, and 1-year activation is restricted to the superadmin workspace.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AdminSettingsPage() {
  const { isDark } = useTheme()
  const { snapshotQuery } = useAdminOperationsState()
  const [settings, setSettings] = useState({
    autoApproveTrustedInstitutions: false,
    holdHighRiskPayments: true,
    requireManualTutorApproval: true,
    slowModeForReportedThreads: true,
  })
  const [notice, setNotice] = useState('')

  if (snapshotQuery.isLoading || !snapshotQuery.data) {
    return <LoadingState />
  }

  function toggleSetting(settingKey: keyof typeof settings) {
    setSettings((current) => ({ ...current, [settingKey]: !current[settingKey] }))
  }

  function handleSaveSettings() {
    setNotice('Admin controls updated for this session.')
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        badge="Admin settings"
        description="Tune governance defaults for approvals, finance, and platform operations without leaving the Helar workspace."
        title="Configure how the admin workspace responds to risk and scale."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminPanel isDark={isDark}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Control center</p>
              <h3 className={cn('mt-1 font-heading text-3xl', isDark ? 'text-white' : 'text-slate-950')}>Operational switches</h3>
            </div>
            <AdminStatusPill isDark={isDark} tone="green">
              Settings ready
            </AdminStatusPill>
          </div>

          <div className="mt-6 space-y-4">
            {[
              {
                key: 'autoApproveTrustedInstitutions',
                label: 'Auto-approve trusted institutions',
                description: 'Instantly approve access requests coming from whitelisted partner domains.',
              },
              {
                key: 'requireManualTutorApproval',
                label: 'Require manual tutor approval',
                description: 'Keep tutor onboarding in the approval queue until a platform admin reviews it.',
              },
              {
                key: 'holdHighRiskPayments',
                label: 'Hold high-risk payments',
                description: 'Automatically route chargebacks and unusual retries into finance review.',
              },
              {
                key: 'slowModeForReportedThreads',
                label: 'Enable slow mode on reported threads',
                description: 'Reduce repeated replies while the support team investigates a flagged discussion.',
              },
            ].map((item) => {
              const checked = settings[item.key as keyof typeof settings]

              return (
                <label
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-[22px] border p-4',
                    isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50',
                  )}
                  key={item.key}
                >
                  <div>
                    <p className={cn('text-base font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{item.label}</p>
                    <p className={cn('mt-2 text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-600')}>{item.description}</p>
                  </div>
                  <button
                    aria-pressed={checked}
                    className={cn(
                      'relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition',
                      checked ? 'bg-[color:var(--color-accent-strong)]' : isDark ? 'bg-slate-700' : 'bg-slate-300',
                    )}
                    onClick={() => toggleSetting(item.key as keyof typeof settings)}
                    type="button"
                  >
                    <span
                      className={cn(
                        'inline-block h-6 w-6 rounded-full bg-white shadow transition',
                        checked ? 'translate-x-7' : 'translate-x-1',
                      )}
                    />
                  </button>
                </label>
              )
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>These controls are mocked for now, but they behave like real workspace settings.</p>
            <button className="button-primary !px-4 !py-3" onClick={handleSaveSettings} type="button">
              Save changes
            </button>
          </div>

          {notice ? (
            <div className={cn('mt-4 rounded-[20px] border px-4 py-4 text-sm', isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
              {notice}
            </div>
          ) : null}
        </AdminPanel>

        <div className="space-y-6">
          <AdminPanel isDark={isDark}>
            <div className="flex items-center gap-3">
              <span className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-950')}>
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Workspace posture</p>
                <h3 className={cn('mt-1 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Admin defaults</h3>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {[
                `${snapshotQuery.data.institutionsActive} are currently active on the platform.`,
                `${snapshotQuery.data.supportBacklog} remain visible to support and finance.`,
                'Policy changes here should be reviewed before enabling institution-wide automation.',
              ].map((item) => (
                <div
                  className={cn('rounded-[20px] border px-4 py-4 text-sm leading-6', isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel isDark={isDark}>
            <div className="flex items-center gap-3">
              <span className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-950')}>
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Platform note</p>
                <h3 className={cn('mt-1 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Governance summary</h3>
              </div>
            </div>

            <p className={cn('mt-6 text-sm leading-7', isDark ? 'text-slate-300' : 'text-slate-700')}>
              The admin workspace now supports user approvals, content governance, payment intervention, and operational settings from a single shell.
            </p>
          </AdminPanel>
        </div>
      </div>
    </div>
  )
}
