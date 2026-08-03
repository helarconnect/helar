import { BookOpenText, CheckSquare, ClipboardList, CreditCard, GraduationCap, MessageSquareMore, Scale, ShieldCheck, Users2 } from 'lucide-react'

import { AdminDashboardSnapshot, DashboardSnapshot, NavItem, PricingPlan } from '@/types/domain'
import { canAccessPayments, hasAdminAccess } from '@/lib/utils'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const marketingStats = [
  { label: 'institution partners', value: '42' },
  { label: 'legal learners onboarded', value: '18.4k' },
  { label: 'exam readiness uplift', value: '+31%' },
]

export const legalTracks = [
  {
    blurb: 'Case walkthroughs, precedent mapping, and court-ready writing drills.',
    title: 'Litigation practice',
  },
  {
    blurb: 'Clause reviews, drafting labs, and negotiation simulations for in-house teams.',
    title: 'Corporate advisory',
  },
  {
    blurb: 'AML, KYC, and regulatory programs for institutions handling scrutiny at scale.',
    title: 'Compliance operations',
  },
]

export const trustSignals = ['Axiom Legal Academy', 'Blackwell School of Law', 'Cobalt Chambers', 'Westbridge Institute']

const studentDashboardNav: NavItem[] = [
  { href: '/app/dashboard', icon: Scale, label: 'Dashboard' },
  { href: '/app/library', icon: BookOpenText, label: 'Library' },
  { href: '/app/bar-final-exams-nls-mcq', icon: ClipboardList, label: 'Bar Final Exams NLS-MCQ (Q & A)' },
  { href: '/app/cbt', icon: CheckSquare, label: 'CBT / Assessments' },
  { href: '/connect?from=dashboard', icon: MessageSquareMore, label: 'Helar Connect' },
  { href: '/app/subscription', icon: ShieldCheck, label: 'Subscription' },
]

const adminDashboardNav: NavItem[] = [
  { href: '/app/dashboard', icon: Scale, label: 'Admin Overview' },
  { href: '/app/admin/users', icon: Users2, label: 'Users' },
  { href: '/app/admin/bar-final-exams-nls-mcq', icon: ClipboardList, label: 'Bar Final Exams NLS-MCQ (Q & A)' },
  { href: '/app/admin/cbt', icon: CheckSquare, label: 'CBT Management' },
  { href: '/app/admin/content', icon: GraduationCap, label: 'Content Review' },
  { href: '/app/admin/payments', icon: CreditCard, label: 'Payments' },
  { href: '/connect?from=dashboard', icon: MessageSquareMore, label: 'Helar Connect' },
]

export function getDashboardNav(roleCodes: string[] = []) {
  if (!hasAdminAccess(roleCodes)) {
    if (roleCodes.includes('judge')) {
      return studentDashboardNav.filter((item) => item.href !== '/app/cbt')
    }

    return studentDashboardNav
  }

  return adminDashboardNav.filter((item) => item.href !== '/app/admin/payments' || canAccessPayments(roleCodes))
}

const pricingPlans: PricingPlan[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    description: 'For individual law students building a dependable weekly study system.',
    monthlyPrice: 29,
    annualPrice: 290,
    featureHighlights: ['Core courses and library access', 'Progress tracking dashboard', 'Assignment deadlines and reminders'],
  },
  {
    id: 'advocate',
    name: 'Advocate',
    label: 'Most popular',
    description: 'For serious learners preparing for practice, exams, and certification outcomes.',
    monthlyPrice: 59,
    annualPrice: 590,
    featureHighlights: ['Everything in Foundation', 'CBT practice engine and analytics', 'Certificates and tutor office-hour priority'],
  },
  {
    id: 'institution',
    name: 'Institution',
    description: 'For firms, schools, and legal teams managing multi-seat training programs.',
    monthlyPrice: 129,
    annualPrice: 1290,
    featureHighlights: ['Seat management and reporting', 'Role-based admin workspace', 'Priority onboarding and enterprise support'],
  },
]

const dashboardSnapshot: DashboardSnapshot = {
  activePlan: 'Advocate Annual',
  completionRate: 74,
  streakDays: 16,
  weeklyFocusHours: 6,
  metrics: [
    { id: 'hours', label: 'Focused study', value: '12.5h', change: '+2.1h this week' },
    { id: 'modules', label: 'Modules completed', value: '18', change: '3 new completions' },
    { id: 'exams', label: 'Mock exam score', value: '89%', change: '+7% from last attempt' },
    { id: 'certs', label: 'Certificates earned', value: '3', change: '1 pending review' },
  ],
  courses: [
    {
      id: 'litigation-writing',
      title: 'Advanced Litigation Writing',
      category: 'Civil procedure',
      tutor: 'Amara Duru, SAN',
      completion: 82,
      nextLesson: 'Persuasive reply briefs',
    },
    {
      id: 'evidence',
      title: 'Evidence and Trial Strategy',
      category: 'Courtroom skills',
      tutor: 'Milo Bassey',
      completion: 58,
      nextLesson: 'Expert witness structure',
    },
    {
      id: 'compliance',
      title: 'AML and Financial Compliance',
      category: 'Regulatory practice',
      tutor: 'Nora Petrov',
      completion: 41,
      nextLesson: 'Suspicious activity escalation',
    },
  ],
  deadlines: [
    { id: 'deadline-1', title: 'Case summary brief', type: 'Assignment', dueLabel: 'Due in 18 hours' },
    { id: 'deadline-2', title: 'Civil procedure CBT', type: 'Exam', dueLabel: 'Opens tomorrow' },
    { id: 'deadline-3', title: 'Tutor feedback review', type: 'Review', dueLabel: 'Friday at 14:00' },
  ],
  recommendations: [
    { id: 'rec-1', title: 'Corporate drafting essentials', type: 'Course', reason: 'Matches your current litigation-to-transaction crossover goals.' },
    { id: 'rec-2', title: 'Evidence checklist bundle', type: 'Library', reason: 'Pairs with your next lesson on expert witness preparation.' },
    { id: 'rec-3', title: 'Negligence case drill', type: 'Exam prep', reason: 'Recommended from your most-missed question cluster.' },
  ],
}

