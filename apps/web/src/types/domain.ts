import { LucideIcon } from 'lucide-react'

export type NavItem = {
  href: string
  icon: LucideIcon
  label: string
}

export type PricingPlan = {
  description: string
  featureHighlights: string[]
  id: string
  label?: string
  monthlyPrice: number
  annualPrice: number
  name: string
}

export type CourseProgress = {
  category: string
  completion: number
  id: string
  nextLesson: string
  tutor: string
  title: string
}

export type DashboardMetric = {
  change: string
  id: string
  label: string
  value: string
}

export type DeadlineItem = {
  dueLabel: string
  id: string
  title: string
  type: string
}

export type Recommendation = {
  id: string
  reason: string
  title: string
  type: string
}

export type DashboardSnapshot = {
  activePlan: string
  completionRate: number
  courses: CourseProgress[]
  deadlines: DeadlineItem[]
  metrics: DashboardMetric[]
  recommendations: Recommendation[]
  streakDays: number
  weeklyFocusHours: number
}

export type AdminAccessRequest = {
  company: string
  email: string
  id: string
  requestedRole: string
  requestedAt: string
  requester: string
  status: 'pending' | 'approved' | 'needs_review'
}

export type AdminContentReviewItem = {
  id: string
  owner: string
  status: 'queued' | 'approved' | 'changes_requested'
  title: string
  type: string
  updatedAt: string
}

export type AdminPaymentIssue = {
  amount: string
  id: string
  owner: string
  plan: string
  status: 'review' | 'escalated' | 'cleared'
  submittedAt: string
}

export type AdminModerationItem = {
  flags: number
  id: string
  reporterSummary: string
  status: 'open' | 'resolved' | 'watch'
  subject: string
}

export type AdminDashboardSnapshot = {
  accessRequests: AdminAccessRequest[]
  institutionsActive: string
  liveAlerts: string[]
  metrics: DashboardMetric[]
  moderationQueue: AdminModerationItem[]
  paymentIssues: AdminPaymentIssue[]
  reviewQueue: AdminContentReviewItem[]
  revenueAtRisk: string
  supportBacklog: string
}
