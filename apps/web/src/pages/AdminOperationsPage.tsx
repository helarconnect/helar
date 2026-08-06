import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  BriefcaseBusiness,
  CheckCheck,
  ClipboardList,
  Download,
  FileClock,
  GraduationCap,
  Italic,
  LibraryBig,
  List,
  ListOrdered,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Underline,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { AdminUsersWorkspace } from '@/components/admin/AdminUsersWorkspace'
import { useTheme } from '@/hooks/useTheme'
import {
  activateAdminSubscriptionManually,
  approveAdminBarFinalExamMcqQuestion,
  approveAdminBarFinalExamQuestion,
  approveAdminLibraryMaterial,
  approveAllPendingAdminContent,
  approveAdminSubjectSummaryCase,
  approveAdminSubjectSummaryEntry,
  declineAdminBarFinalExamMcqQuestion,
  declineAdminBarFinalExamQuestion,
  declineAdminLibraryMaterial,
  declineAdminSubjectSummaryCase,
  declineAdminSubjectSummaryEntry,
  fetchAdminBarFinalExamMcqQuestionDetail,
  fetchAdminBarFinalExamQuestionDetail,
  fetchAdminBillingSnapshot,
  fetchAdminContentReviewQueue,
  fetchAdminLibraryMaterial,
  fetchAdminSubjectSummaryEntryDetail,
  fetchSubjectSummaryCaseDetail,
  updateAdminBarFinalExamMcqQuestion,
  updateAdminBarFinalExamQuestion,
  updateAdminLibraryMaterial,
  updateSubjectSummaryCase,
  updateSubjectSummaryModuleEntry,
} from '@/lib/admin-api'
import { fetchAdminDashboardSnapshot } from '@/lib/mock-api'
import { queryKeys } from '@/lib/query-keys'
import { cn, isSuperAdmin } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import type { AdminAccessRequest, AdminContentReviewItem, AdminPaymentIssue } from '@/types/domain'

type AdminContentReviewQueueItemType =
  | 'library_material'
  | 'subject_summary_case'
  | 'subject_summary_entry'
  | 'bar_final_exam_question'
  | 'bar_final_exam_mcq_question'
