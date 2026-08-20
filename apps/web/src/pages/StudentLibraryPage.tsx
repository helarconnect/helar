import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Bookmark, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Eye, Scale, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  createStudentStudyBookmark,
  deleteStudentStudyBookmark,
  fetchStudentStudyBookmarks,
  autocompletePublishedSubjectSummaries,
  fetchLibraryHelarpedia,
  fetchLibraryLawReports,
  fetchPublishedSubjectSummaryCases,
  fetchPublishedSubjectSummaryHierarchy,
  fetchPublishedSubjectSummaryHierarchyCases,
  fetchPublishedSubjectSummaryHierarchyTopics,
  type AdminLibraryFilters,
  type SubjectSummaryCaseType,
  type SubjectSummaryHierarchySubject,
  type SubjectSummaryHierarchyTopic
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const defaultFilters: Required<AdminLibraryFilters> = {
  materialType: "all",
  page: 1,
  pageSize: 12,
  search: "",
  sortBy: "reportNumber",
  sortOrder: "desc"
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Date not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function prettifyCourt(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesCaseTypeLabel(value: string | null | undefined, caseType: SubjectSummaryCaseType) {
  const normalizedValue = value?.trim().toLowerCase();

  if (caseType === "HANDBOOK") {
    return normalizedValue === "handbook";
  }

  return normalizedValue === "textbook" || normalizedValue === "textbooks";
}

function BookmarkButton({
  active,
  isDark,
  onClick
}: {
  active: boolean;
  isDark: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
        active
          ? isDark
            ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
            : "border-amber-200 bg-amber-50 text-amber-700"
          : isDark
            ? "border-slate-700 bg-slate-950 text-white hover:border-slate-600"
            : "border-slate-300 bg-white text-slate-950 shadow-sm hover:border-slate-400 hover:bg-slate-50"
      )}
      onClick={onClick}
      type="button"
    >
      <Bookmark className="h-4 w-4" />
      {active ? "Saved" : "Bookmark"}
    </button>
  );
}

