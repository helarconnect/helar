import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { RequireAdmin } from '@/components/routing/RequireAdmin'
import { RequireAuth } from '@/components/routing/RequireAuth'
import { RequireCbtAccess } from '@/components/routing/RequireCbtAccess'
import { RequirePaymentAccess } from '@/components/routing/RequirePaymentAccess'
import {
  AdminCasesAndRatiosPage,
  AdminCasesAndRatiosMaterialsPage,
  AdminLawReportsPage,
  AdminLawReportReaderPage,
  AdminSubjectSummariesCasesPage,
  AdminSubjectSummariesMaterialsPage,
  AdminSubjectSummariesPage,
  AdminSubjectSummariesSubjectsPage,
  AdminSubjectSummariesTopicsPage,
  AdminSubjectSummaryCaseReaderPage,
} from '@/pages/AdminLibraryPage'
import {
  AdminContentPage,
  AdminPaymentsPage,
  AdminSettingsPage,
  AdminUsersPage,
} from '@/pages/AdminOperationsPage'
import { AdminCbtPage, AdminQuestionBankPage } from '@/pages/AdminCbtPage'
import { StudentCbtPage } from '@/pages/StudentCbtPage'
import { AuthPlaceholderPage } from '@/pages/AuthPlaceholderPage'
import { HelarConnectPage } from '@/pages/HelarConnectPage'
import { ContactPage } from '@/pages/ContactPage'
import { LandingPage } from '@/pages/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PricingPage } from '@/pages/PricingPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { PasswordRecoveryPage } from '@/pages/PasswordRecoveryPage'
import { SubscriptionPage } from '@/pages/SubscriptionPage'
import { StudentSubjectSummaryModulePage } from '@/pages/SubjectSummaryModulePage'
import { WorkspaceDashboardPage } from '@/pages/WorkspaceDashboardPage'
import { WorkspacePlaceholderPage } from '@/pages/WorkspacePlaceholderPage'
import { StudentLawReportsPage, StudentSubjectSummariesPage } from '@/pages/StudentLibraryPage'
import { AdminBarFinalExamsMlsMcqPage, StudentBarFinalExamsMlsMcqPage } from '@/pages/BarFinalExamsMlsMcqPage'
import { StudentBarFinalExamQuestionPage } from '@/pages/BarFinalExamQuestionPage'
import {
  AdminBarFinalExamsMcqPage,
  StudentBarFinalExamMcqQuestionPage,
  StudentBarFinalExamsMcqPage,
} from '@/pages/BarFinalExamsMcqPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MarketingLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'connect', element: <HelarConnectPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'auth/sign-in', element: <AuthPlaceholderPage mode="sign-in" /> },
      { path: 'auth/sign-up', element: <AuthPlaceholderPage mode="sign-up" /> },
      { path: 'auth/forgot-password', element: <PasswordRecoveryPage mode="forgot-password" /> },
      { path: 'auth/reset-password', element: <PasswordRecoveryPage mode="reset-password" /> },
    ],
  },
  {
    path: '/app',
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate replace to="dashboard" /> },
          { path: 'dashboard', element: <WorkspaceDashboardPage /> },
          { path: 'profile', element: <ProfilePage /> },
          {
            path: 'courses',
            element: <Navigate replace to="/app/dashboard" />,
          },
          {
            path: 'library',
            element: (
              <WorkspacePlaceholderPage
                title="Library"
                description="Legal books, case law, statutes, and reader annotations can layer onto this starter."
              />
            ),
          },
          {
            path: 'library/law-reports',
            element: <StudentLawReportsPage />,
          },
          {
            path: 'library/subject-summaries',
            element: <StudentSubjectSummariesPage />,
          },
          {
            path: 'library/cases-and-ratios',
            element: <StudentSubjectSummaryModulePage />,
          },
          {
            path: 'bar-final-exams-mls-mcq',
            element: <Navigate replace to="/app/bar-final-exams-nls-mcq" />,
          },
          {
            path: 'bar-final-exams-nls-mcq',
            element: <StudentBarFinalExamsMlsMcqPage />,
          },
          {
            path: 'bar-final-exams-mcq',
            element: <StudentBarFinalExamsMcqPage />,
          },
          {
            path: 'bar-final-exams-nls-mcq/:subjectId/questions/:questionId',
            element: <StudentBarFinalExamQuestionPage />,
          },
          {
            path: 'bar-final-exams-mcq/:subjectId/questions/:questionId',
            element: <StudentBarFinalExamMcqQuestionPage />,
          },
          { path: 'library/law-reports/:materialId', element: <AdminLawReportReaderPage /> },
          { path: 'library/subject-summaries/cases/:caseId', element: <AdminSubjectSummaryCaseReaderPage /> },
          {
            path: 'cbt',
            element: (
              <RequireCbtAccess>
                <StudentCbtPage />
              </RequireCbtAccess>
            ),
          },
          {
            path: 'cbt/:cbtId',
            element: (
              <RequireCbtAccess>
                <StudentCbtPage />
              </RequireCbtAccess>
            ),
          },
          {
            path: 'cbt/attempts/:attemptId',
            element: (
              <RequireCbtAccess>
                <StudentCbtPage />
              </RequireCbtAccess>
            ),
          },
          {
            path: 'assignments',
            element: <Navigate replace to="/app/dashboard" />,
          },
          {
            path: 'subscription',
            element: <SubscriptionPage />,
          },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              { index: true, element: <Navigate replace to="users" /> },
              { path: 'users', element: <AdminUsersPage /> },
              { path: 'cbt', element: <AdminCbtPage /> },
              { path: 'cbt/question-bank', element: <AdminQuestionBankPage /> },
              { path: 'library/law-reports', element: <AdminLawReportsPage /> },
              { path: 'library/law-reports/:materialId', element: <AdminLawReportReaderPage /> },
              { path: 'library/subject-summaries', element: <AdminSubjectSummariesPage /> },
              { path: 'library/subject-summaries/materials', element: <AdminSubjectSummariesMaterialsPage /> },
              { path: 'library/subject-summaries/subjects', element: <AdminSubjectSummariesSubjectsPage /> },
              { path: 'library/subject-summaries/topics', element: <AdminSubjectSummariesTopicsPage /> },
              { path: 'library/subject-summaries/cases', element: <AdminSubjectSummariesCasesPage /> },
              { path: 'library/subject-summaries/cases/:caseId', element: <AdminSubjectSummaryCaseReaderPage /> },
              { path: 'library/cases-and-ratios', element: <AdminCasesAndRatiosPage /> },
              { path: 'library/cases-and-ratios/materials', element: <AdminCasesAndRatiosMaterialsPage /> },
              { path: 'bar-final-exams-mls-mcq', element: <Navigate replace to="/app/admin/bar-final-exams-nls-mcq" /> },
              { path: 'bar-final-exams-nls-mcq', element: <AdminBarFinalExamsMlsMcqPage /> },
              {
                path: 'bar-final-exams-mcq',
                element: <AdminBarFinalExamsMcqPage />,
              },
              { path: 'content', element: <AdminContentPage /> },
              {
                path: 'payments',
                element: (
                  <RequirePaymentAccess>
                    <AdminPaymentsPage />
                  </RequirePaymentAccess>
                ),
              },
              { path: 'settings', element: <AdminSettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
