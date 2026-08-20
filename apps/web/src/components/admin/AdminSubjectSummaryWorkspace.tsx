import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Eye,
  FilePlus2,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  autocompleteSubjectSummaries,
  bulkUpdateSubjectSummaryCases,
  bulkUpdateSubjectSummarySubjects,
  bulkUpdateSubjectSummaryTopics,
  createSubjectSummaryCase,
  createSubjectSummarySubject,
  createSubjectSummaryTopic,
  deleteSubjectSummaryCase,
  deleteSubjectSummarySubject,
  deleteSubjectSummaryTopic,
  fetchSubjectSummaryCaseDetail,
  fetchSubjectSummaryCases,
  fetchSubjectSummaryHierarchy,
  fetchSubjectSummaryHierarchyCases,
  fetchSubjectSummaryHierarchyTopics,
  fetchSubjectSummaryReadingInsights,
  fetchSubjectSummarySubjects,
  fetchSubjectSummaryTopics,
  type SubjectSummaryCase,
  type SubjectSummaryCaseFilters,
  type SubjectSummaryCaseType,
  type SubjectSummaryCaseInput,
  type SubjectSummaryCaseStatus,
  type SubjectSummaryReadingInsight,
  type SubjectSummaryStatus,
  type SubjectSummarySubject,
  type SubjectSummarySubjectFilters,
  type SubjectSummarySubjectInput,
  type SubjectSummaryTopic,
  type SubjectSummaryTopicFilters,
  type SubjectSummaryTopicInput,
  updateSubjectSummaryCase,
  updateSubjectSummarySubject,
  updateSubjectSummaryTopic
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type ViewMode = "overview" | "subjects" | "topics" | "cases";
type ToastTone = "error" | "success";

const defaultSubjectFilters: Required<SubjectSummarySubjectFilters> = {
  page: 1,
  pageSize: 10,
  search: "",
  sortBy: "displayOrder",
  sortOrder: "asc",
  status: "all"
};

const defaultTopicFilters: Required<SubjectSummaryTopicFilters> = {
  page: 1,
  pageSize: 10,
  search: "",
  sortBy: "displayOrder",
  sortOrder: "asc",
  status: "all",
  subjectId: ""
};

const defaultCaseFilters: Required<SubjectSummaryCaseFilters> = {
  caseType: "all",
  page: 1,
  pageSize: 10,
  search: "",
  sortBy: "updatedAt",
  sortOrder: "desc",
  status: "all",
  subjectId: "",
  topicId: ""
};

const nigeriaCourtOptions = [
  "Supreme Court",
  "Court of Appeal",
  "Federal High Court",
  "National Industrial Court",
  "High Court of the Federal Capital Territory",
  "State High Court",
  "Sharia Court of Appeal",
  "Customary Court of Appeal",
  "Magistrate Court",
  "District Court",
  "Area Court",
  "Customary Court",
  "Election Petition Tribunal",
  "Code of Conduct Tribunal",
  "Investment and Securities Tribunal",
  "Tax Appeal Tribunal",
  "Coroner's Court"
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function prettifyStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function parseStringList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toMultilineValue(values: string[]) {
  return values.join("\n");
}

function createSubjectDraft(): SubjectSummarySubjectInput {
  return {
    description: "",
    displayOrder: 0,
    name: "",
    status: "ACTIVE"
  };
}

function createTopicDraft(subjectId = ""): SubjectSummaryTopicInput {
  return {
    description: "",
    displayOrder: 0,
    name: "",
    status: "ACTIVE",
    subjectId
  };
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function createCaseDraft(subjectId = "", topicId = ""): SubjectSummaryCaseInput {
  return {
    attachments: [],
    caseSummary: "",
    citation: "",
    court: "",
    decisionHolding: "",
    externalReferences: [],
    facts: "",
    issues: "",
    judges: [],
    jurisdiction: "Handbook",
    keywords: [],
    legalPrinciples: [],
    obiterDicta: "",
    ratioDecidendi: "",
    relatedCases: [],
    relatedStatutes: [],
    status: "DRAFT",
    subjectId,
    title: "",
    topicId,
    year: null
  };
}

function normalizeCaseTypeLabel(value: string | null | undefined): "Handbook" | "Textbook" {
  return value?.trim().toLowerCase() === "textbook" || value?.trim().toLowerCase() === "textbooks"
    ? "Textbook"
    : "Handbook";
}

function matchesSelectedCaseType(value: string | null | undefined, caseType: "all" | SubjectSummaryCaseType) {
  if (caseType === "all") {
    return true;
  }

  return normalizeCaseTypeLabel(value) === (caseType === "HANDBOOK" ? "Handbook" : "Textbook");
}

function countHierarchyCases(items: Array<{ caseCount: number }> | undefined) {
  return (items ?? []).reduce((sum, item) => sum + item.caseCount, 0);
}

function ToastViewport({
  isDark,
  onDismiss,
  toasts
}: {
  isDark: boolean;
  onDismiss: (id: number) => void;
  toasts: Array<{ id: number; message: string; tone: ToastTone }>;
}) {
  if (!toasts.length || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed right-6 top-6 z-[130] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          className={cn(
            "pointer-events-auto rounded-[22px] border px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]",
            toast.tone === "success"
              ? isDark
                ? "border-emerald-500/30 bg-slate-950/95 text-emerald-100"
                : "border-emerald-200 bg-white text-emerald-800"
              : isDark
                ? "border-rose-500/30 bg-slate-950/95 text-rose-100"
                : "border-rose-200 bg-white text-rose-800"
          )}
          key={toast.id}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-6">{toast.message}</p>
            <button
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"
              )}
              onClick={() => onDismiss(toast.id)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}

function Panel({
  children,
  className,
  isDark
}: {
  children: ReactNode;
  className?: string;
  isDark: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
        isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white",
        className
      )}
    >
      {children}
    </section>
  );
}

