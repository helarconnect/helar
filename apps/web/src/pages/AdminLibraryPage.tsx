import { AdminLibraryWorkspace } from "@/components/admin/AdminLibraryWorkspace";
import { AdminLawReportReader } from "@/components/admin/AdminLawReportReader";
import { AdminSubjectSummaryCaseReader } from "@/components/admin/AdminSubjectSummaryCaseReader";
import { AdminSubjectSummaryWorkspace } from "@/components/admin/AdminSubjectSummaryWorkspace";
import { AdminSubjectSummaryModulePage } from "@/pages/SubjectSummaryModulePage";

export function AdminLawReportsPage() {
  return <AdminLibraryWorkspace section="law-reports" />;
}

export function AdminHelarpediaPage() {
  return <AdminLibraryWorkspace section="helarpedia" />;
}

export function AdminSubjectSummariesPage() {
  return <AdminSubjectSummaryWorkspace mode="overview" />;
}

export function AdminSubjectSummariesMaterialsPage() {
  return <AdminLibraryWorkspace section="subject-summaries" />;
}

export function AdminSubjectSummariesSubjectsPage() {
  return <AdminSubjectSummaryWorkspace mode="subjects" />;
}

export function AdminSubjectSummariesTopicsPage() {
  return <AdminSubjectSummaryWorkspace mode="topics" />;
}

export function AdminSubjectSummariesCasesPage() {
  return <AdminSubjectSummaryWorkspace mode="cases" />;
}

export function AdminCasesAndRatiosPage() {
  return <AdminSubjectSummaryModulePage />;
}

export function AdminCasesAndRatiosMaterialsPage() {
  return <AdminLibraryWorkspace section="cases-and-ratios" />;
}

export function AdminLawReportReaderPage() {
  return <AdminLawReportReader />;
}

export function AdminSubjectSummaryCaseReaderPage() {
  return <AdminSubjectSummaryCaseReader />;
}