function StudentSubjectSummaryTopicItem({
  autoExpand,
  bookmarkActive,
  caseType,
  isDark,
  onToggleBookmark,
  selectedTopicId,
  topic
}: {
  autoExpand: boolean;
  bookmarkActive: boolean;
  caseType: SubjectSummaryCaseType;
  isDark: boolean;
  onToggleBookmark: () => void;
  selectedTopicId: string | null;
  topic: SubjectSummaryHierarchyTopic;
}) {
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  const isSelected = selectedTopicId === topic.id;

  useEffect(() => {
    if (autoExpand) {
      setIsExpanded(true);
    }
  }, [autoExpand]);

  const casesQuery = useQuery({
    enabled: isExpanded,
    queryFn: () => fetchPublishedSubjectSummaryHierarchyCases(topic.id, { caseType }),
    queryKey: queryKeys.subjectSummaryPublishedHierarchyCases(topic.id, { caseType })
  });
  const visibleCases = (casesQuery.data?.items ?? []).filter((item) => matchesCaseTypeLabel(item.jurisdiction, caseType));

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
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left" onClick={() => setIsExpanded((current) => !current)} type="button">
        <div>
          <div className="flex items-center gap-3">
            {topic.hasCases ? (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
            <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{topic.name}</p>
          </div>
          <p className={cn("mt-2 pl-7 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{topic.description || "No description added yet."}</p>
        </div>
        <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{topic.caseCount} cases</span>
        </button>
        <BookmarkButton active={bookmarkActive} isDark={isDark} onClick={onToggleBookmark} />
      </div>
      {isExpanded ? (
        <div className={cn("border-t px-4 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          {casesQuery.isLoading ? (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading cases...</p>
          ) : visibleCases.length ? (
            <div className="space-y-3">
              {visibleCases.map((item) => (
                <Link
                  className={cn("block rounded-[20px] border px-4 py-3 transition", isDark ? "border-slate-800 bg-slate-950 hover:border-slate-700" : "border-slate-200 bg-slate-50 hover:border-slate-300")}
                  key={item.id}
                  to={`/app/library/subject-summaries/cases/${item.id}?caseType=${caseType}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                      <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{item.citation || item.court || "No citation yet."}</p>
                    </div>
                    <span className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Open case</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>No published cases are available in this topic yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StudentSubjectSummarySubjectItem({
  autoExpand,
  bookmarkActive,
  caseType,
  isDark,
  onToggleBookmark,
  onToggleTopicBookmark,
  selectedTopicId,
  topicBookmarkKeys,
  subject
}: {
  autoExpand: boolean;
  bookmarkActive: boolean;
  caseType: SubjectSummaryCaseType;
  isDark: boolean;
  onToggleBookmark: () => void;
  onToggleTopicBookmark: (topic: SubjectSummaryHierarchyTopic) => void;
  selectedTopicId: string | null;
  topicBookmarkKeys: Set<string>;
  subject: SubjectSummaryHierarchySubject;
}) {
  const [isExpanded, setIsExpanded] = useState(autoExpand);

  useEffect(() => {
    if (autoExpand) {
      setIsExpanded(true);
    }
  }, [autoExpand]);

  const topicsQuery = useQuery({
    enabled: isExpanded,
    queryFn: () => fetchPublishedSubjectSummaryHierarchyTopics(subject.id, { caseType }),
    queryKey: queryKeys.subjectSummaryPublishedHierarchyTopics(subject.id, { caseType })
  });

  return (
    <div className={cn("rounded-[26px] border", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <button className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left" onClick={() => setIsExpanded((current) => !current)} type="button">
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
          <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{subject.topicCount} topics</span>
          <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{subject.caseCount} cases</span>
        </div>
        </button>
        <BookmarkButton active={bookmarkActive} isDark={isDark} onClick={onToggleBookmark} />
      </div>
      {isExpanded ? (
        <div className={cn("space-y-3 border-t px-5 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          {topicsQuery.isLoading ? (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading topics...</p>
          ) : topicsQuery.data?.items.length ? (
            topicsQuery.data.items.map((topic) => (
              <StudentSubjectSummaryTopicItem
                autoExpand={selectedTopicId === topic.id}
                bookmarkActive={topicBookmarkKeys.has(`SUBJECT_SUMMARY_TOPIC:${topic.id}`)}
                caseType={caseType}
                isDark={isDark}
                key={topic.id}
                onToggleBookmark={() => onToggleTopicBookmark(topic)}
                selectedTopicId={selectedTopicId}
                topic={topic}
              />
            ))
          ) : (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>No active topics are available in this subject yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function StudentLawReportsPage() {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(defaultFilters);
  // Caching: the list endpoint was already heavily optimized on the server, but
  // the fastest request is the one we never make. Keep responses fresh for 30s
  // (enough to cover quick back/next navigation, filter debounces, clicks in
  // and out of a reader then back) and preserve the previous page of data while
  // a pagination request is in-flight so the list never jolts to a skeleton.
  const reportsQuery = useQuery({
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchLibraryLawReports(filters),
    queryKey: queryKeys.adminLibrary("student-law-reports", filters),
    staleTime: 30_000
  });
  const bookmarksQuery = useQuery({
    gcTime: 60_000,
    queryFn: () => fetchStudentStudyBookmarks({}),
    queryKey: queryKeys.studentStudyBookmarks({}),
    staleTime: 30_000
  });
  const createBookmarkMutation = useMutation({
    mutationFn: createStudentStudyBookmark,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyBookmarks({}) });
    }
  });
  const deleteBookmarkMutation = useMutation({
    mutationFn: deleteStudentStudyBookmark,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyBookmarks({}) });
    }
  });

  const materials = reportsQuery.data?.materials ?? [];
  const bookmarks = bookmarksQuery.data?.items ?? [];
  const totalItems = reportsQuery.data?.pagination.totalItems ?? 0;
  const summaryText = useMemo(
    () => `${totalItems} law report${totalItems === 1 ? "" : "s"} available in the student library.`,
    [totalItems]
  );

  return (
    <div className="space-y-6">
      <section
        className={cn(
          "overflow-visible rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:p-7",
          isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Student library</p>
            <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
              Read published law reports from the student portal.
            </h2>
            <p className={cn("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>{summaryText}</p>
          </div>

          <div className={cn("flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
            <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
            <input
              className={cn("w-72 bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
              onChange={(event) => setFilters((current) => ({ ...current, page: 1, search: event.target.value }))}
              placeholder="Search law reports"
              value={filters.search}
            />
          </div>
        </div>
      </section>

      {reportsQuery.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className={cn("h-56 animate-pulse rounded-[22px]", isDark ? "bg-slate-800" : "bg-slate-100")} key={index} />
          ))}
        </div>
      ) : reportsQuery.isError ? (
        <div
          className={cn(
            "rounded-[22px] border px-6 py-8 text-sm leading-7",
            isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600"
          )}
        >
          Could not load the law reports right now.
        </div>
      ) : materials.length ? (
        <>
          <ol className="space-y-4">
            {materials.map((material, index) => {
              const contentKey = `LAW_REPORT:${material.id}`;
              const activeBookmark = bookmarks.find((bookmark) => bookmark.contentKey === contentKey);
              const isRecent = material.createdAt
                ? Date.now() - new Date(material.createdAt).getTime() < 1000 * 60 * 60 * 24 * 14
                : false;

              return (
                <li
                  className={cn(
                    "group relative overflow-hidden rounded-[22px] border bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]",
                    isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
                  )}
                  key={material.id}
                >
                  {/* Citation ribbon */}
                  <div
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3",
                      isDark ? "border-slate-800 bg-slate-950/70" : "border-slate-100 bg-slate-50/80"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.06em]",
                          isDark
                            ? "border border-amber-500/30 bg-amber-500/10 text-amber-200"
                            : "border border-amber-200 bg-amber-50 text-amber-800"
                        )}
                      >
                        <BookOpenText className="h-3 w-3" />
                        {material.reportNumber ? material.reportNumber : "Citation pending"}
                      </span>
                      {isRecent ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                            isDark
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                          )}
                        >
                          New
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                          isDark ? "border border-slate-700 bg-slate-900 text-slate-300" : "border border-slate-200 bg-white text-slate-700"
                        )}
                      >
                        #{index + 1} of {totalItems}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                          isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                        )}
                      >
                        <Scale className="h-3 w-3" />
                        {prettifyCourt(material.materialType)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                          isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                        )}
                      >
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(material.reportDate)}
                      </span>
                      {material.estimatedMins ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-1",
                            isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                          )}
                        >
                          ⏱ {material.estimatedMins} min read
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Main content area */}
                  <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1fr_220px]">
                    <div className="min-w-0 space-y-3">
                      <Link
                        className={cn(
                          "block font-heading text-[1.35rem] font-semibold leading-snug transition hover:underline decoration-slate-400 underline-offset-4",
                          isDark ? "text-white" : "text-slate-950"
                        )}
                        to={`/app/library/law-reports/${material.id}`}
                      >
                        {material.title}
                      </Link>
                      {material.storageUrl?.trim() ? (
                        <div
                          className={cn(
                            "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium",
                            isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"
                          )}
                        >
                          Suit / case file number:
                          <span className={cn("font-mono tracking-[0.02em]", isDark ? "text-white" : "text-slate-950")}>
                            {material.storageUrl}
                          </span>
                        </div>
                      ) : null}
                      <p
                        className={cn(
                          "line-clamp-3 text-[0.92rem] leading-7",
                          isDark ? "text-slate-300" : "text-slate-600"
                        )}
                      >
                        {stripHtml(material.summary) ||
                          "The full headnote, summary and judgment text is available inside the reader — open the report to read the complete citation, ratio decidendi and commentary."}
                      </p>
                    </div>

                    {/* Action column */}
                    <div className="flex flex-col items-stretch justify-end gap-2.5 lg:items-end">
                      <div className="flex flex-wrap gap-2.5 lg:flex-col lg:items-stretch">
                        <BookmarkButton
                          active={Boolean(activeBookmark)}
                          isDark={isDark}
                          onClick={() => {
                            if (activeBookmark) {
                              deleteBookmarkMutation.mutate(activeBookmark.id);
                              return;
                            }

                            createBookmarkMutation.mutate({
                              contentKey,
                              contentType: "LAW_REPORT",
                              path: `/app/library/law-reports/${material.id}`,
                              title: material.title
                            });
                          }}
                        />
                        <Link
                          className={cn(
                            "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                            isDark
                              ? "border-white/20 bg-white text-slate-950 hover:bg-slate-100"
                              : "border-slate-950 bg-slate-950 text-white shadow-sm hover:bg-slate-800"
                          )}
                          to={`/app/library/law-reports/${material.id}`}
                        >
                          Read report
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center justify-between gap-3">
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
              Page {reportsQuery.data?.pagination.page ?? 1} of {reportsQuery.data?.pagination.totalPages ?? 1}
            </p>
            <div className="flex items-center gap-2">
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                  isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900 shadow-sm"
                )}
                disabled={(reportsQuery.data?.pagination.page ?? 1) <= 1}
                onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                  isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900 shadow-sm"
                )}
                disabled={(reportsQuery.data?.pagination.page ?? 1) >= (reportsQuery.data?.pagination.totalPages ?? 1)}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: Math.min(reportsQuery.data?.pagination.totalPages ?? current.page, current.page + 1)
                  }))
                }
                type="button"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div
          className={cn(
            "rounded-[22px] border px-6 py-8 text-sm leading-7",
            isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600"
          )}
        >
          No law reports match the current search yet.
        </div>
      )}
    </div>
  );
}

export function StudentHelarpediaPage() {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(defaultFilters);
  const reportsQuery = useQuery({
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchLibraryHelarpedia(filters),
    queryKey: queryKeys.adminLibrary("student-helarpedia", filters),
    staleTime: 30_000
  });
  const bookmarksQuery = useQuery({
    gcTime: 60_000,
    queryFn: () => fetchStudentStudyBookmarks({}),
    queryKey: queryKeys.studentStudyBookmarks({}),
    staleTime: 30_000
  });
  const createBookmarkMutation = useMutation({
    mutationFn: createStudentStudyBookmark,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyBookmarks({}) });
    }
  });
  const deleteBookmarkMutation = useMutation({
    mutationFn: deleteStudentStudyBookmark,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyBookmarks({}) });
    }
  });

  const materials = reportsQuery.data?.materials ?? [];
  const bookmarks = bookmarksQuery.data?.items ?? [];
  const totalItems = reportsQuery.data?.pagination.totalItems ?? 0;
  const summaryText = useMemo(
    () => `${totalItems} Helarpedia entr${totalItems === 1 ? "y" : "ies"} covering legal terms, issue definitions, and cross-linked case law.`,
    [totalItems]
  );

  return (
    <div className="space-y-6">
      <section
        className={cn(
          "overflow-visible rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:p-7",
          isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Helarpedia</p>
            <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
              Browse published Helarpedia legal issue and term entries.
            </h2>
            <p className={cn("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>{summaryText}</p>
          </div>

          <div className={cn("flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
            <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
            <input
              className={cn("w-72 bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
              onChange={(event) => setFilters((current) => ({ ...current, page: 1, search: event.target.value }))}
              placeholder="Search issue, serial, or related case"
              value={filters.search}
            />
          </div>
        </div>
      </section>

      {reportsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className={cn("h-64 animate-pulse rounded-[28px]", isDark ? "bg-slate-800" : "bg-slate-100")} key={index} />
          ))}
        </div>
      ) : reportsQuery.isError ? (
        <div
          className={cn(
            "rounded-[28px] border px-6 py-8 text-sm leading-7",
            isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600"
          )}
        >
          Could not load Helarpedia entries right now.
        </div>
      ) : materials.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {materials.map((material) => (
              <article
                className={cn(
                  "rounded-[28px] border p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]",
                  isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
                )}
                key={material.id}
              >
                {(() => {
                  const contentKey = `HELARPEDIA:${material.id}`;
                  const activeBookmark = bookmarks.find((bookmark) => bookmark.contentKey === contentKey);

                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em]", isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
                          {material.reportNumber ? `Serial: ${material.reportNumber}` : "Serial number pending"}
                        </span>
                        <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs", isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
                          {material.estimatedMins ? `${material.estimatedMins} min read` : "Read time pending"}
                        </span>
                      </div>

                      <h3 className={cn("mt-4 font-heading text-2xl leading-tight", isDark ? "text-white" : "text-slate-950")}>{material.title}</h3>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className={cn("rounded-[20px] border p-3", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                          <div className="flex items-center gap-2">
                            <BookOpenText className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
                            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Updated</p>
                          </div>
                          <p className={cn("mt-2 text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>{formatDate(material.reportDate)}</p>
                        </div>

                        <div className={cn("rounded-[20px] border p-3", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                          <div className="flex items-center gap-2">
                            <ExternalLink className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
                            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Cross-ref</p>
                          </div>
                          <p className={cn("mt-2 line-clamp-1 text-sm font-medium break-all", isDark ? "text-white" : "text-slate-950")}>{material.storageUrl || "—"}</p>
                        </div>
                      </div>

                      {stripHtml(material.summary) ? (
                        // Render formatted rich text preview for the Definition/Summary section
                        // with controlled height to maintain consistent card layouts.
                        <div
                          className={cn(
                            "mt-4 overflow-hidden text-sm leading-7 rich-text-preview rich-text-content",
                            isDark ? "text-slate-300" : "text-slate-600"
                          )}
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 6,
                            WebkitBoxOrient: "vertical",
                            maxHeight: "10.5rem",
                            overflow: "hidden"
                          }}
                          dangerouslySetInnerHTML={{ __html: material.summary }}
                        />
                      ) : (
                        <p className={cn("mt-4 line-clamp-4 text-sm leading-7 italic", isDark ? "text-slate-500" : "text-slate-400")}>
                          No definition has been added for this Helarpedia entry yet.
                        </p>
                      )}

                      <div className="mt-5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <BookmarkButton
                            active={Boolean(activeBookmark)}
                            isDark={isDark}
                            onClick={() => {
                              if (activeBookmark) {
                                deleteBookmarkMutation.mutate(activeBookmark.id);
                                return;
                              }

                              createBookmarkMutation.mutate({
                                contentKey,
                                contentType: "HELARPEDIA",
                                path: `/app/library/helarpedia/${material.id}`,
                                title: material.title
                              });
                            }}
                          />
                        </div>
                        <Link
                          className={cn(
                            "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                            isDark
                              ? "border-slate-700 bg-slate-950 text-white hover:border-slate-600"
                              : "border-slate-300 bg-white text-slate-950 shadow-sm hover:border-slate-400 hover:bg-slate-50"
                          )}
                          to={`/app/library/helarpedia/${material.id}`}
                        >
                          Open
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                    </>
                  );
                })()}
              </article>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
              Page {reportsQuery.data?.pagination.page ?? 1} of {reportsQuery.data?.pagination.totalPages ?? 1}
            </p>
            <div className="flex items-center gap-2">
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                  isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900 shadow-sm"
                )}
                disabled={(reportsQuery.data?.pagination.page ?? 1) <= 1}
                onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                  isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900 shadow-sm"
                )}
                disabled={(reportsQuery.data?.pagination.page ?? 1) >= (reportsQuery.data?.pagination.totalPages ?? 1)}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: Math.min(reportsQuery.data?.pagination.totalPages ?? current.page, current.page + 1)
                  }))
                }
                type="button"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div
          className={cn(
            "rounded-[28px] border px-6 py-8 text-sm leading-7",
            isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600"
          )}
        >
          No Helarpedia entries match the current search yet.
        </div>
      )}
    </div>
  );
}

export function StudentSubjectSummariesPage() {
  const { isDark } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCaseType: SubjectSummaryCaseType = (() => {
    const value = (searchParams.get("caseType") ?? "").trim().toLowerCase();
    if (value === "handbook") return "HANDBOOK";
    if (value === "textbook" || value === "textbooks") return "TEXTBOOK";
    return "TEXTBOOK";
  })();
  const hierarchySummaryQuery = useQuery({
    queryFn: () => fetchPublishedSubjectSummaryHierarchy({ caseType: "all" }),
    queryKey: queryKeys.subjectSummaryPublishedHierarchy({ caseType: "all" })
  });

  const [caseFilters, setCaseFilters] = useState(() => ({
    page: 1,
    pageSize: 10,
    search: "",
    subjectId: "",
    topicId: ""
  }));
  useEffect(() => {
    setCaseFilters((current) => ({
      ...current,
      page: 1,
      subjectId: "",
      topicId: ""
    }));
  }, [selectedCaseType]);

  const casesQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchPublishedSubjectSummaryCases({
        caseType: selectedCaseType,
        page: caseFilters.page,
        pageSize: caseFilters.pageSize,
        search: caseFilters.search,
        sortBy: "updatedAt",
        sortOrder: "desc",
        subjectId: caseFilters.subjectId || undefined,
        topicId: caseFilters.topicId || undefined
      }),
    queryKey: queryKeys.subjectSummaryPublishedCases({
      caseType: selectedCaseType,
      page: caseFilters.page,
      pageSize: caseFilters.pageSize,
      search: caseFilters.search,
      sortBy: "updatedAt",
      sortOrder: "desc",
      subjectId: caseFilters.subjectId,
      topicId: caseFilters.topicId
    })
  });

  const subjects = casesQuery.data?.subjects ?? [];
  const topics = casesQuery.data?.topics ?? [];
  const filteredTopics = topics.filter((topic) => !caseFilters.subjectId || topic.subjectId === caseFilters.subjectId);
  const visibleRows = (casesQuery.data?.items ?? []).filter((item) => matchesCaseTypeLabel(item.jurisdiction, selectedCaseType));
  const handbookTotalCases = hierarchySummaryQuery.data?.summary?.handbookCases ?? 0;
  const textbookTotalCases = hierarchySummaryQuery.data?.summary?.textbookCases ?? 0;
  const activeTotalCases = casesQuery.data?.summary.totalCases ?? 0;
  const handbookDisplayedCases = selectedCaseType === "HANDBOOK" ? activeTotalCases : handbookTotalCases;
  const textbookDisplayedCases = selectedCaseType === "TEXTBOOK" ? activeTotalCases : textbookTotalCases;
  const summaryText = useMemo(
    () =>
      `${activeTotalCases} published case${activeTotalCases === 1 ? "" : "s"} currently available in the ${selectedCaseType === "HANDBOOK" ? "Handbook" : "Textbook"} collection.`,
    [activeTotalCases, selectedCaseType]
  );

  return (
    <div className="space-y-6">
      <section
        className={cn(
          "relative z-20 overflow-visible rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:p-7",
          isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Student library</p>
            <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
              Explore published {selectedCaseType === "HANDBOOK" ? "handbook" : "textbook"} cases and ratios.
            </h2>
            <p className={cn("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>{summaryText}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          { label: "Handbook Cases", value: handbookDisplayedCases },
          { label: "Textbook Cases", value: textbookDisplayedCases }
        ].map((item) => (
          <div
            className={cn("rounded-[24px] border px-5 py-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}
            key={item.label}
          >
            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
            <p className={cn("mt-3 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className={cn("rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Cases</p>
            <h3 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>
              {selectedCaseType === "HANDBOOK" ? "Handbook" : "Textbook"} cases
            </h3>
          </div>
          <div className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm", isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
            <BookOpenText className="h-4 w-4" />
            Published items only
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <input
            className={cn("rounded-2xl border px-4 py-3 text-sm outline-none md:col-span-2", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
            onChange={(event) => setCaseFilters((current) => ({ ...current, page: 1, search: event.target.value }))}
            placeholder="Search cases"
            value={caseFilters.search}
          />
          <select
            className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
            onChange={(event) => {
              const nextCaseType = event.target.value as SubjectSummaryCaseType;
              const nextParams = new URLSearchParams(searchParams);
              nextParams.set("caseType", nextCaseType);
              nextParams.delete("subjectId");
              nextParams.delete("topicId");
              setSearchParams(nextParams, { replace: true });
            }}
            value={selectedCaseType}
          >
            <option value="HANDBOOK">Handbook</option>
            <option value="TEXTBOOK">Textbook</option>
          </select>
          <select
            className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
            onChange={(event) => setCaseFilters((current) => ({ ...current, page: 1, subjectId: event.target.value, topicId: "" }))}
            value={caseFilters.subjectId}
          >
            <option value="">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <select
            className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
            onChange={(event) => setCaseFilters((current) => ({ ...current, page: 1, topicId: event.target.value }))}
            value={caseFilters.topicId}
          >
            <option value="">All topics</option>
            {filteredTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 overflow-x-auto">
          {casesQuery.isLoading ? (
            <div className={cn("rounded-[24px] border px-6 py-8 text-sm", isDark ? "border-slate-800 bg-slate-950 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-600")}>
              Loading cases...
            </div>
          ) : casesQuery.isError ? (
            <div className={cn("rounded-[24px] border px-6 py-8 text-sm leading-7", isDark ? "border-rose-500/25 bg-rose-500/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-700")}>
              Could not load published {selectedCaseType === "HANDBOOK" ? "handbook" : "textbook"} cases right now. Please refresh the page.
            </div>
          ) : visibleRows.length ? (
            <table className={cn("min-w-full text-left text-sm", isDark ? "text-slate-200" : "text-slate-700")}>
              <thead className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => (
                  <tr className={cn("border-t", isDark ? "border-slate-800" : "border-slate-100")} key={item.id}>
                    <td className="px-4 py-4">
                      <div className="min-w-[240px]">
                        <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                        <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{item.citation || item.court || "No citation."}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">{item.jurisdiction || (selectedCaseType === "HANDBOOK" ? "Handbook" : "Textbook")}</td>
                    <td className="px-4 py-4">{item.subject.name}</td>
                    <td className="px-4 py-4">{item.topic.name}</td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                          isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        )}
                      >
                        Published
                      </span>
                    </td>
                    <td className="px-4 py-4">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-4">{formatDate(item.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <Link
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm transition",
                          isDark
                            ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:bg-slate-900"
                            : "border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                        )}
                        to={`/app/library/subject-summaries/cases/${item.id}?caseType=${selectedCaseType}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={cn("rounded-[24px] border px-6 py-8 text-sm leading-7", isDark ? "border-slate-800 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
              No published {selectedCaseType === "HANDBOOK" ? "handbook" : "textbook"} cases are available yet.
            </div>
          )}
        </div>

        {casesQuery.data ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
              Page {casesQuery.data.pagination.page} of {casesQuery.data.pagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                  isDark ? "border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                )}
                disabled={casesQuery.data.pagination.page <= 1}
                onClick={() => setCaseFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                  isDark ? "border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                )}
                disabled={casesQuery.data.pagination.page >= casesQuery.data.pagination.totalPages}
                onClick={() =>
                  setCaseFilters((current) => ({
                    ...current,
                    page: Math.min(casesQuery.data.pagination.totalPages, current.page + 1)
                  }))
                }
                type="button"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