type AdminContentReviewQueueItem = {
  actionPath: string
  contentTypeLabel: string
  createdAt: string
  editPath: string
  id: string
  resourceId: string
  reviewPath: string
  submittedBy: string
  submittedRoleLabel: string
  subtitle: string
  title: string
  type: AdminContentReviewQueueItemType
}

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
  const [declineTarget, setDeclineTarget] = useState<null | AdminContentReviewQueueItem>(null)
  const [declineReason, setDeclineReason] = useState('')
  const contentReviewQuery = useQuery({
    queryKey: queryKeys.adminContentReview,
    queryFn: fetchAdminContentReviewQueue,
    enabled: isSuperAdminWorkspace,
  })

  // Bulk approve: approves every pending item across all content types + MCQ questions in one request.
  // On success, shows a summary toast and refreshes every affected query so counts/tables reflect the new statuses.
  const bulkApproveMutation = useMutation({
    mutationFn: approveAllPendingAdminContent,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminContentReview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications }),
        queryClient.invalidateQueries({ queryKey: ['admin-library'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-module-admin-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-mcq-questions'] }),
      ])

      const summary = [
        data.counts.libraryMaterials ? `${data.counts.libraryMaterials} library items` : null,
        data.counts.subjectSummaryCases ? `${data.counts.subjectSummaryCases} subject summary cases` : null,
        data.counts.subjectSummaryEntries ? `${data.counts.subjectSummaryEntries} subject summary entries` : null,
        data.counts.barFinalExamQuestions ? `${data.counts.barFinalExamQuestions} NLS theory questions` : null,
        data.counts.barFinalExamMcqQuestions ? `${data.counts.barFinalExamMcqQuestions} MCQ questions` : null,
      ].filter(Boolean)

      window.alert(
        data.skippedCount > 0
          ? `Approved ${data.approvedCount} pending items, skipped ${data.skippedCount} (already resolved).`
          : `Approved all ${data.approvedCount} pending items.` + (summary.length ? `\n• ${summary.join('\n• ')}` : '')
      )
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (item: AdminContentReviewQueueItem) => {
      if (item.type === 'library_material') {
        return approveAdminLibraryMaterial(item.resourceId)
      }

      if (item.type === 'subject_summary_case') {
        return approveAdminSubjectSummaryCase(item.resourceId)
      }

      if (item.type === 'bar_final_exam_question') {
        return approveAdminBarFinalExamQuestion(item.resourceId)
      }

      if (item.type === 'bar_final_exam_mcq_question') {
        return approveAdminBarFinalExamMcqQuestion(item.resourceId)
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
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-mcq-questions'] }),
      ])
    },
  })

  const declineMutation = useMutation({
    mutationFn: async (item: AdminContentReviewQueueItem & { reason: string }) => {
      if (item.type === 'library_material') {
        return declineAdminLibraryMaterial(item.resourceId, item.reason)
      }

      if (item.type === 'subject_summary_case') {
        return declineAdminSubjectSummaryCase(item.resourceId, item.reason)
      }

      if (item.type === 'bar_final_exam_question') {
        return declineAdminBarFinalExamQuestion(item.resourceId, item.reason)
      }

      if (item.type === 'bar_final_exam_mcq_question') {
        return declineAdminBarFinalExamMcqQuestion(item.resourceId, item.reason)
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
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-mcq-questions'] }),
      ])
    },
  })

  if (isSuperAdminWorkspace && contentReviewQuery.isLoading) {
    return <LoadingState />
  }

  function openDeclineDialog(item: AdminContentReviewQueueItem) {
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
    bar_final_exam_mcq_question: ClipboardList,
    library_material: LibraryBig,
    subject_summary_case: GraduationCap,
    subject_summary_entry: FileClock,
    bar_final_exam_question: ClipboardList,
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
            <div className="flex flex-wrap items-center gap-3">
              <AdminStatusPill isDark={isDark} tone="amber">
                {reviewQueue?.summary.totalPending ?? 0} waiting for decision
              </AdminStatusPill>
              <button
                className="button-primary !px-5 !py-3"
                disabled={!reviewQueue?.summary.totalPending || bulkApproveMutation.isPending || approveMutation.isPending || declineMutation.isPending}
                onClick={() => void bulkApproveMutation.mutateAsync()}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <CheckCheck className="h-4 w-4" />
                  {bulkApproveMutation.isPending ? 'Approving all pending...' : 'Approve all pending'}
                </span>
              </button>
            </div>
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
                          <Link
                            className={cn('mt-3 inline-flex items-center gap-2 text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700')}
                            state={item}
                            to={`/app/admin/content/review/${item.type}/${item.resourceId}`}
                          >
                            Review content
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
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
                className={cn(
                  '!px-4 !py-3 inline-flex items-center gap-2 rounded-2xl border text-sm font-medium transition hover:-translate-y-0.5',
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50',
                )}
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

// Builds the href used to navigate from the content review queue into the dedicated
// full-page review reader. Kept with the queue item shape so callers stay consistent.
export function buildContentReviewDetailHref(item: Pick<AdminContentReviewQueueItem, 'resourceId' | 'type'>) {
  return `/app/admin/content/review/${item.type}/${item.resourceId}`
}

// Builds a synthetic queue item from route params + location state. The queue item
// carries the header metadata (submitter, createdAt, type label) that the dedicated
// GET detail endpoints don't return because they only serve the underlying resource.
// If state is missing (e.g. user bookmarked the URL) we still produce a valid item
// with placeholders; the renderer falls back to the resource record for its title.
function resolveQueueTargetFromLocation(
  params: Record<string, string | undefined>,
  state: unknown,
): AdminContentReviewQueueItem | null {
  const itemType = params.itemType as AdminContentReviewQueueItemType | undefined
  const resourceId = params.resourceId
  if (!itemType || !resourceId) {
    return null
  }

  // If the user navigated from the queue via <Link state={item}>, we have all metadata.
  const fromState = state as Partial<AdminContentReviewQueueItem> | null
  const createdAt = fromState?.createdAt ?? new Date().toISOString()
  const contentTypeLabel =
    fromState?.contentTypeLabel ??
    (itemType === 'library_material'
      ? 'Library material'
      : itemType === 'subject_summary_case'
        ? 'Subject summary case'
        : itemType === 'subject_summary_entry'
          ? 'Subject summary Q&A entry'
          : itemType === 'bar_final_exam_question'
            ? 'Bar final exam • NLS theory question'
            : 'Bar final exam • MCQ')

  return {
    id: fromState?.id ?? `${itemType}-${resourceId}`,
    type: itemType,
    resourceId,
    reviewPath: fromState?.reviewPath ?? '',
    actionPath: fromState?.actionPath ?? '',
    editPath: fromState?.editPath ?? '',
    title: fromState?.title ?? 'Loading…',
    subtitle: fromState?.subtitle ?? 'Reviewing this content for approval',
    submittedBy: fromState?.submittedBy ?? 'Content admin',
    submittedRoleLabel: fromState?.submittedRoleLabel ?? 'Admin',
    contentTypeLabel,
    createdAt,
  }
}

// Builds the editable draft for inline edit mode. We copy all of the fields
// that the inline editors expose (text / RTE / arrays), preserving the rest
// of the record in `data` so the update mutation can fill in required fields
// that we don't expose inline (e.g. materialType, storageUrl, examDate).
function buildEditableDraft(
  type: AdminContentReviewQueueItemType,
  data: unknown,
  librarySection: string | null,
) {
  if (type === 'library_material') {
    const snapshot = data as Awaited<ReturnType<typeof fetchAdminLibraryMaterial>>
    const mat = snapshot.material
    return {
      title: mat.title ?? '',
      summary: mat.summary ?? '',
      body: mat.body ?? '',
      librarySection,
    }
  }
  if (type === 'subject_summary_case') {
    const snapshot = data as Awaited<ReturnType<typeof fetchSubjectSummaryCaseDetail>>
    return {
      caseSummary: snapshot.caseSummary ?? '',
      citation: snapshot.citation ?? '',
      court: snapshot.court ?? '',
      decisionHolding: snapshot.decisionHolding ?? '',
      facts: snapshot.facts ?? '',
      issues: snapshot.issues ?? '',
      keywords: [...(snapshot.keywords ?? [])],
      legalPrinciples: [...(snapshot.legalPrinciples ?? [])],
      obiterDicta: snapshot.obiterDicta ?? '',
      ratioDecidendi: snapshot.ratioDecidendi ?? '',
      relatedStatutes: [...(snapshot.relatedStatutes ?? [])],
      subjectId: snapshot.subject?.id ?? '',
      title: snapshot.title ?? '',
      topicId: snapshot.topic?.id ?? '',
    }
  }
  if (type === 'subject_summary_entry') {
    const snapshot = data as Awaited<ReturnType<typeof fetchAdminSubjectSummaryEntryDetail>>
    return {
      answer: snapshot.answer ?? '',
      difficulty: snapshot.difficulty ?? 'EASY',
      estimatedReadingTime: Number(snapshot.estimatedReadingTime ?? 2),
      examTip: snapshot.examTip ?? '',
      keyPrinciple: snapshot.keyPrinciple ?? '',
      topic: snapshot.topic ?? '',
      question: snapshot.question ?? '',
      relatedStatutes: [...(snapshot.relatedStatutes ?? [])],
      subjectId: snapshot.subject?.id ?? '',
      tags: [...(snapshot.tags ?? [])],
    }
  }
  if (type === 'bar_final_exam_question') {
    const snapshot = data as Awaited<ReturnType<typeof fetchAdminBarFinalExamQuestionDetail>>
    return {
      answer: snapshot.answer ?? '',
      question: snapshot.question ?? '',
      subjectId: snapshot.subject?.id ?? '',
    }
  }
  // bar_final_exam_mcq_question
  const snapshot = data as Awaited<ReturnType<typeof fetchAdminBarFinalExamMcqQuestionDetail>>
  return {
    correctOptionIndex: Number(snapshot.correctOptionIndex ?? 0),
    options: [...(snapshot.options ?? [])],
    question: snapshot.question ?? '',
    subjectId: snapshot.subject?.id ?? '',
  }
}

export function AdminContentReviewDetailPage() {
  const { isDark } = useTheme()
  const queryClient = useQueryClient()
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [declineMode, setDeclineMode] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [notice, setNotice] = useState<null | { tone: 'green' | 'red'; message: string }>(null)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<any>(null)
  const [editNotice, setEditNotice] = useState<null | { tone: 'green' | 'red'; message: string }>(null)

  const target = resolveQueueTargetFromLocation(params, location.state)

  const section = useMemo(() => {
    if (!target || target.type !== 'library_material') return null
    const sectionMatch = target.actionPath.match(/^\/app\/admin\/library\/([^/?#]+)/)
    return (sectionMatch?.[1] ?? 'law-reports') as 'law-reports' | 'subject-summaries' | 'cases-and-ratios'
  }, [target])

  const { data, isLoading, error } = useQuery({
    queryKey: ['content-review-detail', target?.type, target?.resourceId, target?.actionPath],
    queryFn: async () => {
      if (!target) {
        throw new Error('Invalid review target')
      }
      if (target.type === 'library_material' && section) {
        return fetchAdminLibraryMaterial(section, target.resourceId)
      }
      if (target.type === 'subject_summary_case') {
        return fetchSubjectSummaryCaseDetail(target.resourceId)
      }
      if (target.type === 'subject_summary_entry') {
        return fetchAdminSubjectSummaryEntryDetail(target.resourceId)
      }
      if (target.type === 'bar_final_exam_question') {
        return fetchAdminBarFinalExamQuestionDetail(target.resourceId)
      }
      return fetchAdminBarFinalExamMcqQuestionDetail(target.resourceId)
    },
    staleTime: 1000 * 60,
    enabled: !!target,
  })

  // Sync a copy of `data` into the draft when the user first enters edit mode
  // or when the underlying fetched data changes.
  useEffect(() => {
    if (!editMode || !data) return
    if (!draft) {
      setDraft(buildEditableDraft(target!.type, data, section))
    }
  }, [data, draft, editMode, section, target])

  function toggleEditMode(next: boolean) {
    if (next) {
      if (data && target) {
        setDraft(buildEditableDraft(target.type, data, section))
      }
      setEditNotice(null)
      setEditMode(true)
    } else {
      setDraft(null)
      setEditNotice(null)
      setEditMode(false)
    }
  }

  // Inline update mutation — dispatches to the correct admin update endpoint
  // based on queue item type, then re-queries the detail so the review view
  // reflects the saved edits.
  const updateMutation = useMutation({
    mutationFn: async ({ targetItem, dataSnapshot, draftSnapshot, librarySection }: {
      targetItem: Exclude<typeof target, null>
      dataSnapshot: NonNullable<typeof data>
      draftSnapshot: any
      librarySection: typeof section
    }) => {
      if (targetItem.type === 'library_material' && librarySection) {
        const original = dataSnapshot as Awaited<ReturnType<typeof fetchAdminLibraryMaterial>>
        const mat = original.material
        return updateAdminLibraryMaterial(librarySection, targetItem.resourceId, {
          body: draftSnapshot.body ?? mat.body ?? '',
          downloadable: Boolean(mat.downloadable),
          estimatedMins: Number(mat.estimatedMins ?? 5),
          materialType: mat.materialType ?? 'PDF',
          reportDate: mat.reportDate ?? undefined,
          reportNumber: mat.reportNumber ?? undefined,
          sharingEnabled: Boolean(mat.sharingEnabled),
          storageUrl: mat.storageUrl ?? '',
          summary: draftSnapshot.summary ?? mat.summary ?? '',
          title: draftSnapshot.title ?? mat.title ?? '',
        })
      }
      if (targetItem.type === 'subject_summary_case') {
        const original = dataSnapshot as Awaited<ReturnType<typeof fetchSubjectSummaryCaseDetail>>
        return updateSubjectSummaryCase(targetItem.resourceId, {
          attachments: original.attachments ?? [],
          caseSummary: draftSnapshot.caseSummary ?? original.caseSummary ?? '',
          citation: draftSnapshot.citation ?? original.citation ?? '',
          court: draftSnapshot.court ?? original.court ?? '',
          decisionHolding: draftSnapshot.decisionHolding ?? original.decisionHolding ?? '',
          externalReferences: original.externalReferences ?? [],
          facts: draftSnapshot.facts ?? original.facts ?? '',
          issues: draftSnapshot.issues ?? original.issues ?? '',
          judges: original.judges ?? [],
          jurisdiction: original.jurisdiction ?? '',
          keywords: draftSnapshot.keywords ?? original.keywords ?? [],
          legalPrinciples: draftSnapshot.legalPrinciples ?? original.legalPrinciples ?? [],
          obiterDicta: draftSnapshot.obiterDicta ?? original.obiterDicta ?? '',
          ratioDecidendi: draftSnapshot.ratioDecidendi ?? original.ratioDecidendi ?? '',
          relatedCases: (original.relatedCases ?? []).map((c: any) => c.id ?? c),
          relatedStatutes: draftSnapshot.relatedStatutes ?? original.relatedStatutes ?? [],
          status: (original.status ?? 'DRAFT') as any,
          subjectId: draftSnapshot.subjectId ?? original.subject?.id ?? '',
          title: draftSnapshot.title ?? original.title ?? '',
          topicId: draftSnapshot.topicId ?? original.topic?.id ?? '',
          year: original.year ?? null,
        })
      }
      if (targetItem.type === 'subject_summary_entry') {
        const original = dataSnapshot as Awaited<ReturnType<typeof fetchAdminSubjectSummaryEntryDetail>>
        return updateSubjectSummaryModuleEntry(targetItem.resourceId, {
          answer: draftSnapshot.answer ?? original.answer ?? '',
          difficulty: (draftSnapshot.difficulty ?? original.difficulty ?? 'EASY') as any,
          displayOrder: Number(original.displayOrder ?? 0),
          estimatedReadingTime: Number(draftSnapshot.estimatedReadingTime ?? original.estimatedReadingTime ?? 2),
          examTip: draftSnapshot.examTip ?? original.examTip ?? '',
          keyPrinciple: draftSnapshot.keyPrinciple ?? original.keyPrinciple ?? '',
          moduleType: original.moduleType,
          topic: draftSnapshot.topic ?? original.topic ?? '',
          question: draftSnapshot.question ?? original.question ?? '',
          relatedCaseIds: (original.relatedCases ?? []).map((c: any) => c.id ?? c),
          relatedStatutes: draftSnapshot.relatedStatutes ?? original.relatedStatutes ?? [],
          status: (original.status ?? 'DRAFT') as any,
          subjectId: draftSnapshot.subjectId ?? original.subject?.id ?? '',
          tags: draftSnapshot.tags ?? original.tags ?? [],
        })
      }
      if (targetItem.type === 'bar_final_exam_question') {
        const original = dataSnapshot as Awaited<ReturnType<typeof fetchAdminBarFinalExamQuestionDetail>>
        return updateAdminBarFinalExamQuestion(targetItem.resourceId, {
          answer: draftSnapshot.answer ?? original.answer ?? '',
          examDate: original.examDate ?? new Date().toISOString().slice(0, 10),
          question: draftSnapshot.question ?? original.question ?? '',
          status: (original.status ?? 'DRAFT') as any,
          subjectId: draftSnapshot.subjectId ?? original.subject?.id ?? '',
        })
      }
      // bar_final_exam_mcq_question
      const original = dataSnapshot as Awaited<ReturnType<typeof fetchAdminBarFinalExamMcqQuestionDetail>>
      return updateAdminBarFinalExamMcqQuestion(targetItem.resourceId, {
        correctOptionIndex: Number(draftSnapshot.correctOptionIndex ?? original.correctOptionIndex ?? 0),
        examDate: original.examDate ?? new Date().toISOString().slice(0, 10),
        options: draftSnapshot.options ?? original.options ?? [],
        question: draftSnapshot.question ?? original.question ?? '',
        status: (original.status ?? 'DRAFT') as any,
        subjectId: draftSnapshot.subjectId ?? original.subject?.id ?? '',
      })
    },
    onMutate: () => {
      setEditNotice(null)
    },
    onSuccess: async () => {
      setEditNotice({ tone: 'green', message: 'Edits saved. Refresh in progress…' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-review-detail', target?.type, target?.resourceId, target?.actionPath] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminContentReview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications }),
        queryClient.invalidateQueries({ queryKey: ['admin-library'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-module-admin-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-mcq-questions'] }),
      ])
      // Stop showing editor now that the authoritative view is updated.
      setDraft(null)
      setEditMode(false)
      setEditNotice({ tone: 'green', message: 'Edits saved and content refreshed.' })
      setTimeout(() => setEditNotice(null), 4000)
    },
    onError: (err: any) => {
      const validation = err?.response?.data?.error?.details?.fieldErrors
      const validationHints = validation
        ? Object.entries(validation)
            .map(([field, messages]) => {
              const messageList = Array.isArray(messages) ? (messages as string[]) : [String(messages)]
              return `${field}: ${messageList.join('; ')}`
            })
            .join(' | ')
        : null
      setEditNotice({ tone: 'red', message: validationHints ?? err?.response?.data?.error?.message ?? err?.message ?? 'Could not save your edits right now.' })
    },
  })

  // If location state missed a title, derive the display title from the fetched record
  // so the header isn't stuck on "Loading…" when the user opened a bookmarked URL.
  const resolvedTitle = useMemo(() => {
    if (!target) {
      return ''
    }
    if (target.title && target.title !== 'Loading…') {
      return target.title
    }
    if (!data) {
      return target.title
    }
    if (target.type === 'library_material') {
      const original = data as Awaited<ReturnType<typeof fetchAdminLibraryMaterial>>
      return editMode && draft ? (draft.title ?? original.material.title) : original.material.title
    }
    if (target.type === 'subject_summary_case') {
      const original = data as Awaited<ReturnType<typeof fetchSubjectSummaryCaseDetail>>
      return editMode && draft ? (draft.title ?? original.title) : original.title
    }
    if (target.type === 'subject_summary_entry') {
      const original = data as Awaited<ReturnType<typeof fetchAdminSubjectSummaryEntryDetail>>
      return editMode && draft ? (draft.question ?? original.question) : original.question
    }
    if (target.type === 'bar_final_exam_question') {
      const original = data as Awaited<ReturnType<typeof fetchAdminBarFinalExamQuestionDetail>>
      return editMode && draft ? (draft.question ?? original.question) : original.question
    }
    const original = data as Awaited<ReturnType<typeof fetchAdminBarFinalExamMcqQuestionDetail>>
    return editMode && draft ? (draft.question ?? original.question) : original.question
  }, [data, draft, editMode, target])

  const approveMutation = useMutation({
    mutationFn: async (item: AdminContentReviewQueueItem) => {
      if (item.type === 'library_material') {
        return approveAdminLibraryMaterial(item.resourceId)
      }
      if (item.type === 'subject_summary_case') {
        return approveAdminSubjectSummaryCase(item.resourceId)
      }
      if (item.type === 'bar_final_exam_question') {
        return approveAdminBarFinalExamQuestion(item.resourceId)
      }
      if (item.type === 'bar_final_exam_mcq_question') {
        return approveAdminBarFinalExamMcqQuestion(item.resourceId)
      }
      return approveAdminSubjectSummaryEntry(item.resourceId)
    },
    onSuccess: async () => {
      setNotice({ tone: 'green', message: 'Approved. Returning to the content review queue…' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminContentReview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications }),
        queryClient.invalidateQueries({ queryKey: ['admin-library'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-module-admin-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-mcq-questions'] }),
      ])
      setTimeout(() => navigate('/app/admin/content'), 700)
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error?.message ?? err?.message ?? 'Could not approve this content right now.'
      setNotice({ tone: 'red', message })
    },
  })

  const declineMutation = useMutation({
    mutationFn: async (item: AdminContentReviewQueueItem & { reason: string }) => {
      if (item.type === 'library_material') {
        return declineAdminLibraryMaterial(item.resourceId, item.reason)
      }
      if (item.type === 'subject_summary_case') {
        return declineAdminSubjectSummaryCase(item.resourceId, item.reason)
      }
      if (item.type === 'bar_final_exam_question') {
        return declineAdminBarFinalExamQuestion(item.resourceId, item.reason)
      }
      if (item.type === 'bar_final_exam_mcq_question') {
        return declineAdminBarFinalExamMcqQuestion(item.resourceId, item.reason)
      }
      return declineAdminSubjectSummaryEntry(item.resourceId, item.reason)
    },
    onSuccess: async () => {
      setNotice({ tone: 'green', message: 'Decline reason submitted. Returning to the content review queue…' })
      setDeclineMode(false)
      setDeclineReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminContentReview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications }),
        queryClient.invalidateQueries({ queryKey: ['admin-library'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-cases'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-summary-module-admin-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bar-final-exam-mcq-questions'] }),
      ])
      setTimeout(() => navigate('/app/admin/content'), 700)
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error?.message ?? err?.message ?? 'Could not decline this content right now.'
      setNotice({ tone: 'red', message })
    },
  })

  if (!target) {
    return (
      <div className="space-y-6">
        <AdminPageHero
          badge="Content review"
          description="Return to the queue and try another item."
          title="This review link is not valid."
        />
        <AdminPanel isDark={isDark}>
          <Link
            className={cn(
              '!px-4 !py-3 inline-flex items-center gap-2 rounded-2xl border text-sm font-medium transition hover:-translate-y-0.5',
              isDark
                ? 'border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700'
                : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50',
            )}
            to="/app/admin/content"
          >
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to content review
            </span>
          </Link>
        </AdminPanel>
      </div>
    )
  }

  const subtitle = target.subtitle
  const approveIsPending = approveMutation.isPending
  const declineIsPending = declineMutation.isPending
  const mutationPending = approveIsPending || declineIsPending || updateMutation.isPending
  const dataReady = !isLoading && !error && !!data
  const canEditInPage = target.editPath && dataReady
  const editingIsEnabled = editMode && canEditInPage

  // Convenience mutator to patch a single key on the draft.
  function patchDraft<K extends keyof any>(key: K, value: any) {
    setDraft((current: any) => (current ? { ...current, [key]: value } : current))
  }

  return (
    <div className="space-y-6">
      <div className={cn('flex flex-wrap items-center justify-between gap-3', isDark ? 'text-slate-200' : 'text-slate-700')}>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
            )}
            to="/app/admin/content"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to content review
          </Link>
          {canEditInPage ? (
            <button
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                editingIsEnabled
                  ? isDark
                    ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                    : 'border-amber-400 bg-amber-100 text-amber-900'
                  : isDark
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/40 hover:bg-amber-500/15'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100',
              )}
              disabled={updateMutation.isPending}
              onClick={() => toggleEditMode(!editingIsEnabled)}
              type="button"
            >
              {editingIsEnabled ? (
                <>
                  <X className="h-4 w-4" />
                  Stop editing
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Edit
                </>
              )}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {editNotice ? (
            <p
              className={cn(
                'text-sm font-medium',
                editNotice.tone === 'green' ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-rose-300' : 'text-rose-700'),
              )}
            >
              {editNotice.message}
            </p>
          ) : null}
          {notice ? (
            <p
              className={cn(
                'text-sm font-medium',
                notice.tone === 'green' ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-rose-300' : 'text-rose-700'),
              )}
            >
              {notice.message}
            </p>
          ) : null}
        </div>
      </div>

      <AdminPanel className="overflow-hidden" isDark={isDark}>
        <div className={cn('flex items-start justify-between gap-4 border-b px-6 py-5', isDark ? 'border-slate-800' : 'border-slate-200')}>
          <div className="min-w-0">
            <p className={cn('text-xs uppercase tracking-[0.22em]', isDark ? 'text-slate-500' : 'text-slate-400')}>
              {target.contentTypeLabel}
              {' — '}
              {editingIsEnabled ? 'editing inline' : 'pending approval'}
            </p>
            <h1 className={cn('mt-2 font-heading text-3xl', isDark ? 'text-white' : 'text-slate-950')} title={resolvedTitle}>
              {resolvedTitle}
            </h1>
            <p className={cn('mt-2 text-sm', isDark ? 'text-slate-300' : 'text-slate-600')}>
              <span>{subtitle}</span>
              <span className="mx-2">•</span>
              <span>Submitted by {target.submittedBy}</span>
              <span className="mx-2">•</span>
              <span>{new Date(target.createdAt).toLocaleString()}</span>
            </p>
          </div>
          {canEditInPage ? (
            <button
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0',
                editingIsEnabled
                  ? isDark
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/40 hover:bg-amber-500/15'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100'
                  : isDark
                    ? 'border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50',
              )}
              disabled={updateMutation.isPending}
              onClick={() => toggleEditMode(!editingIsEnabled)}
              type="button"
            >
              <Pencil className="h-4 w-4" />
              {editingIsEnabled ? 'Editing' : 'Edit content'}
            </button>
          ) : null}
        </div>

        <div className={cn('max-h-[56vh] overflow-y-auto px-6 py-6', isDark ? 'text-slate-200' : 'text-slate-800')}>
          {isLoading ? (
            <div className={cn('rounded-[20px] border px-5 py-10 text-center', isDark ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500')}>
              Loading the full content for review…
            </div>
          ) : error || !data ? (
            <div className={cn('rounded-[20px] border px-5 py-10 text-center', isDark ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500')}>
              We couldn’t load this content right now. Return to the queue and try again, or approve / decline from the list.
            </div>
          ) : target.type === 'library_material' ? (
            editingIsEnabled ? (
              <LibraryMaterialEditor
                draft={draft}
                isDark={isDark}
                onChange={patchDraft}
                node={data as Awaited<ReturnType<typeof fetchAdminLibraryMaterial>>}
              />
            ) : (
              <LibraryMaterialReview node={data as Awaited<ReturnType<typeof fetchAdminLibraryMaterial>>} isDark={isDark} />
            )
          ) : target.type === 'subject_summary_case' ? (
            editingIsEnabled ? (
              <SubjectSummaryCaseEditor
                draft={draft}
                isDark={isDark}
                onChange={patchDraft}
                node={data as Awaited<ReturnType<typeof fetchSubjectSummaryCaseDetail>>}
              />
            ) : (
              <SubjectSummaryCaseReview node={data as Awaited<ReturnType<typeof fetchSubjectSummaryCaseDetail>>} isDark={isDark} />
            )
          ) : target.type === 'subject_summary_entry' ? (
            editingIsEnabled ? (
              <SubjectSummaryEntryEditor
                draft={draft}
                isDark={isDark}
                onChange={patchDraft}
                node={data as Awaited<ReturnType<typeof fetchAdminSubjectSummaryEntryDetail>>}
              />
            ) : (
              <SubjectSummaryEntryReview node={data as Awaited<ReturnType<typeof fetchAdminSubjectSummaryEntryDetail>>} isDark={isDark} />
            )
          ) : target.type === 'bar_final_exam_question' ? (
            editingIsEnabled ? (
              <BarTheoryEditor
                draft={draft}
                isDark={isDark}
                onChange={patchDraft}
                node={data as Awaited<ReturnType<typeof fetchAdminBarFinalExamQuestionDetail>>}
              />
            ) : (
              <BarTheoryReview node={data as Awaited<ReturnType<typeof fetchAdminBarFinalExamQuestionDetail>>} isDark={isDark} />
            )
          ) : editingIsEnabled ? (
            <BarMcqEditor
              draft={draft}
              isDark={isDark}
              onChange={patchDraft}
              node={data as Awaited<ReturnType<typeof fetchAdminBarFinalExamMcqQuestionDetail>>}
            />
          ) : (
            <BarMcqReview node={data as Awaited<ReturnType<typeof fetchAdminBarFinalExamMcqQuestionDetail>>} isDark={isDark} />
          )}
        </div>

        {editingIsEnabled ? (
          <div className={cn('border-t px-6 py-5', isDark ? 'border-slate-800' : 'border-slate-200')}>
            {editNotice?.tone === 'red' ? (
              <div
                className={cn(
                  'mb-4 rounded-[20px] border px-4 py-3 text-sm',
                  isDark ? 'border-rose-500/20 bg-rose-500/10 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-700',
                )}
              >
                {editNotice.message}
              </div>
            ) : null}
            <div className={cn('flex flex-wrap items-center justify-between gap-3')}>
              <p className={cn('max-w-xl text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-500')}>
                Edits are saved in place. After saving you’ll stay on this page so you can continue reviewing, approving or declining.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  className={cn(
                    '!px-4 !py-3 inline-flex items-center gap-2 rounded-2xl border text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0',
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500',
                  )}
                  disabled={updateMutation.isPending}
                  onClick={() => toggleEditMode(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="button-primary !px-4 !py-3"
                  disabled={updateMutation.isPending}
                  onClick={() => void updateMutation.mutateAsync({ targetItem: target, dataSnapshot: data!, draftSnapshot: draft, librarySection: section })}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <CheckCheck className="h-4 w-4" />
                    {updateMutation.isPending ? 'Saving edits…' : 'Save edits'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : declineMode ? (
          <div className={cn('border-t px-6 py-5', isDark ? 'border-slate-800' : 'border-slate-200')}>
            <label className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700')}>
              Decline reason
            </label>
            <textarea
              className={cn(
                'mt-3 min-h-[140px] w-full rounded-[22px] border px-4 py-4 text-sm outline-none transition',
                isDark
                  ? 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-slate-500'
                  : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-slate-400',
              )}
              maxLength={500}
              onChange={(event) => setDeclineReason(event.target.value)}
              placeholder="Explain what needs to be corrected before this content can be approved."
              value={declineReason}
            />
            <div className={cn('mt-2 flex justify-end text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
              <span>{declineReason.length}/500</span>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className={cn(
                  '!px-4 !py-3 inline-flex items-center gap-2 rounded-2xl border text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0',
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500',
                )}
                disabled={declineIsPending}
                onClick={() => {
                  setDeclineMode(false)
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
                    : 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400',
                )}
                disabled={declineIsPending || declineReason.trim().length < 3}
                onClick={() => void declineMutation.mutateAsync({ ...target, reason: declineReason.trim() })}
                type="button"
              >
                {declineIsPending ? 'Sending decline…' : 'Decline with reason'}
              </button>
            </div>
          </div>
        ) : (
          <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t px-6 py-5', isDark ? 'border-slate-800' : 'border-slate-200')}>
            <p className={cn('max-w-xl text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-500')}>
              Once you approve, the content becomes available to learners and the content admin receives a confirmation notification. Decline sends revision feedback.
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                className={cn(
                  '!px-4 !py-3 inline-flex items-center gap-2 rounded-2xl border text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0',
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500',
                )}
                disabled={mutationPending || !dataReady}
                onClick={() => setDeclineMode(true)}
                type="button"
              >
                Decline
              </button>
              <button
                className="button-primary !px-4 !py-3"
                disabled={!dataReady || mutationPending}
                onClick={() => void approveMutation.mutateAsync(target)}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <CheckCheck className="h-4 w-4" />
                  {approveIsPending ? 'Approving…' : 'Approve content'}
                </span>
              </button>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  )
}

function SectionHeading({ children, isDark }: { children: ReactNode; isDark: boolean }) {
  return (
    <p
      className={cn(
        'text-xs uppercase tracking-[0.22em]',
        isDark ? 'text-slate-500' : 'text-slate-400'
      )}
    >
      {children}
    </p>
  )
}

function ReviewBlock({ children, className, isDark }: { children: ReactNode; className?: string; isDark: boolean }) {
  return (
    <section
      className={cn(
        'rounded-[20px] border px-5 py-5',
        isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50',
        className ?? ''
      )}
    >
      {children}
    </section>
  )
}

function RichTextContent({ html, isDark }: { html: string; isDark: boolean }) {
  return (
    <div
      className={cn(
        'rich-text-content text-sm leading-7',
        isDark ? 'text-slate-200' : 'text-slate-800'
      )}
      // Safety: content is authored by trusted content admins; rich text formatting
      // requires HTML output to preserve italics, lists, headings, colors, and links.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// Strips HTML markup so we can measure actual text length in RTE fields.
function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Minimal contentEditable rich text editor used when inline-editing review
// content (avoids opening a separate admin editor page).
function RichTextField({
  isDark,
  label,
  minHeight,
  onChange,
  placeholder,
  value,
}: {
  isDark: boolean
  label: string
  minHeight: number
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const colorInputRef = useRef<HTMLInputElement | null>(null)
  const selectionRef = useRef<Range | null>(null)

  useEffect(() => {
    if (!editorRef.current || editorRef.current.innerHTML === value) {
      return
    }
    editorRef.current.innerHTML = value
  }, [value])

  function saveSelection() {
    if (typeof window === 'undefined') return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return
    selectionRef.current = range.cloneRange()
  }

  function restoreSelection() {
    if (typeof window === 'undefined') return
    const range = selectionRef.current
    if (!range) return
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function applyCommand(command: string, commandValue?: string) {
    if (!editorRef.current) return
    editorRef.current.focus()
    restoreSelection()
    document.execCommand(command, false, commandValue)
    onChange(editorRef.current.innerHTML)
  }

  const toolbarButtons = [
    { command: 'bold', icon: Bold, label: 'Bold' },
    { command: 'italic', icon: Italic, label: 'Italic' },
    { command: 'underline', icon: Underline, label: 'Underline' },
    { command: 'justifyLeft', icon: AlignLeft, label: 'Align left' },
    { command: 'justifyCenter', icon: AlignCenter, label: 'Align center' },
    { command: 'justifyRight', icon: AlignRight, label: 'Align right' },
    { command: 'insertUnorderedList', icon: List, label: 'Bullet list' },
    { command: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
  ] as const

  return (
    <div className="space-y-2">
      <span className={cn('text-xs font-medium uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-500')}>
        {label}
      </span>
      <div className={cn('rounded-[24px] border', isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50')}>
        <div className={cn('flex flex-wrap gap-2 border-b px-3 py-2.5', isDark ? 'border-slate-700' : 'border-slate-200')}>
          {toolbarButtons.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-2xl border transition',
                  isDark
                    ? 'border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950',
                )}
                key={item.command}
                onMouseDown={(event) => {
                  event.preventDefault()
                  applyCommand(item.command)
                }}
                title={item.label}
                type="button"
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
          <button
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-2xl border text-xs font-semibold transition',
              isDark
                ? 'border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950',
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              saveSelection()
              colorInputRef.current?.click()
            }}
            title="Text color"
            type="button"
          >
            A
          </button>
          <input className="sr-only" onChange={(event) => applyCommand('foreColor', event.target.value)} ref={colorInputRef} type="color" />
        </div>
        <div className="relative cursor-text" onClick={() => editorRef.current?.focus()} style={{ minHeight }}>
          {!stripHtml(value) ? (
            <div className={cn('pointer-events-none absolute left-4 top-4 text-sm', isDark ? 'text-slate-500' : 'text-slate-400')}>
              {placeholder}
            </div>
          ) : null}
          <div
            aria-label={label}
            className={cn('rich-text-content px-4 py-3 text-sm leading-7 outline-none', isDark ? 'text-white' : 'text-slate-950')}
            contentEditable
            role="textbox"
            onInput={(event) => onChange(event.currentTarget.innerHTML)}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            ref={editorRef}
            suppressContentEditableWarning
            tabIndex={0}
          />
        </div>
      </div>
    </div>
  )
}

function LibraryMaterialReview({ node, isDark }: { node: Awaited<ReturnType<typeof fetchAdminLibraryMaterial>>; isDark: boolean }) {
  const mat = node.material
  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <div className="flex flex-wrap items-center gap-2">
          <SectionHeading isDark={isDark}>Section</SectionHeading>
          <span className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
            {node.category.name}
          </span>
          {mat.reportNumber ? (
            <>
              <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>•</span>
              <span className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>{mat.reportNumber}</span>
            </>
          ) : null}
        </div>
        <h4 className={cn('mt-3 font-heading text-xl', isDark ? 'text-white' : 'text-slate-950')}>{mat.title}</h4>
      </ReviewBlock>

      {mat.summary?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Summary</SectionHeading>
          <div className="mt-3">
            <RichTextContent html={mat.summary} isDark={isDark} />
          </div>
        </ReviewBlock>
      ) : null}

      {mat.body?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Full body</SectionHeading>
          <div className="mt-3">
            <RichTextContent html={mat.body} isDark={isDark} />
          </div>
        </ReviewBlock>
      ) : null}
    </div>
  )
}

function SubjectSummaryCaseReview({ node, isDark }: { node: Awaited<ReturnType<typeof fetchSubjectSummaryCaseDetail>>; isDark: boolean }) {
  const badges = [node.court, node.citation, node.year ? String(node.year) : null].filter(Boolean) as string[]
  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>
          {node.subject.name} / {node.topic.name}
        </p>
        <h4 className={cn('mt-2 font-heading text-xl', isDark ? 'text-white' : 'text-slate-950')}>{node.title}</h4>
        {badges.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {badges.map((b) => (
              <span
                className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}
                key={b}
              >
                {b}
              </span>
            ))}
          </div>
        ) : null}
      </ReviewBlock>

      {node.caseSummary?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Ratio summary</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.caseSummary} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.facts?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Material facts</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.facts} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.issues?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Issues</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.issues} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.ratioDecidendi?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Ratio decidendi</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.ratioDecidendi} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.decisionHolding?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Decision / holding</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.decisionHolding} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.obiterDicta?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Obiter dicta</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.obiterDicta} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.legalPrinciples?.length ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Legal principles</SectionHeading>
          <ul className={cn('mt-3 list-disc space-y-1 pl-6 text-sm', isDark ? 'text-slate-200' : 'text-slate-800')}>
            {node.legalPrinciples.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </ReviewBlock>
      ) : null}
    </div>
  )
}

function SubjectSummaryEntryReview({ node, isDark }: { node: Awaited<ReturnType<typeof fetchAdminSubjectSummaryEntryDetail>>; isDark: boolean }) {
  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
            {node.moduleType}
          </span>
          {node.topic ? (
            <span className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
              Topic: {node.topic}
            </span>
          ) : null}
          <span className={cn('rounded-full border px-3 py-1 text-xs capitalize', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
            Difficulty: {node.difficulty.toLowerCase()}
          </span>
          {node.serialNumber ? (
            <span className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
              {node.serialNumber}
            </span>
          ) : null}
        </div>
        <p className={cn('mt-3 text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>{node.subject.name}</p>
        <h4 className={cn('mt-2 font-heading text-xl', isDark ? 'text-white' : 'text-slate-950')}>{node.question}</h4>
      </ReviewBlock>

      {node.keyPrinciple?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Key principle</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.keyPrinciple} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.answer?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Full answer</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.answer} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.examTip?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Exam tip</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.examTip} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}

      {node.relatedCases?.length ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Related cases</SectionHeading>
          <ul className={cn('mt-3 space-y-2 text-sm', isDark ? 'text-slate-200' : 'text-slate-800')}>
            {node.relatedCases.map((c) => (
              <li className={cn('rounded-2xl border px-4 py-3', isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white')} key={c.id}>
                <p className={cn('font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{c.title}</p>
                {c.citation ? <p className={cn('mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>{c.citation}</p> : null}
                {c.ratioDecidendi?.trim() ? <div className="mt-2"><RichTextContent html={c.ratioDecidendi} isDark={isDark} /></div> : null}
              </li>
            ))}
          </ul>
        </ReviewBlock>
      ) : null}

      {node.relatedStatutes?.length ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Related statutes</SectionHeading>
          <ul className={cn('mt-3 list-disc space-y-1 pl-6 text-sm', isDark ? 'text-slate-200' : 'text-slate-800')}>
            {node.relatedStatutes.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </ReviewBlock>
      ) : null}

      {node.tags?.length ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Tags</SectionHeading>
          <div className="mt-3 flex flex-wrap gap-2">
            {node.tags.map((t) => (
              <span
                className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}
                key={t}
              >
                #{t}
              </span>
            ))}
          </div>
        </ReviewBlock>
      ) : null}
    </div>
  )
}

function BarTheoryReview({ node, isDark }: { node: Awaited<ReturnType<typeof fetchAdminBarFinalExamQuestionDetail>>; isDark: boolean }) {
  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>{node.subject.name}</p>
        {node.examDate ? (
          <p className={cn('mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
            Exam date: {new Date(node.examDate).toLocaleDateString()}
          </p>
        ) : null}
        <h4 className={cn('mt-3 font-heading text-xl', isDark ? 'text-white' : 'text-slate-950')}>{node.question}</h4>
      </ReviewBlock>

      {node.answer?.trim() ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Model answer</SectionHeading>
          <div className="mt-3"><RichTextContent html={node.answer} isDark={isDark} /></div>
        </ReviewBlock>
      ) : null}
    </div>
  )
}

function BarMcqReview({ node, isDark }: { node: Awaited<ReturnType<typeof fetchAdminBarFinalExamMcqQuestionDetail>>; isDark: boolean }) {
  const options = node.options ?? []
  const correctLabel = options[node.correctOptionIndex]
  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>{node.subject.name}</p>
        {node.examDate ? (
          <p className={cn('mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
            Exam date: {new Date(node.examDate).toLocaleDateString()}
          </p>
        ) : null}
        <h4 className={cn('mt-3 font-heading text-xl', isDark ? 'text-white' : 'text-slate-950')}>{node.question}</h4>
      </ReviewBlock>

      {options.length ? (
        <ReviewBlock isDark={isDark}>
          <SectionHeading isDark={isDark}>Answer options</SectionHeading>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm">
            {options.map((opt, idx) => {
              const isCorrect = idx === node.correctOptionIndex
              return (
                <li
                  className={cn(
                    'rounded-2xl border px-4 py-3',
                    isCorrect
                      ? (isDark ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : 'border-emerald-300 bg-emerald-50 text-emerald-900')
                      : (isDark ? 'border-slate-800 bg-slate-950 text-slate-200' : 'border-slate-200 bg-white text-slate-800')
                  )}
                  key={idx}
                >
                  <span className="mr-2 font-medium">{isCorrect ? '✓ ' : ''}</span>{opt}
                </li>
              )
            })}
          </ol>
          {correctLabel ? (
            <p className={cn('mt-5 text-xs uppercase tracking-[0.22em]', isDark ? 'text-emerald-400' : 'text-emerald-700')}>
              Correct answer: {correctLabel}
            </p>
          ) : null}
        </ReviewBlock>
      ) : null}
    </div>
  )
}

type EditorChange = <K extends keyof any>(key: K, value: any) => void

// Small helper used by inline editors for short text inputs.
function TextField({
  isDark,
  label,
  onChange,
  placeholder,
  value,
}: {
  isDark: boolean
  label: string
  onChange: (next: string) => void
  placeholder?: string
  value: string
}) {
  return (
    <label className="space-y-2 block">
      <span className={cn('text-xs font-medium uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-500')}>
        {label}
      </span>
      <input
        className={cn('w-full rounded-2xl border px-3.5 py-3 text-sm outline-none transition', isDark ? 'border-slate-700 bg-slate-900 text-white focus:border-slate-500' : 'border-slate-200 bg-slate-50 text-slate-950 focus:border-slate-400')}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  )
}

function LongTextField({
  isDark,
  label,
  minHeight,
  onChange,
  placeholder,
  value,
}: {
  isDark: boolean
  label: string
  minHeight?: number
  onChange: (next: string) => void
  placeholder?: string
  value: string
}) {
  return (
    <label className="space-y-2 block">
      <span className={cn('text-xs font-medium uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-500')}>
        {label}
      </span>
      <textarea
        className={cn('w-full rounded-[22px] border px-4 py-3 text-sm outline-none transition leading-7', isDark ? 'border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-slate-500' : 'border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400 focus:border-slate-400')}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ minHeight: minHeight ?? 140 }}
        value={value}
      />
    </label>
  )
}

// Comma/semicolon/newline-separated string list editor (keywords / tags / statutes / principles).
function StringListField({
  isDark,
  label,
  onChange,
  value,
}: {
  isDark: boolean
  label: string
  onChange: (next: string[]) => void
  value: string[]
}) {
  const combined = value.join('; ')
  return (
    <div className="space-y-2">
      <span className={cn('block text-xs font-medium uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-500')}>
        {label}
      </span>
      <textarea
        className={cn('w-full rounded-[22px] border px-4 py-3 text-sm outline-none transition leading-7', isDark ? 'border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-slate-500' : 'border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400 focus:border-slate-400')}
        onChange={(event) => {
          const next = event.target.value
            .split(/[\n;,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
          onChange(next)
        }}
        placeholder="Separate with ; or newlines"
        style={{ minHeight: 110 }}
        value={combined}
      />
      <div className="flex flex-wrap gap-2">
        {value.map((s, i) => (
          <span
            className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}
            key={`${s}-${i}`}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

function LibraryMaterialEditor({
  draft,
  isDark,
  onChange,
  node,
}: {
  draft: any
  isDark: boolean
  onChange: EditorChange
  node: Awaited<ReturnType<typeof fetchAdminLibraryMaterial>>
}) {
  const mat = node.material
  const title = (draft?.title as string | undefined) ?? mat.title ?? ''
  const summary = (draft?.summary as string | undefined) ?? mat.summary ?? ''
  const body = (draft?.body as string | undefined) ?? mat.body ?? ''

  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <div className="flex flex-wrap items-center gap-2">
          <SectionHeading isDark={isDark}>Section</SectionHeading>
          <span className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
            {node.category.name}
          </span>
          {mat.reportNumber ? (
            <>
              <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>•</span>
              <span className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>{mat.reportNumber}</span>
            </>
          ) : null}
        </div>
        <div className="mt-4">
          <TextField isDark={isDark} label="Title" onChange={(v) => onChange('title', v)} value={title} placeholder="e.g. Smith v Jones (1920)" />
        </div>
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <RichTextField
          isDark={isDark}
          label="Summary"
          minHeight={200}
          onChange={(v) => onChange('summary', v)}
          placeholder="Short summary of the material"
          value={summary}
        />
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <RichTextField
          isDark={isDark}
          label="Full body"
          minHeight={360}
          onChange={(v) => onChange('body', v)}
          placeholder="Full content (format with bold, lists, headings…)"
          value={body}
        />
      </ReviewBlock>
    </div>
  )
}

function SubjectSummaryCaseEditor({
  draft,
  isDark,
  onChange,
  node,
}: {
  draft: any
  isDark: boolean
  onChange: EditorChange
  node: Awaited<ReturnType<typeof fetchSubjectSummaryCaseDetail>>
}) {
  const title = (draft?.title as string | undefined) ?? node.title ?? ''
  const court = (draft?.court as string | undefined) ?? node.court ?? ''
  const citation = (draft?.citation as string | undefined) ?? node.citation ?? ''
  const caseSummary = (draft?.caseSummary as string | undefined) ?? node.caseSummary ?? ''
  const facts = (draft?.facts as string | undefined) ?? node.facts ?? ''
  const issues = (draft?.issues as string | undefined) ?? node.issues ?? ''
  const ratioDecidendi = (draft?.ratioDecidendi as string | undefined) ?? node.ratioDecidendi ?? ''
  const decisionHolding = (draft?.decisionHolding as string | undefined) ?? node.decisionHolding ?? ''
  const obiterDicta = (draft?.obiterDicta as string | undefined) ?? node.obiterDicta ?? ''
  const legalPrinciples = (draft?.legalPrinciples as string[] | undefined) ?? node.legalPrinciples ?? []
  const relatedStatutes = (draft?.relatedStatutes as string[] | undefined) ?? node.relatedStatutes ?? []
  const keywords = (draft?.keywords as string[] | undefined) ?? node.keywords ?? []
  const badges = [court, citation, node.year ? String(node.year) : null].filter(Boolean) as string[]

  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <div className="space-y-2">
          <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>
            {node.subject.name} / {node.topic.name}
          </p>
          {badges.length ? (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}
                  key={b}
                >
                  {b}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField isDark={isDark} label="Title / Case name" onChange={(v) => onChange('title', v)} value={title} placeholder="e.g. Smith v Jones" />
          <TextField isDark={isDark} label="Court" onChange={(v) => onChange('court', v)} value={court} placeholder="e.g. Supreme Court" />
        </div>
        <div className="mt-4">
          <TextField isDark={isDark} label="Citation" onChange={(v) => onChange('citation', v)} value={citation} placeholder="e.g. [1920] AC 123" />
        </div>
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Ratio summary" minHeight={200} onChange={(v) => onChange('caseSummary', v)} placeholder="Short ratio summary" value={caseSummary} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Material facts" minHeight={240} onChange={(v) => onChange('facts', v)} placeholder="Material facts" value={facts} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Issues" minHeight={180} onChange={(v) => onChange('issues', v)} placeholder="Legal issues" value={issues} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Ratio decidendi" minHeight={260} onChange={(v) => onChange('ratioDecidendi', v)} placeholder="Ratio decidendi" value={ratioDecidendi} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Decision / holding" minHeight={200} onChange={(v) => onChange('decisionHolding', v)} placeholder="Decision / holding" value={decisionHolding} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Obiter dicta" minHeight={200} onChange={(v) => onChange('obiterDicta', v)} placeholder="Obiter dicta" value={obiterDicta} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <StringListField isDark={isDark} label="Legal principles" onChange={(v) => onChange('legalPrinciples', v)} value={legalPrinciples} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <StringListField isDark={isDark} label="Related statutes" onChange={(v) => onChange('relatedStatutes', v)} value={relatedStatutes} />
      </ReviewBlock>
      <ReviewBlock isDark={isDark}>
        <StringListField isDark={isDark} label="Keywords" onChange={(v) => onChange('keywords', v)} value={keywords} />
      </ReviewBlock>
    </div>
  )
}

function SubjectSummaryEntryEditor({
  draft,
  isDark,
  onChange,
  node,
}: {
  draft: any
  isDark: boolean
  onChange: EditorChange
  node: Awaited<ReturnType<typeof fetchAdminSubjectSummaryEntryDetail>>
}) {
  const question = (draft?.question as string | undefined) ?? node.question ?? ''
  const answer = (draft?.answer as string | undefined) ?? node.answer ?? ''
  const keyPrinciple = (draft?.keyPrinciple as string | undefined) ?? node.keyPrinciple ?? ''
  const examTip = (draft?.examTip as string | undefined) ?? node.examTip ?? ''
  const topic = (draft?.topic as string | undefined) ?? node.topic ?? ''
  const difficulty = (draft?.difficulty as string | undefined) ?? node.difficulty ?? 'EASY'
  const estimatedReadingTime = Number((draft?.estimatedReadingTime as number | undefined) ?? node.estimatedReadingTime ?? 2)
  const relatedStatutes = (draft?.relatedStatutes as string[] | undefined) ?? node.relatedStatutes ?? []
  const tags = (draft?.tags as string[] | undefined) ?? node.tags ?? []

  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
            {node.moduleType}
          </span>
          {node.serialNumber ? (
            <span className={cn('rounded-full border px-3 py-1 text-xs', isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700')}>
              {node.serialNumber}
            </span>
          ) : null}
          <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>{node.subject.name}</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <TextField isDark={isDark} label="Topic" onChange={(v) => onChange('topic', v)} value={topic} placeholder="e.g. Offer and Acceptance" />
          <label className="space-y-2 block">
            <span className={cn('text-xs font-medium uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-500')}>Difficulty</span>
            <select
              className={cn('w-full rounded-2xl border px-3.5 py-3 text-sm outline-none transition', isDark ? 'border-slate-700 bg-slate-900 text-white focus:border-slate-500' : 'border-slate-200 bg-slate-50 text-slate-950 focus:border-slate-400')}
              onChange={(event) => onChange('difficulty', event.target.value)}
              value={difficulty}
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </label>
          <TextField isDark={isDark} label="Read mins" onChange={(v) => onChange('estimatedReadingTime', Number(v))} placeholder="2" value={String(estimatedReadingTime)} />
        </div>
        <div className="mt-4">
          <LongTextField isDark={isDark} label="Question" minHeight={140} onChange={(v) => onChange('question', v)} placeholder="Question text" value={question} />
        </div>
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Key principle" minHeight={180} onChange={(v) => onChange('keyPrinciple', v)} placeholder="Key principle (optional)" value={keyPrinciple} />
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Full answer" minHeight={340} onChange={(v) => onChange('answer', v)} placeholder="Full answer with formatting" value={answer} />
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Exam tip" minHeight={160} onChange={(v) => onChange('examTip', v)} placeholder="Exam tip (optional)" value={examTip} />
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <StringListField isDark={isDark} label="Related statutes" onChange={(v) => onChange('relatedStatutes', v)} value={relatedStatutes} />
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <StringListField isDark={isDark} label="Tags" onChange={(v) => onChange('tags', v)} value={tags} />
      </ReviewBlock>
    </div>
  )
}

function BarTheoryEditor({
  draft,
  isDark,
  onChange,
  node,
}: {
  draft: any
  isDark: boolean
  onChange: EditorChange
  node: Awaited<ReturnType<typeof fetchAdminBarFinalExamQuestionDetail>>
}) {
  const question = (draft?.question as string | undefined) ?? node.question ?? ''
  const answer = (draft?.answer as string | undefined) ?? node.answer ?? ''

  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>{node.subject.name}</p>
        {node.examDate ? (
          <p className={cn('mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
            Exam date: {new Date(node.examDate).toLocaleDateString()}
          </p>
        ) : null}
        <div className="mt-4">
          <LongTextField isDark={isDark} label="Question" minHeight={180} onChange={(v) => onChange('question', v)} placeholder="Theory question" value={question} />
        </div>
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <RichTextField isDark={isDark} label="Model answer" minHeight={360} onChange={(v) => onChange('answer', v)} placeholder="Model answer with formatting" value={answer} />
      </ReviewBlock>
    </div>
  )
}

function BarMcqEditor({
  draft,
  isDark,
  onChange,
  node,
}: {
  draft: any
  isDark: boolean
  onChange: EditorChange
  node: Awaited<ReturnType<typeof fetchAdminBarFinalExamMcqQuestionDetail>>
}) {
  const question = (draft?.question as string | undefined) ?? node.question ?? ''
  const options = (draft?.options as string[] | undefined) ?? node.options ?? []
  const correctOptionIndex = Number((draft?.correctOptionIndex as number | undefined) ?? node.correctOptionIndex ?? 0)

  function updateOptionAt(index: number, next: string) {
    const nextOptions = [...options]
    nextOptions[index] = next
    onChange('options', nextOptions)
  }

  function addOption() {
    onChange('options', [...options, ''])
  }

  function removeOptionAt(index: number) {
    const nextOptions = options.filter((_, i) => i !== index)
    let nextCorrect = correctOptionIndex
    if (correctOptionIndex >= index && correctOptionIndex > 0) {
      nextCorrect = correctOptionIndex - 1
    } else if (nextOptions.length === 0) {
      nextCorrect = 0
    } else if (correctOptionIndex >= nextOptions.length) {
      nextCorrect = Math.max(0, nextOptions.length - 1)
    }
    onChange('options', nextOptions)
    onChange('correctOptionIndex', nextCorrect)
  }

  return (
    <div className="space-y-5">
      <ReviewBlock isDark={isDark}>
        <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>{node.subject.name}</p>
        {node.examDate ? (
          <p className={cn('mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
            Exam date: {new Date(node.examDate).toLocaleDateString()}
          </p>
        ) : null}
        <div className="mt-4">
          <LongTextField isDark={isDark} label="Question" minHeight={180} onChange={(v) => onChange('question', v)} placeholder="MCQ question stem" value={question} />
        </div>
      </ReviewBlock>

      <ReviewBlock isDark={isDark}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading isDark={isDark}>Answer options</SectionHeading>
          <button
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition',
              isDark
                ? 'border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700'
                : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50',
            )}
            onClick={addOption}
            type="button"
          >
            + Add option
          </button>
        </div>
        <ol className="mt-4 space-y-3">
          {options.map((opt, idx) => {
            const isCorrect = idx === correctOptionIndex
            return (
              <li
                className={cn(
                  'rounded-2xl border p-3',
                  isCorrect
                    ? isDark
                      ? 'border-emerald-400/40 bg-emerald-500/10'
                      : 'border-emerald-300 bg-emerald-50'
                    : isDark
                      ? 'border-slate-800 bg-slate-950'
                      : 'border-slate-200 bg-white',
                )}
                key={idx}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    aria-label={`Mark option ${idx + 1} as correct`}
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition',
                      isCorrect
                        ? isDark
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-emerald-400 bg-emerald-100 text-emerald-800'
                        : isDark
                          ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300',
                    )}
                    onClick={() => onChange('correctOptionIndex', idx)}
                    type="button"
                  >
                    {isCorrect ? '✓' : idx + 1}
                  </button>
                  <div className="min-w-0 flex-1">
                    <LongTextField
                      isDark={isDark}
                      label={`Option ${idx + 1}${isCorrect ? ' — correct answer' : ''}`}
                      minHeight={90}
                      onChange={(v) => updateOptionAt(idx, v)}
                      placeholder={`Answer option ${idx + 1}`}
                      value={opt}
                    />
                  </div>
                  <button
                    aria-label={`Remove option ${idx + 1}`}
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition',
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-rose-500/30 hover:text-rose-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-600',
                    )}
                    onClick={() => removeOptionAt(idx)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
        {correctOptionIndex >= 0 && options[correctOptionIndex] ? (
          <p className={cn('mt-5 text-xs uppercase tracking-[0.22em]', isDark ? 'text-emerald-400' : 'text-emerald-700')}>
            Correct answer: {options[correctOptionIndex]}
          </p>
        ) : null}
      </ReviewBlock>
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