const adminDashboardSnapshot: AdminDashboardSnapshot = {
  institutionsActive: '42 institutions',
  liveAlerts: [
    '3 payment disputes need review before 16:00.',
    '7 new tutor access requests are waiting for approval.',
    '2 community reports were escalated by moderators in the last hour.',
  ],
  metrics: [
    { id: 'mrr', label: 'Monthly revenue', value: '$84.2k', change: '+8.4% from last month' },
    { id: 'users', label: 'Active learners', value: '18.4k', change: '+612 this week' },
    { id: 'retention', label: 'Renewal health', value: '91%', change: '+3% after intervention' },
    { id: 'tickets', label: 'Open support cases', value: '36', change: '9 need same-day action' },
  ],
  revenueAtRisk: '$12.4k across 9 accounts',
  supportBacklog: '14 unresolved finance and support tickets',
  accessRequests: [
    {
      id: 'access-1',
      requester: 'Amaka Obi',
      email: 'amaka@lagosfaculty.edu',
      requestedRole: 'Academic Administrator',
      company: 'Lagos Faculty of Law',
      requestedAt: '10 min ago',
      status: 'pending',
    },
    {
      id: 'access-2',
      requester: 'Tolu Benson',
      email: 'tolu@westbridgelegal.com',
      requestedRole: 'Tutor',
      company: 'Westbridge Legal',
      requestedAt: '42 min ago',
      status: 'needs_review',
    },
    {
      id: 'access-3',
      requester: 'Samuel Okafor',
      email: 'samuel@cobaltinstitute.org',
      requestedRole: 'Finance Officer',
      company: 'Cobalt Institute',
      requestedAt: '1 hour ago',
      status: 'pending',
    },
  ],
  reviewQueue: [
    {
      id: 'review-1',
      title: 'Civil Procedure CBT Mock Set 4',
      type: 'Exam content',
      owner: 'Nora Petrov',
      status: 'queued',
      updatedAt: 'Reviewed 18 min ago',
    },
    {
      id: 'review-2',
      title: 'Corporate Law handbook update',
      type: 'Library material',
      owner: 'Amara Duru, SAN',
      status: 'changes_requested',
      updatedAt: 'Needs update by today',
    },
    {
      id: 'review-3',
      title: 'Legal drafting crash course',
      type: 'Course launch',
      owner: 'Product Learning Team',
      status: 'queued',
      updatedAt: 'Scheduled for Thursday',
    },
  ],
  paymentIssues: [
    {
      id: 'payment-1',
      owner: 'Blackwell School of Law',
      amount: '$4,800',
      plan: 'Institution Annual',
      status: 'review',
      submittedAt: 'Invoice failed 2 hours ago',
    },
    {
      id: 'payment-2',
      owner: 'Axiom Legal Academy',
      amount: '$1,290',
      plan: 'Institution Upgrade',
      status: 'escalated',
      submittedAt: 'Chargeback raised this morning',
    },
    {
      id: 'payment-3',
      owner: 'Grace Eze',
      amount: '$59',
      plan: 'Advocate Monthly',
      status: 'review',
      submittedAt: 'Card retry due tonight',
    },
  ],
  moderationQueue: [
    {
      id: 'mod-1',
      subject: 'Question flagged for copied answer in Helar Connect',
      reporterSummary: '3 reports from students in the litigation channel',
      flags: 3,
      status: 'open',
    },
    {
      id: 'mod-2',
      subject: 'Comment thread needs faculty review',
      reporterSummary: 'Tutor requested a moderator decision',
      flags: 2,
      status: 'watch',
    },
    {
      id: 'mod-3',
      subject: 'Spam account cluster from a new institution',
      reporterSummary: 'Automated system blocked 5 linked signups',
      flags: 5,
      status: 'open',
    },
  ],
}

export async function fetchPricingPlans() {
  await pause(180)
  return pricingPlans
}

export async function fetchDashboardSnapshot() {
  await pause(220)
  return dashboardSnapshot
}

export async function fetchAdminDashboardSnapshot() {
  await pause(220)
  return adminDashboardSnapshot
}