function ReadingInsightsSection({
  actions,
  insights,
  isDark,
  overviewStats,
  totalReads
}: {
  actions: ReactNode;
  insights: SubjectSummaryReadingInsight[];
  isDark: boolean;
  overviewStats: {
    handbookCaseCount: number;
    textbookCaseCount: number;
    totalCases: number;
    totalSubjects: number;
    totalTopics: number;
  };
  totalReads: number;
}) {
  const orderedInsights = [
    {
      colorClass: "bg-[linear-gradient(90deg,#8b5cf6_0%,#d946ef_100%)]",
      insight: insights.find((item) => item.kind === "subject"),
      title: "Most read subject"
    },
    {
      colorClass: "bg-[linear-gradient(90deg,#2563eb_0%,#06b6d4_100%)]",
      insight: insights.find((item) => item.kind === "topic"),
      title: "Most read topic"
    },
    {
      colorClass: "bg-[linear-gradient(90deg,#f97316_0%,#facc15_100%)]",
      insight: insights.find((item) => item.kind === "case"),
      title: "Most read case"
    }
  ];
  const maxReads = Math.max(...orderedInsights.map((item) => item.insight?.reads ?? 0), 1);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:p-7",
        isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <BarChart3 className={cn("h-4 w-4", isDark ? "text-slate-300" : "text-slate-600")} />
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Reading insights</p>
          </div>
          <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
            See which subjects, topics, and cases are drawing attention.
          </h2>
          <p className={cn("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
            This chart shows the most read subject, topic, and case based on recorded views across the cases and ratios workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">{actions}</div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div
          className={cn(
            "rounded-[26px] border p-5",
            isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-slate-50"
          )}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className={cn("h-4 w-4", isDark ? "text-slate-300" : "text-slate-600")} />
            <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>Most read items</p>
          </div>

          <div className="mt-5 space-y-4">
            {orderedInsights.map((item) => {
              const reads = item.insight?.reads ?? 0;
              const label = item.insight?.label ?? `No ${item.title.toLowerCase().replace("most read ", "")} reads yet`;

              return (
                <div className="grid gap-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]" key={item.title}>
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-medium", isDark ? "text-white" : "text-slate-950")} title={label}>
                        {label}
                    </p>
                    <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.title}</p>
                  </div>
                  <div className="flex items-center">
                    <div className={cn("h-3 w-full overflow-hidden rounded-full", isDark ? "bg-slate-800" : "bg-slate-200")}>
                      <div
                        className={cn("h-full rounded-full", item.colorClass)}
                        style={{ width: `${Math.max((reads / maxReads) * 100, reads > 0 ? 10 : 0)}%` }}
                      />
                    </div>
                  </div>
                  <div className={cn("flex items-center justify-end text-sm md:min-w-[100px]", isDark ? "text-slate-300" : "text-slate-700")}>
                    <span>{reads} reads</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4">
          {[
            { icon: Eye, label: "Total reads", value: String(totalReads) },
            { icon: FolderPlus, label: "Subjects", value: String(overviewStats.totalSubjects) },
            { icon: Plus, label: "Topics", value: String(overviewStats.totalTopics) },
          { icon: FilePlus2, label: "Cases", value: String(overviewStats.totalCases) },
          { icon: FilePlus2, label: "Handbook Cases", value: String(overviewStats.handbookCaseCount) },
          { icon: FilePlus2, label: "Textbook Cases", value: String(overviewStats.textbookCaseCount) }
          ].map((item) => (
            <article
              className={cn(
                "rounded-[26px] border p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]",
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
              )}
              key={item.label}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
                    isDark ? "bg-slate-800 text-slate-200" : "bg-white text-slate-700 shadow-sm"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                  <p className={cn("mt-2 text-2xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReadingInsightsSectionState({
  actions,
  isDark,
  message
}: {
  actions: ReactNode;
  isDark: boolean;
  message: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:p-7",
        isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <BarChart3 className={cn("h-4 w-4", isDark ? "text-slate-300" : "text-slate-600")} />
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Reading insights</p>
          </div>
          <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
            See which subjects, topics, and cases are drawing attention.
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">{actions}</div>
      </div>
      <div
        className={cn(
          "mt-6 rounded-[22px] border border-dashed px-4 py-8 text-sm",
          isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"
        )}
      >
        {message}
      </div>
    </section>
  );
}

function IconButton({
  children,
  isDark,
  onClick,
  title
}: {
  children: ReactNode;
  isDark: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition",
        isDark
          ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800"
          : "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50"
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function HeaderActionButton({
  children,
  isDark,
  onClick,
  tone = "secondary"
}: {
  children: ReactNode;
  isDark: boolean;
  onClick?: () => void;
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
        tone === "primary"
          ? "border-transparent bg-[linear-gradient(135deg,#ff6d4d_0%,#f97316_100%)] text-white shadow-[0_18px_40px_rgba(249,115,22,0.28)] hover:brightness-105"
          : isDark
            ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800"
            : "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function StatusBadge({ isDark, value }: { isDark: boolean; value: string }) {
  const tone =
    value === "ACTIVE" || value === "PUBLISHED"
      ? isDark
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "PENDING_APPROVAL"
        ? isDark
          ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-700"
      : value === "ARCHIVED"
        ? isDark
          ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-700"
        : isDark
          ? "border-slate-700 bg-slate-800 text-slate-200"
          : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", tone)}>{prettifyStatus(value)}</span>;
}

function EmptyState({
  action,
  isDark,
  message
}: {
  action?: ReactNode;
  isDark: boolean;
  message: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border px-6 py-10 text-center",
        isDark ? "border-slate-800 bg-slate-900/70 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      <p className="text-sm leading-7">{message}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

function Pagination({
  isDark,
  onPageChange,
  page,
  totalPages
}: {
  isDark: boolean;
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button className="button-secondary !px-4 !py-2.5" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">
          Previous
        </button>
        <button className="button-secondary !px-4 !py-2.5" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">
          Next
        </button>
      </div>
    </div>
  );
}

function SubjectModal({
  draft,
  isDark,
  isOpen,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  title
}: {
  draft: SubjectSummarySubjectInput;
  isDark: boolean;
  isOpen: boolean;
  isSaving: boolean;
  onChange: (field: keyof SubjectSummarySubjectInput, value: string | number) => void;
  onClose: () => void;
  onSubmit: () => void;
  title: string;
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn("w-full max-w-2xl overflow-hidden rounded-[32px] border", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn("flex items-start justify-between border-b px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <div>
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Subject</p>
            <h2 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>{title}</h2>
          </div>
          <IconButton isDark={isDark} onClick={onClose} title="Close modal">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject Name</span>
            <input
              className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="Constitutional Law"
              value={draft.name}
            />
          </label>
          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Status</span>
            <select
              className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("status", event.target.value)}
              value={draft.status}
            >
              {["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => (
                <option key={value} value={value}>
                  {prettifyStatus(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Description</span>
            <textarea
              className={cn("min-h-[140px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("description", event.target.value)}
              placeholder="Explain what this subject covers."
              value={draft.description}
            />
          </label>
        </div>
        <div className={cn("flex items-center justify-end gap-3 border-t px-6 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          <button className="button-secondary !px-4 !py-3" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button-primary !px-5 !py-3" disabled={isSaving} onClick={onSubmit} type="button">
            {isSaving ? "Saving..." : "Save subject"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TopicModal({
  draft,
  isDark,
  isOpen,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  subjects,
  subjectsLoading,
  title
}: {
  draft: SubjectSummaryTopicInput;
  isDark: boolean;
  isOpen: boolean;
  isSaving: boolean;
  onChange: (field: keyof SubjectSummaryTopicInput, value: string | number) => void;
  onClose: () => void;
  onSubmit: () => void;
  subjects: Array<{ id: string; name: string }>;
  subjectsLoading: boolean;
  title: string;
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn("w-full max-w-3xl overflow-hidden rounded-[32px] border", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn("flex items-start justify-between border-b px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <div>
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Topic</p>
            <h2 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>{title}</h2>
          </div>
          <IconButton isDark={isDark} onClick={onClose} title="Close modal">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
            <select
              className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              disabled={subjectsLoading}
              onChange={(event) => onChange("subjectId", event.target.value)}
              value={draft.subjectId}
            >
              <option value="">
                {subjectsLoading ? "Loading subjects..." : subjects.length ? "Select subject" : "No subjects added yet"}
              </option>
              {!subjectsLoading
                ? subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))
                : null}
            </select>
          </label>
          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Status</span>
            <select
              className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("status", event.target.value)}
              value={draft.status}
            >
              {["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => (
                <option key={value} value={value}>
                  {prettifyStatus(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Topic Name</span>
            <input
              className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="Fundamental Human Rights"
              value={draft.name}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Short Description</span>
            <textarea
              className={cn("min-h-[140px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("description", event.target.value)}
              placeholder="Describe the focus of this topic."
              value={draft.description}
            />
          </label>
        </div>
        <div className={cn("flex items-center justify-end gap-3 border-t px-6 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          <button className="button-secondary !px-4 !py-3" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button-primary !px-5 !py-3" disabled={isSaving} onClick={onSubmit} type="button">
            {isSaving ? "Saving..." : "Save topic"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ArrayField({
  isDark,
  label,
  onChange,
  placeholder,
  value
}: {
  isDark: boolean;
  label: string;
  onChange: (value: string[]) => void;
  placeholder: string;
  value: string[];
}) {
  return (
    <label className="space-y-2">
      <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>{label}</span>
      <textarea
        className={cn("min-h-[120px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
        onChange={(event) => onChange(parseStringList(event.target.value))}
        placeholder={placeholder}
        value={toMultilineValue(value)}
      />
    </label>
  );
}

function CaseModal({
  draft,
  isDark,
  isOpen,
  isSaving,
  lockSubjectTopic,
  lockedSubjectName,
  lockedTopicName,
  onChange,
  onClose,
  onSubmit,
  subjects,
  title,
  topics
}: {
  draft: SubjectSummaryCaseInput;
  isDark: boolean;
  isOpen: boolean;
  isSaving: boolean;
  lockSubjectTopic: boolean;
  lockedSubjectName?: string;
  lockedTopicName?: string;
  onChange: (field: keyof SubjectSummaryCaseInput, value: string | number | null | string[]) => void;
  onClose: () => void;
  onSubmit: () => void;
  subjects: Array<{ id: string; name: string }>;
  title: string;
  topics: Array<{ id: string; name: string; subjectId: string }>;
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const availableTopics = draft.subjectId ? topics.filter((topic) => topic.subjectId === draft.subjectId) : topics;
  const caseTypeOptions = ["Handbook", "Textbook"] as const;
  const hasCustomCaseType = Boolean(draft.jurisdiction) && !caseTypeOptions.includes(draft.jurisdiction as (typeof caseTypeOptions)[number]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn("grid h-[86vh] w-full max-w-6xl grid-rows-[auto,1fr,auto] overflow-hidden rounded-[32px] border", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn("flex items-start justify-between border-b px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <div>
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Case</p>
            <h2 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>{title}</h2>
          </div>
          <IconButton isDark={isDark} onClick={onClose} title="Close modal">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 md:col-span-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Case Title</span>
              <input
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("title", event.target.value)}
                placeholder="Case title"
                value={draft.title}
              />
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
              {lockSubjectTopic ? (
                <div className={cn("rounded-2xl border px-4 py-3 text-sm", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}>
                  {lockedSubjectName || subjects.find((subject) => subject.id === draft.subjectId)?.name || "Selected subject"}
                </div>
              ) : (
                <select
                  className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                  onChange={(event) => onChange("subjectId", event.target.value)}
                  value={draft.subjectId}
                >
                  <option value="">Select subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Topic</span>
              {lockSubjectTopic ? (
                <div className={cn("rounded-2xl border px-4 py-3 text-sm", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}>
                  {lockedTopicName || availableTopics.find((topic) => topic.id === draft.topicId)?.name || "Selected topic"}
                </div>
              ) : (
                <select
                  className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                  onChange={(event) => onChange("topicId", event.target.value)}
                  value={draft.topicId}
                >
                  <option value="">Select topic</option>
                  {availableTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {lockSubjectTopic ? (
              <div className={cn("rounded-[18px] border px-4 py-3 text-sm md:col-span-2", isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
                This case will be added to the selected subject and topic from the Subject Summary tree.
              </div>
            ) : null}
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Citation</span>
              <input
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("citation", event.target.value)}
                value={draft.citation}
              />
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Court</span>
              <select
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("court", event.target.value)}
                value={draft.court}
              >
                <option value="">Select court</option>
                {nigeriaCourtOptions.map((court) => (
                  <option key={court} value={court}>
                    {court}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Year</span>
              <input
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("year", event.target.value ? Number(event.target.value) : null)}
                type="number"
                value={draft.year ?? ""}
              />
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Type of cases and ratios</span>
              <select
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("jurisdiction", event.target.value)}
                value={draft.jurisdiction}
              >
                <option value="">Select type</option>
                {hasCustomCaseType ? (
                  <option value={draft.jurisdiction}>{draft.jurisdiction}</option>
                ) : null}
                {caseTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Status</span>
              <select
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("status", event.target.value)}
                value={draft.status}
              >
                {["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"].map((value) => (
                  <option key={value} value={value}>
                    {prettifyStatus(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {[
              ["caseSummary", "Ratio Summary", "Write the ratio summary."],
              ["facts", "Facts", "Outline the facts."],
              ["issues", "Issues", "List the legal issues."],
              ["decisionHolding", "Decision / Holding", "State the holding."],
              ["ratioDecidendi", "Ratio Decidendi", "Capture the ratio decidendi."],
              ["obiterDicta", "Obiter Dicta", "Capture any obiter dicta."]
            ].map(([field, label, placeholder]) => (
              <label className="space-y-2" key={field}>
                <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>{label}</span>
                <textarea
                  className={cn("min-h-[150px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                  onChange={(event) => onChange(field as keyof SubjectSummaryCaseInput, event.target.value)}
                  placeholder={placeholder}
                  value={draft[field as keyof SubjectSummaryCaseInput] as string}
                />
              </label>
            ))}
            <ArrayField isDark={isDark} label="Judges" onChange={(value) => onChange("judges", value)} placeholder="One judge per line" value={draft.judges} />
            <ArrayField isDark={isDark} label="Legal Principles" onChange={(value) => onChange("legalPrinciples", value)} placeholder="One principle per line" value={draft.legalPrinciples} />
            <ArrayField isDark={isDark} label="Related Statutes" onChange={(value) => onChange("relatedStatutes", value)} placeholder="One statute per line" value={draft.relatedStatutes} />
            <ArrayField isDark={isDark} label="Related Cases" onChange={(value) => onChange("relatedCases", value)} placeholder="One case per line" value={draft.relatedCases} />
            <ArrayField isDark={isDark} label="Keywords / Tags" onChange={(value) => onChange("keywords", value)} placeholder="One keyword per line" value={draft.keywords} />
            <ArrayField isDark={isDark} label="Attachments" onChange={(value) => onChange("attachments", value)} placeholder="One attachment URL per line" value={draft.attachments} />
            <ArrayField isDark={isDark} label="External References" onChange={(value) => onChange("externalReferences", value)} placeholder="One external reference URL per line" value={draft.externalReferences} />
          </div>
        </div>
        <div className={cn("flex items-center justify-end gap-3 border-t px-6 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          <button className="button-secondary !px-4 !py-3" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button-primary !px-5 !py-3" disabled={isSaving} onClick={onSubmit} type="button">
            {isSaving ? "Saving..." : "Save case"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

type HierarchyTopicSelection = {
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
};

function HierarchyTopicItem({
  caseType,
  isDark,
  onAddCase,
  onDeleteCase,
  onDeleteTopic,
  onEditCase,
  onEditTopic,
  onSelectTopic,
  selectedTopicId,
  topic
}: {
  caseType: "all" | SubjectSummaryCaseType;
  isDark: boolean;
  onAddCase: (selection: HierarchyTopicSelection) => void;
  onDeleteCase: (caseId: string) => void;
  onDeleteTopic: (topic: SubjectSummaryTopic) => void;
  onEditCase: (caseId: string) => void;
  onEditTopic: (topic: SubjectSummaryTopic) => void;
  onSelectTopic: (selection: HierarchyTopicSelection) => void;
  selectedTopicId: string | null;
  topic: SubjectSummaryTopic & { hasCases: boolean };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSelected = selectedTopicId === topic.id;
  const casesQuery = useQuery({
    enabled: isExpanded,
    queryFn: () => fetchSubjectSummaryHierarchyCases(topic.id, { caseType }),
    queryKey: queryKeys.subjectSummaryHierarchyCases(topic.id, { caseType })
  });
  const visibleCases = (casesQuery.data?.items ?? []).filter((item) => matchesSelectedCaseType(item.jurisdiction, caseType));
  const selection = {
    subjectId: topic.subjectId,
    subjectName: topic.subject.name,
    topicId: topic.id,
    topicName: topic.name
  };

  return (
    <div
      className={cn(
        "rounded-[22px] border transition",
        isSelected
          ? isDark
            ? "border-orange-400/60 bg-slate-900"
            : "border-orange-300 bg-orange-50/60"
          : isDark
            ? "border-slate-800 bg-slate-900/80"
            : "border-slate-200 bg-white"
      )}
    >
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => {
          onSelectTopic(selection);
          setIsExpanded((current) => !current);
        }}
        type="button"
      >
        <div>
          <div className="flex items-center gap-3">
            {topic.hasCases ? (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
            <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{topic.name}</p>
          </div>
          <p className={cn("mt-2 pl-7 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{topic.description || "No description added yet."}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge isDark={isDark} value={topic.status} />
          <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{topic.caseCount} cases</span>
          <div className="flex items-center gap-2">
            <IconButton
              isDark={isDark}
              onClick={(event) => {
                event.stopPropagation();
                onEditTopic(topic);
              }}
              title="Edit topic"
            >
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              isDark={isDark}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteTopic(topic);
              }}
              title="Delete topic"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </button>
      {isExpanded ? (
        <div className={cn("border-t px-4 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          {isSelected ? (
            <div className={cn("mb-4 flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
              <div>
                <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>Selected topic</p>
                <p className={cn("mt-1 text-sm", isDark ? "text-slate-300" : "text-slate-700")}>
                  {topic.subject.name} / {topic.name}
                </p>
              </div>
              <button className="button-primary !px-4 !py-3" onClick={() => onAddCase(selection)} type="button">
                <FilePlus2 className="h-4 w-4" />
                Add case
              </button>
            </div>
          ) : null}
          {casesQuery.isLoading ? (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading cases...</p>
          ) : visibleCases.length ? (
            <div className="space-y-3">
              {visibleCases.map((item) => (
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3",
                    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
                  )}
                  key={item.id}
                >
                  <Link
                    className={cn(
                      "flex-1 rounded-[16px] pr-3 transition",
                      isDark ? "hover:text-white" : "hover:text-slate-950"
                    )}
                    to={`/app/admin/library/subject-summaries/cases/${item.id}${caseType === "all" ? "" : `?caseType=${caseType}`}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                        <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                          {item.citation || item.court || "No citation yet."}
                        </p>
                      </div>
                      <StatusBadge isDark={isDark} value={item.status} />
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <IconButton
                      isDark={isDark}
                      onClick={() => onEditCase(item.id)}
                      title="Edit case"
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      isDark={isDark}
                      onClick={() => onDeleteCase(item.id)}
                      title="Delete case"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>No cases match this topic yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function HierarchySubjectItem({
  caseType,
  isDark,
  onAddCase,
  onAddTopic,
  onDeleteSubject,
  onDeleteTopic,
  onEditSubject,
  onEditTopic,
  onEditCase,
  onDeleteCase,
  onSelectTopic,
  selectedTopicId,
  subject
}: {
  caseType: "all" | SubjectSummaryCaseType;
  isDark: boolean;
  onAddCase: (selection: HierarchyTopicSelection) => void;
  onAddTopic: (subject: SubjectSummarySubject) => void;
  onDeleteSubject: (subjectId: string) => void;
  onDeleteTopic: (topic: SubjectSummaryTopic) => void;
  onEditSubject: (subject: SubjectSummarySubject) => void;
  onEditTopic: (topic: SubjectSummaryTopic) => void;
  onEditCase: (caseId: string) => void;
  onDeleteCase: (caseId: string) => void;
  onSelectTopic: (selection: HierarchyTopicSelection) => void;
  selectedTopicId: string | null;
  subject: SubjectSummarySubject & { hasTopics: boolean };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const topicsQuery = useQuery({
    enabled: isExpanded,
    queryFn: () => fetchSubjectSummaryHierarchyTopics(subject.id, { caseType }),
    queryKey: queryKeys.subjectSummaryHierarchyTopics(subject.id, { caseType })
  });

  return (
    <div className={cn("rounded-[26px] border", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left" onClick={() => setIsExpanded((current) => !current)} type="button">
        <div>
          <div className="flex items-center gap-3">
            {subject.hasTopics ? (isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />) : <span className="w-5" />}
            <div>
              <p className={cn("font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>{subject.name}</p>
              <p className={cn("mt-2 text-sm leading-6", isDark ? "text-slate-400" : "text-slate-600")}>{subject.description || "No subject description yet."}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <StatusBadge isDark={isDark} value={subject.status} />
          <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{subject.topicCount} topics</span>
          <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{subject.caseCount} cases</span>
          <div className="flex items-center gap-2">
            <IconButton
              isDark={isDark}
              onClick={(event) => {
                event.stopPropagation();
                onAddTopic(subject);
              }}
              title="Add topic"
            >
              <Plus className="h-4 w-4" />
            </IconButton>
            <IconButton
              isDark={isDark}
              onClick={(event) => {
                event.stopPropagation();
                onEditSubject(subject);
              }}
              title="Edit subject"
            >
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              isDark={isDark}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteSubject(subject.id);
              }}
              title="Delete subject"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </button>
      {isExpanded ? (
        <div className={cn("space-y-3 border-t px-5 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          {topicsQuery.isLoading ? (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading topics...</p>
          ) : topicsQuery.data?.items.length ? (
            topicsQuery.data.items.map((topic) => (
              <HierarchyTopicItem
                caseType={caseType}
                isDark={isDark}
                key={topic.id}
                onAddCase={onAddCase}
                onDeleteCase={onDeleteCase}
                onDeleteTopic={onDeleteTopic}
                onEditCase={onEditCase}
                onEditTopic={onEditTopic}
                onSelectTopic={onSelectTopic}
                selectedTopicId={selectedTopicId}
                topic={topic}
              />
            ))
          ) : (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>No topics match this subject yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AdminSubjectSummaryWorkspace({ mode }: { mode: ViewMode }) {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCaseType = searchParams.get("caseType") === "HANDBOOK"
    ? "HANDBOOK"
    : searchParams.get("caseType") === "TEXTBOOK"
      ? "TEXTBOOK"
      : "all";
  const incomingSearch = searchParams.get("search") ?? "";
  const incomingSubjectId = searchParams.get("subjectId") ?? "";
  const incomingTopicId = searchParams.get("topicId") ?? "";
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [subjectFilters, setSubjectFilters] = useState(defaultSubjectFilters);
  const [topicFilters, setTopicFilters] = useState({
    ...defaultTopicFilters,
    search: incomingSearch,
    subjectId: incomingSubjectId
  });
  const [caseFilters, setCaseFilters] = useState<Required<SubjectSummaryCaseFilters>>({
    ...defaultCaseFilters,
    caseType: selectedCaseType,
    search: incomingSearch,
    subjectId: incomingSubjectId,
    topicId: incomingTopicId
  });
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [isCaseSelectionLocked, setIsCaseSelectionLocked] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectSummarySubject | null>(null);
  const [editingTopic, setEditingTopic] = useState<SubjectSummaryTopic | null>(null);
  const [editingCase, setEditingCase] = useState<SubjectSummaryCase | null>(null);
  const [selectedHierarchyTopic, setSelectedHierarchyTopic] = useState<HierarchyTopicSelection | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<SubjectSummarySubjectInput>(createSubjectDraft());
  const [topicDraft, setTopicDraft] = useState<SubjectSummaryTopicInput>(createTopicDraft(searchParams.get("subjectId") ?? ""));
  const [caseDraft, setCaseDraft] = useState<SubjectSummaryCaseInput>(createCaseDraft(searchParams.get("subjectId") ?? "", searchParams.get("topicId") ?? ""));
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([]);

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(message: string, tone: ToastTone) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }

  async function openCaseModalById(caseId: string) {
    try {
      const item = await fetchSubjectSummaryCaseDetail(caseId);
      openCaseModal(item);
    } catch {
      showToast("Could not load this case for editing.", "error");
    }
  }

  async function invalidateSubjectSummaryQueries() {
    await queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0]).startsWith("subject-summary")
    });
  }

  const hierarchyQuery = useQuery({
    queryFn: () => fetchSubjectSummaryHierarchy({ caseType: selectedCaseType }),
    queryKey: queryKeys.subjectSummaryHierarchy({ caseType: selectedCaseType })
  });
  const handbookHierarchyQuery = useQuery({
    queryFn: () => fetchSubjectSummaryHierarchy({ caseType: "HANDBOOK" }),
    queryKey: queryKeys.subjectSummaryHierarchy({ caseType: "HANDBOOK" })
  });
  const textbookHierarchyQuery = useQuery({
    queryFn: () => fetchSubjectSummaryHierarchy({ caseType: "TEXTBOOK" }),
    queryKey: queryKeys.subjectSummaryHierarchy({ caseType: "TEXTBOOK" })
  });

  const readingInsightsQuery = useQuery({
    queryFn: fetchSubjectSummaryReadingInsights,
    queryKey: queryKeys.subjectSummaryReadingInsights
  });

  const subjectsQuery = useQuery({
    enabled: mode === "subjects" || mode === "topics" || mode === "cases",
    queryFn: () => fetchSubjectSummarySubjects({ ...subjectFilters, pageSize: 200 }),
    queryKey: queryKeys.subjectSummarySubjects({ ...subjectFilters, pageSize: 200 })
  });

  const subjectReferenceFilters = useMemo<Required<SubjectSummarySubjectFilters>>(
    () => ({
      page: 1,
      pageSize: 200,
      search: "",
      sortBy: "name",
      sortOrder: "asc",
      status: "all"
    }),
    []
  );

  const topicReferenceFilters = useMemo<Required<SubjectSummaryTopicFilters>>(
    () => ({
      page: 1,
      pageSize: 200,
      search: "",
      sortBy: "displayOrder",
      sortOrder: "asc",
      status: "all",
      subjectId: caseDraft.subjectId || selectedHierarchyTopic?.subjectId || topicDraft.subjectId || ""
    }),
    [caseDraft.subjectId, selectedHierarchyTopic?.subjectId, topicDraft.subjectId]
  );

  const subjectReferenceQuery = useQuery({
    enabled: true,
    queryFn: () => fetchSubjectSummarySubjects(subjectReferenceFilters),
    queryKey: queryKeys.subjectSummarySubjects(subjectReferenceFilters)
  });

  const topicReferenceQuery = useQuery({
    enabled: caseModalOpen || mode === "cases",
    queryFn: () => fetchSubjectSummaryTopics(topicReferenceFilters),
    queryKey: queryKeys.subjectSummaryTopics(topicReferenceFilters)
  });

  const topicsQuery = useQuery({
    enabled: mode === "topics" || mode === "cases",
    queryFn: () => fetchSubjectSummaryTopics({ ...topicFilters, pageSize: mode === "cases" ? 200 : topicFilters.pageSize }),
    queryKey: queryKeys.subjectSummaryTopics({ ...topicFilters, pageSize: mode === "cases" ? 200 : topicFilters.pageSize })
  });

  const casesQuery = useQuery({
    enabled: mode === "cases",
    queryFn: () => fetchSubjectSummaryCases(caseFilters),
    queryKey: queryKeys.subjectSummaryCases(caseFilters)
  });
  const visibleCaseRows = (casesQuery.data?.items ?? []).filter((item) => matchesSelectedCaseType(item.jurisdiction, caseFilters.caseType));
  const listSubjectsQuery = useQuery({
    enabled: mode === "subjects",
    queryFn: () => fetchSubjectSummarySubjects(subjectFilters),
    queryKey: queryKeys.subjectSummarySubjects(subjectFilters)
  });

  const listTopicsQuery = useQuery({
    enabled: mode === "topics",
    queryFn: () => fetchSubjectSummaryTopics(topicFilters),
    queryKey: queryKeys.subjectSummaryTopics(topicFilters)
  });

  const autocompleteResultsQuery = useQuery({
    enabled: autocompleteQuery.trim().length >= 2,
    queryFn: () => autocompleteSubjectSummaries(autocompleteQuery),
    queryKey: queryKeys.subjectSummaryAutocomplete(autocompleteQuery)
  });

  const availableCaseTopics = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...(topicReferenceQuery.data?.items ?? []),
            ...(topicsQuery.data?.items ?? []),
            ...(selectedHierarchyTopic
              ? [
                  {
                    id: selectedHierarchyTopic.topicId,
                    name: selectedHierarchyTopic.topicName,
                    subjectId: selectedHierarchyTopic.subjectId
                  }
                ]
              : [])
          ].map((topic) => [
            topic.id,
            {
              id: topic.id,
              name: topic.name,
              subjectId: topic.subjectId
            }
          ])
        ).values()
      ),
    [selectedHierarchyTopic, topicReferenceQuery.data?.items, topicsQuery.data?.items]
  );

  useEffect(() => {
    setSubjectFilters((current) => {
      if (current.search === incomingSearch) {
        return current;
      }

      return {
        ...current,
        page: 1,
        search: incomingSearch
      };
    });
    setTopicFilters((current) => {
      if (current.search === incomingSearch && current.subjectId === incomingSubjectId) {
        return current;
      }

      return {
        ...current,
        page: 1,
        search: incomingSearch,
        subjectId: incomingSubjectId
      };
    });
    setCaseFilters((current) => {
      if (current.search === incomingSearch && current.subjectId === incomingSubjectId && current.topicId === incomingTopicId) {
        return current;
      }

      return {
        ...current,
        page: 1,
        search: incomingSearch,
        subjectId: incomingSubjectId,
        topicId: incomingTopicId
      };
    });
  }, [incomingSearch, incomingSubjectId, incomingTopicId]);

  useEffect(() => {
    if (!caseDraft.subjectId || !caseDraft.topicId) {
      return;
    }

    if (topicReferenceQuery.isLoading || topicReferenceQuery.isFetching) {
      return;
    }

    if (
      isCaseSelectionLocked &&
      selectedHierarchyTopic &&
      caseDraft.subjectId === selectedHierarchyTopic.subjectId &&
      caseDraft.topicId === selectedHierarchyTopic.topicId
    ) {
      return;
    }

    const topicStillValid = availableCaseTopics.some(
      (topic) => topic.id === caseDraft.topicId && topic.subjectId === caseDraft.subjectId
    );

    if (!topicStillValid) {
      setCaseDraft((current) => ({
        ...current,
        topicId: ""
      }));
    }
  }, [
    availableCaseTopics,
    caseDraft.subjectId,
    caseDraft.topicId,
    isCaseSelectionLocked,
    selectedHierarchyTopic,
    topicReferenceQuery.isFetching,
    topicReferenceQuery.isLoading
  ]);

  const createSubjectMutation = useMutation({
    mutationFn: createSubjectSummarySubject,
    onSuccess: async () => {
      showToast("Subject created successfully.", "success");
      setSubjectModalOpen(false);
      setEditingSubject(null);
      setSubjectDraft(createSubjectDraft());
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not create the subject right now.", "error")
  });

  const updateSubjectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SubjectSummarySubjectInput }) => updateSubjectSummarySubject(id, payload),
    onSuccess: async () => {
      showToast("Subject updated successfully.", "success");
      setSubjectModalOpen(false);
      setEditingSubject(null);
      setSubjectDraft(createSubjectDraft());
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not update the subject right now.", "error")
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: deleteSubjectSummarySubject,
    onSuccess: async () => {
      showToast("Subject removed successfully.", "success");
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not remove the subject right now.", "error")
  });

  const createTopicMutation = useMutation({
    mutationFn: createSubjectSummaryTopic,
    onSuccess: async () => {
      showToast("Topic created successfully.", "success");
      setTopicModalOpen(false);
      setEditingTopic(null);
      setTopicDraft(createTopicDraft());
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not create the topic right now.", "error")
  });

  const updateTopicMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SubjectSummaryTopicInput }) => updateSubjectSummaryTopic(id, payload),
    onSuccess: async () => {
      showToast("Topic updated successfully.", "success");
      setTopicModalOpen(false);
      setEditingTopic(null);
      setTopicDraft(createTopicDraft());
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not update the topic right now.", "error")
  });

  const deleteTopicMutation = useMutation({
    mutationFn: deleteSubjectSummaryTopic,
    onSuccess: async () => {
      showToast("Topic removed successfully.", "success");
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not remove the topic right now.", "error")
  });

  const createCaseMutation = useMutation({
    mutationFn: createSubjectSummaryCase,
    onSuccess: async () => {
      showToast("Case created successfully.", "success");
      setCaseModalOpen(false);
      setIsCaseSelectionLocked(false);
      setEditingCase(null);
      setSelectedHierarchyTopic(null);
      setCaseDraft(createCaseDraft());
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not create the case right now.", "error")
  });

  const updateCaseMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SubjectSummaryCaseInput }) => updateSubjectSummaryCase(id, payload),
    onSuccess: async () => {
      showToast("Case updated successfully.", "success");
      setCaseModalOpen(false);
      setIsCaseSelectionLocked(false);
      setEditingCase(null);
      setSelectedHierarchyTopic(null);
      setCaseDraft(createCaseDraft());
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not update the case right now.", "error")
  });

  const deleteCaseMutation = useMutation({
    mutationFn: deleteSubjectSummaryCase,
    onSuccess: async () => {
      showToast("Case removed successfully.", "success");
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not remove the case right now.", "error")
  });

  const bulkSubjectsMutation = useMutation({
    mutationFn: ({ action, ids }: { action: "activate" | "archive" | "deactivate" | "delete"; ids: string[] }) =>
      bulkUpdateSubjectSummarySubjects(action, ids),
    onSuccess: async () => {
      showToast("Bulk subject action completed.", "success");
      setSelectedSubjectIds([]);
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not complete the bulk subject action.", "error")
  });

  const bulkTopicsMutation = useMutation({
    mutationFn: ({ action, ids }: { action: "activate" | "archive" | "deactivate" | "delete"; ids: string[] }) =>
      bulkUpdateSubjectSummaryTopics(action, ids),
    onSuccess: async () => {
      showToast("Bulk topic action completed.", "success");
      setSelectedTopicIds([]);
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not complete the bulk topic action.", "error")
  });

  const bulkCasesMutation = useMutation({
    mutationFn: ({ action, ids }: { action: "archive" | "delete" | "draft" | "publish"; ids: string[] }) =>
      bulkUpdateSubjectSummaryCases(action, ids),
    onSuccess: async () => {
      showToast("Bulk case action completed.", "success");
      setSelectedCaseIds([]);
      await invalidateSubjectSummaryQueries();
    },
    onError: () => showToast("Could not complete the bulk case action.", "error")
  });

  const overviewStats = useMemo(() => {
    const items = hierarchyQuery.data?.items ?? [];
    const handbookCaseCount = countHierarchyCases(handbookHierarchyQuery.data?.items);
    const textbookCaseCount = countHierarchyCases(textbookHierarchyQuery.data?.items);

    return {
      handbookCaseCount,
      textbookCaseCount,
      totalCases: handbookCaseCount + textbookCaseCount,
      totalSubjects: items.length,
      totalTopics: items.reduce((sum, item) => sum + item.topicCount, 0)
    };
  }, [handbookHierarchyQuery.data?.items, hierarchyQuery.data?.items, textbookHierarchyQuery.data?.items]);

  useEffect(() => {
    setCaseFilters((current) =>
      current.caseType === selectedCaseType
        ? current
        : {
            ...current,
            caseType: selectedCaseType,
            page: 1
          }
    );
  }, [selectedCaseType]);

  useEffect(() => {
    const editCaseId = searchParams.get("editCase");

    if (!editCaseId || caseModalOpen || !casesQuery.data?.items.length) {
      return;
    }

    const match = casesQuery.data.items.find((item) => item.id === editCaseId);

    if (!match) {
      return;
    }

    openCaseModal(match);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("editCase");
    setSearchParams(nextParams, { replace: true });
  }, [caseModalOpen, casesQuery.data?.items, searchParams, setSearchParams]);

  function openSubjectModal(subject?: SubjectSummarySubject) {
    setEditingSubject(subject ?? null);
    setSubjectDraft(
      subject
        ? {
            description: subject.description,
            displayOrder: subject.displayOrder,
            name: subject.name,
            status: subject.status
          }
        : createSubjectDraft()
    );
    setSubjectModalOpen(true);
  }

  function openTopicModal(topic?: SubjectSummaryTopic) {
    void subjectReferenceQuery.refetch();
    setEditingTopic(topic ?? null);
    setTopicDraft(
      topic
        ? {
            description: topic.description,
            displayOrder: topic.displayOrder,
            name: topic.name,
            status: topic.status,
            subjectId: topic.subjectId
          }
        : createTopicDraft(topicFilters.subjectId || searchParams.get("subjectId") || "")
    );
    setTopicModalOpen(true);
  }

  function openCaseModal(item?: SubjectSummaryCase, selection?: HierarchyTopicSelection) {
    const derivedSelection = selection
      ? selection
      : item
        ? {
            subjectId: item.subjectId,
            subjectName: item.subject.name,
            topicId: item.topicId,
            topicName: item.topic.name
          }
        : null;
    void subjectReferenceQuery.refetch();
    void topicReferenceQuery.refetch();
    setSelectedHierarchyTopic(derivedSelection);
    setIsCaseSelectionLocked(Boolean(selection) && !item);
    setEditingCase(item ?? null);
    setCaseDraft(
      item
        ? {
            attachments: item.attachments,
            caseSummary: item.caseSummary,
            citation: item.citation,
            court: item.court,
            decisionHolding: item.decisionHolding,
            externalReferences: item.externalReferences,
            facts: item.facts,
            issues: item.issues,
            judges: item.judges,
            jurisdiction: normalizeCaseTypeLabel(item.jurisdiction),
            keywords: item.keywords,
            legalPrinciples: item.legalPrinciples,
            obiterDicta: item.obiterDicta,
            ratioDecidendi: item.ratioDecidendi,
            relatedCases: item.relatedCases,
            relatedStatutes: item.relatedStatutes,
            status: item.status,
            subjectId: item.subjectId,
            title: item.title,
            topicId: item.topicId,
            year: item.year
          }
        : createCaseDraft(
            selection?.subjectId || caseFilters.subjectId || searchParams.get("subjectId") || "",
            selection?.topicId || caseFilters.topicId || searchParams.get("topicId") || ""
          )
    );
    setCaseModalOpen(true);
  }

  function handleSubjectSubmit() {
    if (!subjectDraft.name.trim()) {
      showToast("Add a subject name before saving.", "error");
      return;
    }

    if (editingSubject) {
      updateSubjectMutation.mutate({ id: editingSubject.id, payload: subjectDraft });
      return;
    }

    createSubjectMutation.mutate(subjectDraft);
  }

  function handleTopicSubmit() {
    if (!topicDraft.subjectId || !topicDraft.name.trim()) {
      showToast("Choose a subject and add a topic name before saving.", "error");
      return;
    }

    if (editingTopic) {
      updateTopicMutation.mutate({ id: editingTopic.id, payload: topicDraft });
      return;
    }

    createTopicMutation.mutate(topicDraft);
  }

  function handleCaseSubmit() {
    const subjectId = caseDraft.subjectId || (isCaseSelectionLocked ? selectedHierarchyTopic?.subjectId ?? "" : "");
    const topicId = caseDraft.topicId || (isCaseSelectionLocked ? selectedHierarchyTopic?.topicId ?? "" : "");
    const payload = {
      ...caseDraft,
      subjectId,
      topicId
    };

    if (!payload.subjectId || !payload.topicId || !payload.title.trim()) {
      showToast("Choose a subject, choose a topic, and add a case title before saving.", "error");
      return;
    }

    if (editingCase) {
      updateCaseMutation.mutate({ id: editingCase.id, payload });
      return;
    }

    createCaseMutation.mutate(payload);
  }

  const subjectOptions = useMemo(() => {
    const mergedSubjects = [
      ...(subjectReferenceQuery.data?.items ?? []),
      ...(subjectsQuery.data?.items ?? []),
      ...(listSubjectsQuery.data?.items ?? []),
      ...((hierarchyQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name
      })) as Array<{ id: string; name: string }>)
    ];

    const uniqueSubjects = Array.from(new Map(mergedSubjects.map((subject) => [subject.id, subject])).values()).map((subject) => ({
      id: subject.id,
      name: subject.name
    }));

    return sortByName(uniqueSubjects);
  }, [
    hierarchyQuery.data?.items,
    listSubjectsQuery.data?.items,
    subjectReferenceQuery.data?.items,
    subjectsQuery.data?.items
  ]);
  const topicOptions = availableCaseTopics;
  const readingInsightActions = (
    <>
      <HeaderActionButton isDark={isDark} onClick={() => openSubjectModal()}>
        <FolderPlus className="h-4 w-4" />
        Add subject
      </HeaderActionButton>
      <HeaderActionButton isDark={isDark} onClick={() => openTopicModal()}>
        <Plus className="h-4 w-4" />
        Add topic
      </HeaderActionButton>
    </>
  );

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />

      <SubjectModal
        draft={subjectDraft}
        isDark={isDark}
        isOpen={subjectModalOpen}
        isSaving={createSubjectMutation.isPending || updateSubjectMutation.isPending}
        onChange={(field, value) => setSubjectDraft((current) => ({ ...current, [field]: value as never }))}
        onClose={() => setSubjectModalOpen(false)}
        onSubmit={handleSubjectSubmit}
        title={editingSubject ? "Edit subject" : "Add subject"}
      />

      <TopicModal
        draft={topicDraft}
        isDark={isDark}
        isOpen={topicModalOpen}
        isSaving={createTopicMutation.isPending || updateTopicMutation.isPending}
        onChange={(field, value) =>
          setTopicDraft((current) => ({
            ...current,
            [field]: value as never
          }))
        }
        onClose={() => setTopicModalOpen(false)}
        onSubmit={handleTopicSubmit}
        subjects={subjectOptions}
        subjectsLoading={subjectReferenceQuery.isLoading}
        title={editingTopic ? "Edit topic" : "Add topic"}
      />

      <CaseModal
        draft={caseDraft}
        isDark={isDark}
        isOpen={caseModalOpen}
        isSaving={createCaseMutation.isPending || updateCaseMutation.isPending}
        onChange={(field, value) =>
          setCaseDraft((current) => {
            if (field === "subjectId") {
              return {
                ...current,
                subjectId: String(value),
                topicId: ""
              };
            }

            return {
              ...current,
              [field]: value as never
            };
          })
        }
        onClose={() => {
          setCaseModalOpen(false);
          setIsCaseSelectionLocked(false);
          setSelectedHierarchyTopic(null);
        }}
        lockSubjectTopic={isCaseSelectionLocked && !editingCase}
        lockedSubjectName={isCaseSelectionLocked ? selectedHierarchyTopic?.subjectName : undefined}
        lockedTopicName={isCaseSelectionLocked ? selectedHierarchyTopic?.topicName : undefined}
        onSubmit={handleCaseSubmit}
        subjects={subjectOptions}
        title={editingCase ? "Edit case" : "Add case"}
        topics={topicOptions}
      />

      <div className="space-y-6">
        {readingInsightsQuery.isError ? (
          <ReadingInsightsSectionState
            actions={readingInsightActions}
            isDark={isDark}
            message="Could not load the reading insights chart right now."
          />
        ) : readingInsightsQuery.isLoading ? (
          <ReadingInsightsSectionState
            actions={readingInsightActions}
            isDark={isDark}
            message="Loading the reading insights chart..."
          />
        ) : (
          <ReadingInsightsSection
            actions={readingInsightActions}
            insights={readingInsightsQuery.data?.items ?? []}
            isDark={isDark}
            overviewStats={overviewStats}
            totalReads={readingInsightsQuery.data?.totalReads ?? 0}
          />
        )}

        <Panel isDark={isDark}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Navigation</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { href: "/app/admin/library/subject-summaries", label: "Overview" },
                  { href: "/app/admin/library/subject-summaries/subjects", label: "Subjects" },
                  { href: "/app/admin/library/subject-summaries/topics", label: "Topics" },
                  { href: "/app/admin/library/subject-summaries/cases", label: "Cases" }
                ].map((item) => (
                  <NavLink
                    className={({ isActive }) =>
                      cn(
                        "rounded-full border px-4 py-2 text-sm transition",
                        isDark
                          ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:text-slate-950",
                        isActive && (isDark ? "border-slate-500 text-white" : "border-slate-400 text-slate-950")
                      )
                    }
                    key={item.href}
                    to={`${item.href}${selectedCaseType === "all" ? "" : `?caseType=${selectedCaseType}`}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
            <div className="relative w-full max-w-md">
              <div className={cn("flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
                <input
                  className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
                  onChange={(event) => setAutocompleteQuery(event.target.value)}
                  placeholder="Search subjects, topics, and cases"
                  value={autocompleteQuery}
                />
              </div>
              {autocompleteResultsQuery.data?.items.length ? (
                <div className={cn("absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-[24px] border shadow-[0_20px_60px_rgba(15,23,42,0.12)]", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
                  {autocompleteResultsQuery.data.items.map((item) => (
                    <button
                      className={cn("flex w-full items-start justify-between gap-3 border-b px-4 py-3 text-left last:border-b-0", isDark ? "border-slate-800 hover:bg-slate-900" : "border-slate-100 hover:bg-slate-50")}
                      key={`${item.type}-${item.id}`}
                      onClick={() => {
                        setAutocompleteQuery("");
                        navigate(item.path);
                      }}
                      type="button"
                    >
                      <div>
                        <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.label}</p>
                        <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{item.subtitle}</p>
                      </div>
                      <span className={cn("rounded-full border px-2.5 py-1 text-xs uppercase", isDark ? "border-slate-700 text-slate-300" : "border-slate-200 text-slate-500")}>
                        {item.type}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </Panel>

        {mode === "overview" ? (
          <Panel isDark={isDark}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Hierarchy</p>
                <h3 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>Cases and ratios tree</h3>
              </div>
              <div className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm", isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
                <BarChart3 className="h-4 w-4" />
                Expand subjects to browse topics and cases
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {hierarchyQuery.isLoading ? (
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading cases and ratios hierarchy...</p>
              ) : hierarchyQuery.data?.items.length ? (
                hierarchyQuery.data.items.map((subject) => (
                  <HierarchySubjectItem
                    caseType={selectedCaseType}
                    isDark={isDark}
                    key={subject.id}
                    onAddCase={(selection) => openCaseModal(undefined, selection)}
                    onAddTopic={(value) => {
                      setEditingTopic(null);
                      setTopicDraft(createTopicDraft(value.id));
                      setTopicModalOpen(true);
                    }}
                    onDeleteCase={(caseId) => deleteCaseMutation.mutate(caseId)}
                    onDeleteSubject={(subjectId) => deleteSubjectMutation.mutate(subjectId)}
                    onDeleteTopic={(topic) => deleteTopicMutation.mutate(topic.id)}
                    onEditCase={(caseId) => void openCaseModalById(caseId)}
                    onEditSubject={(value) => openSubjectModal(value)}
                    onEditTopic={(value) => openTopicModal(value)}
                    onSelectTopic={setSelectedHierarchyTopic}
                    selectedTopicId={selectedHierarchyTopic?.topicId ?? null}
                    subject={subject}
                  />
                ))
              ) : (
                <EmptyState
                  action={
                    <button className="button-primary !px-4 !py-3" onClick={() => openSubjectModal()} type="button">
                      Add first subject
                    </button>
                  }
                  isDark={isDark}
                  message="No subjects match the current hierarchy view yet."
                />
              )}
            </div>
          </Panel>
        ) : null}

        {mode === "subjects" ? (
          <Panel isDark={isDark}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Subjects</p>
                <h3 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>Manage subjects</h3>
              </div>
              <button className="button-primary !px-4 !py-3" onClick={() => openSubjectModal()} type="button">
                <Plus className="h-4 w-4" />
                New subject
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <input
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setSubjectFilters((current) => ({ ...current, page: 1, search: event.target.value }))}
                placeholder="Search subjects"
                value={subjectFilters.search}
              />
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setSubjectFilters((current) => ({ ...current, page: 1, status: event.target.value as SubjectSummaryStatus | "all" }))}
                value={subjectFilters.status}
              >
                <option value="all">All statuses</option>
                {["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => (
                  <option key={value} value={value}>
                    {prettifyStatus(value)}
                  </option>
                ))}
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setSubjectFilters((current) => ({ ...current, sortBy: event.target.value as Required<SubjectSummarySubjectFilters>["sortBy"] }))}
                value={subjectFilters.sortBy}
              >
                <option value="displayOrder">Sort by display order</option>
                <option value="name">Sort by name</option>
                <option value="createdAt">Sort by created date</option>
                <option value="updatedAt">Sort by updated date</option>
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setSubjectFilters((current) => ({ ...current, sortOrder: event.target.value as "asc" | "desc" }))}
                value={subjectFilters.sortOrder}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
            {selectedSubjectIds.length ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkSubjectsMutation.mutate({ action: "activate", ids: selectedSubjectIds })} type="button">Bulk activate</button>
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkSubjectsMutation.mutate({ action: "archive", ids: selectedSubjectIds })} type="button">Bulk archive</button>
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkSubjectsMutation.mutate({ action: "delete", ids: selectedSubjectIds })} type="button">Bulk delete</button>
              </div>
            ) : null}
            <div className="mt-6 overflow-x-auto">
              {listSubjectsQuery.data?.items.length ? (
                <table className="min-w-full text-left text-sm">
                  <thead className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          checked={selectedSubjectIds.length > 0 && selectedSubjectIds.length === listSubjectsQuery.data.items.length}
                          onChange={(event) => setSelectedSubjectIds(event.target.checked ? listSubjectsQuery.data.items.map((item) => item.id) : [])}
                          type="checkbox"
                        />
                      </th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Topics</th>
                      <th className="px-4 py-3">Cases</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listSubjectsQuery.data.items.map((subject) => (
                      <tr className={cn("border-t", isDark ? "border-slate-800" : "border-slate-100")} key={subject.id}>
                        <td className="px-4 py-4">
                          <input
                            checked={selectedSubjectIds.includes(subject.id)}
                            onChange={(event) =>
                              setSelectedSubjectIds((current) =>
                                event.target.checked ? [...current, subject.id] : current.filter((id) => id !== subject.id)
                              )
                            }
                            type="checkbox"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{subject.name}</p>
                            <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{subject.description || "No description."}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">{subject.topicCount}</td>
                        <td className="px-4 py-4">{subject.caseCount}</td>
                        <td className="px-4 py-4">
                          <StatusBadge isDark={isDark} value={subject.status} />
                        </td>
                        <td className="px-4 py-4">{formatDate(subject.createdAt)}</td>
                        <td className="px-4 py-4">{formatDate(subject.updatedAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <IconButton isDark={isDark} onClick={() => openSubjectModal(subject)} title="Edit subject">
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton isDark={isDark} onClick={() => deleteSubjectMutation.mutate(subject.id)} title="Delete subject">
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState isDark={isDark} message="No subjects match the current filters." />
              )}
            </div>
            {listSubjectsQuery.data ? (
              <div className="mt-6">
                <Pagination isDark={isDark} onPageChange={(page) => setSubjectFilters((current) => ({ ...current, page }))} page={listSubjectsQuery.data.pagination.page} totalPages={listSubjectsQuery.data.pagination.totalPages} />
              </div>
            ) : null}
          </Panel>
        ) : null}

        {mode === "topics" ? (
          <Panel isDark={isDark}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Topics</p>
                <h3 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>Manage topics</h3>
              </div>
              <button className="button-primary !px-4 !py-3" onClick={() => openTopicModal()} type="button">
                <Plus className="h-4 w-4" />
                New topic
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-5">
              <input
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setTopicFilters((current) => ({ ...current, page: 1, search: event.target.value }))}
                placeholder="Search topics"
                value={topicFilters.search}
              />
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setTopicFilters((current) => ({ ...current, page: 1, subjectId: event.target.value }))}
                value={topicFilters.subjectId}
              >
                <option value="">All subjects</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setTopicFilters((current) => ({ ...current, page: 1, status: event.target.value as SubjectSummaryStatus | "all" }))}
                value={topicFilters.status}
              >
                <option value="all">All statuses</option>
                {["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => (
                  <option key={value} value={value}>
                    {prettifyStatus(value)}
                  </option>
                ))}
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setTopicFilters((current) => ({ ...current, sortBy: event.target.value as Required<SubjectSummaryTopicFilters>["sortBy"] }))}
                value={topicFilters.sortBy}
              >
                <option value="displayOrder">Sort by display order</option>
                <option value="name">Sort by name</option>
                <option value="createdAt">Sort by created date</option>
                <option value="updatedAt">Sort by updated date</option>
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setTopicFilters((current) => ({ ...current, sortOrder: event.target.value as "asc" | "desc" }))}
                value={topicFilters.sortOrder}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
            {selectedTopicIds.length ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkTopicsMutation.mutate({ action: "activate", ids: selectedTopicIds })} type="button">Bulk activate</button>
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkTopicsMutation.mutate({ action: "archive", ids: selectedTopicIds })} type="button">Bulk archive</button>
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkTopicsMutation.mutate({ action: "delete", ids: selectedTopicIds })} type="button">Bulk delete</button>
              </div>
            ) : null}
            <div className="mt-6 overflow-x-auto">
              {listTopicsQuery.data?.items.length ? (
                <table className="min-w-full text-left text-sm">
                  <thead className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          checked={selectedTopicIds.length > 0 && selectedTopicIds.length === listTopicsQuery.data.items.length}
                          onChange={(event) => setSelectedTopicIds(event.target.checked ? listTopicsQuery.data.items.map((item) => item.id) : [])}
                          type="checkbox"
                        />
                      </th>
                      <th className="px-4 py-3">Topic</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Cases</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listTopicsQuery.data.items.map((topic) => (
                      <tr className={cn("border-t", isDark ? "border-slate-800" : "border-slate-100")} key={topic.id}>
                        <td className="px-4 py-4">
                          <input
                            checked={selectedTopicIds.includes(topic.id)}
                            onChange={(event) =>
                              setSelectedTopicIds((current) =>
                                event.target.checked ? [...current, topic.id] : current.filter((id) => id !== topic.id)
                              )
                            }
                            type="checkbox"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{topic.name}</p>
                            <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{topic.description || "No description."}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">{topic.subject.name}</td>
                        <td className="px-4 py-4">{topic.caseCount}</td>
                        <td className="px-4 py-4"><StatusBadge isDark={isDark} value={topic.status} /></td>
                        <td className="px-4 py-4">{formatDate(topic.createdAt)}</td>
                        <td className="px-4 py-4">{formatDate(topic.updatedAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <IconButton isDark={isDark} onClick={() => openTopicModal(topic)} title="Edit topic">
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton isDark={isDark} onClick={() => deleteTopicMutation.mutate(topic.id)} title="Delete topic">
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState isDark={isDark} message="No topics match the current filters." />
              )}
            </div>
            {listTopicsQuery.data ? (
              <div className="mt-6">
                <Pagination isDark={isDark} onPageChange={(page) => setTopicFilters((current) => ({ ...current, page }))} page={listTopicsQuery.data.pagination.page} totalPages={listTopicsQuery.data.pagination.totalPages} />
              </div>
            ) : null}
          </Panel>
        ) : null}

        {mode === "cases" ? (
          <Panel isDark={isDark}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Cases</p>
                <h3 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>Manage cases</h3>
              </div>
              <button className="button-primary !px-4 !py-3" onClick={() => openCaseModal()} type="button">
                <Plus className="h-4 w-4" />
                New case
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-6">
              <input
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setCaseFilters((current) => ({ ...current, page: 1, search: event.target.value }))}
                placeholder="Search cases"
                value={caseFilters.search}
              />
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setCaseFilters((current) => ({ ...current, caseType: event.target.value as "all" | SubjectSummaryCaseType, page: 1 }))}
                value={caseFilters.caseType}
              >
                <option value="all">All types</option>
                <option value="HANDBOOK">Handbook</option>
                <option value="TEXTBOOK">Textbook</option>
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setCaseFilters((current) => ({ ...current, page: 1, subjectId: event.target.value, topicId: "" }))}
                value={caseFilters.subjectId}
              >
                <option value="">All subjects</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setCaseFilters((current) => ({ ...current, page: 1, topicId: event.target.value }))}
                value={caseFilters.topicId}
              >
                <option value="">All topics</option>
                {topicOptions
                  .filter((topic) => !caseFilters.subjectId || topic.subjectId === caseFilters.subjectId)
                  .map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setCaseFilters((current) => ({ ...current, page: 1, status: event.target.value as SubjectSummaryCaseStatus | "all" }))}
                value={caseFilters.status}
              >
                <option value="all">All statuses</option>
                {["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"].map((value) => (
                  <option key={value} value={value}>
                    {prettifyStatus(value)}
                  </option>
                ))}
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setCaseFilters((current) => ({ ...current, sortBy: event.target.value as Required<SubjectSummaryCaseFilters>["sortBy"] }))}
                value={caseFilters.sortBy}
              >
                <option value="updatedAt">Sort by updated date</option>
                <option value="createdAt">Sort by created date</option>
                <option value="title">Sort by title</option>
                <option value="year">Sort by year</option>
              </select>
              <select
                className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => setCaseFilters((current) => ({ ...current, sortOrder: event.target.value as "asc" | "desc" }))}
                value={caseFilters.sortOrder}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
            {selectedCaseIds.length ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkCasesMutation.mutate({ action: "publish", ids: selectedCaseIds })} type="button">Bulk publish</button>
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkCasesMutation.mutate({ action: "archive", ids: selectedCaseIds })} type="button">Bulk archive</button>
                <button className="button-secondary !px-4 !py-3" onClick={() => bulkCasesMutation.mutate({ action: "delete", ids: selectedCaseIds })} type="button">Bulk delete</button>
              </div>
            ) : null}
            <div className="mt-6 overflow-x-auto">
              {visibleCaseRows.length ? (
                <table className="min-w-full text-left text-sm">
                  <thead className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          checked={visibleCaseRows.length > 0 && visibleCaseRows.every((item) => selectedCaseIds.includes(item.id))}
                          onChange={(event) => setSelectedCaseIds(event.target.checked ? visibleCaseRows.map((item) => item.id) : [])}
                          type="checkbox"
                        />
                      </th>
                      <th className="px-4 py-3">Case</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Topic</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCaseRows.map((item) => (
                      <tr className={cn("border-t", isDark ? "border-slate-800" : "border-slate-100")} key={item.id}>
                        <td className="px-4 py-4">
                          <input
                            checked={selectedCaseIds.includes(item.id)}
                            onChange={(event) =>
                              setSelectedCaseIds((current) =>
                                event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                              )
                            }
                            type="checkbox"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                            <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{item.citation || item.court || "No citation."}</p>
                            {item.reviewFeedback ? (
                              <div
                                className={cn(
                                  "mt-3 rounded-2xl border px-3 py-3 text-sm leading-6",
                                  isDark
                                    ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
                                    : "border-rose-200 bg-rose-50 text-rose-700"
                                )}
                              >
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Revision note</p>
                                <p className="mt-2">{item.reviewFeedback}</p>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">{item.jurisdiction}</td>
                        <td className="px-4 py-4">{item.subject.name}</td>
                        <td className="px-4 py-4">{item.topic.name}</td>
                        <td className="px-4 py-4"><StatusBadge isDark={isDark} value={item.status} /></td>
                        <td className="px-4 py-4">{formatDate(item.createdAt)}</td>
                        <td className="px-4 py-4">{formatDate(item.updatedAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Link className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800" to={`/app/admin/library/subject-summaries/cases/${item.id}${caseFilters.caseType === "all" ? "" : `?caseType=${caseFilters.caseType}`}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                            <IconButton isDark={isDark} onClick={() => openCaseModal(item)} title="Edit case">
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton isDark={isDark} onClick={() => deleteCaseMutation.mutate(item.id)} title="Delete case">
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState isDark={isDark} message="No cases match the current filters." />
              )}
            </div>
            {casesQuery.data ? (
              <div className="mt-6">
                <Pagination isDark={isDark} onPageChange={(page) => setCaseFilters((current) => ({ ...current, page }))} page={casesQuery.data.pagination.page} totalPages={casesQuery.data.pagination.totalPages} />
              </div>
            ) : null}
          </Panel>
        ) : null}
      </div>
    </>
  );
}
