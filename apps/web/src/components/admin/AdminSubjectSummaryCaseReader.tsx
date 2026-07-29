import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpenText, Bookmark, ExternalLink, Tag } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  createStudentStudyBookmark,
  deleteStudentStudyBookmark,
  fetchStudentStudyBookmarks,
  fetchPublishedSubjectSummaryCaseDetail,
  fetchStudentStudyProgress,
  fetchSubjectSummaryCaseDetail,
  recordStudentStudyDownload,
  saveStudentStudyProgress
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function Section({
  children,
  isDark,
  title
}: {
  children: React.ReactNode;
  isDark: boolean;
  title: string;
}) {
  return (
    <section className={cn("rounded-[28px] border p-6", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>{title}</p>
      <div className={cn("mt-4 text-sm leading-7", isDark ? "text-slate-200" : "text-slate-700")}>{children}</div>
    </section>
  );
}

function ArraySection({
  isDark,
  items,
  title
}: {
  isDark: boolean;
  items: string[];
  title: string;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <Section isDark={isDark} title={title}>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            className={cn(
              "inline-flex rounded-full border px-3 py-1.5 text-sm",
              isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
            )}
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
    </Section>
  );
}

export function AdminSubjectSummaryCaseReader() {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const isStudentReader = location.pathname.startsWith("/app/library/");
  const backPath = isStudentReader ? "/app/library/subject-summaries" : "/app/admin/library/subject-summaries";
  const backLabel = isStudentReader ? "Back to subject summaries" : "Back to hierarchy";
  const hasRestoredStudyProgressRef = useRef(false);
  const caseQuery = useQuery({
    enabled: Boolean(caseId),
    queryFn: () =>
      isStudentReader ? fetchPublishedSubjectSummaryCaseDetail(String(caseId)) : fetchSubjectSummaryCaseDetail(String(caseId)),
    queryKey: queryKeys.subjectSummaryCaseDetail(String(caseId))
  });
  const studyProgressQuery = useQuery({
    enabled: isStudentReader && Boolean(caseId),
    queryFn: () => fetchStudentStudyProgress(`SUBJECT_SUMMARY_CASE:${caseId}`),
    queryKey: queryKeys.studentStudyProgress(`SUBJECT_SUMMARY_CASE:${caseId}`)
  });
  const bookmarksQuery = useQuery({
    enabled: isStudentReader,
    queryFn: () => fetchStudentStudyBookmarks({}),
    queryKey: queryKeys.studentStudyBookmarks({})
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

  useEffect(() => {
    hasRestoredStudyProgressRef.current = false;
  }, [caseId]);

  const item = caseQuery.data ?? null;
  const activeBookmark = item
    ? bookmarksQuery.data?.items.find((bookmark) => bookmark.contentKey === `SUBJECT_SUMMARY_CASE:${item.id}`)
    : undefined;

  useEffect(() => {
    if (!isStudentReader || !item || hasRestoredStudyProgressRef.current || !studyProgressQuery.data) {
      return;
    }

    hasRestoredStudyProgressRef.current = true;
    const progress = studyProgressQuery.data.scrollProgressPct;
    const maxScrollableDistance = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.requestAnimationFrame(() => {
      window.scrollTo({
        behavior: "auto",
        top: (progress / 100) * maxScrollableDistance
      });
    });
  }, [isStudentReader, item, studyProgressQuery.data]);

  useEffect(() => {
    if (!isStudentReader || !item) {
      return;
    }

    let isCancelled = false;
    let visibleMs = 0;
    let lastTick = Date.now();

    const syncVisibleMs = () => {
      if (document.visibilityState === "visible") {
        visibleMs += Date.now() - lastTick;
      }

      lastTick = Date.now();
    };

    const flushProgress = () => {
      syncVisibleMs();

      if (isCancelled) {
        return;
      }

      const maxScrollableDistance = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const scrollProgressPct = Math.max(0, Math.min(100, (window.scrollY / maxScrollableDistance) * 100));

      void saveStudentStudyProgress({
        contentKey: `SUBJECT_SUMMARY_CASE:${item.id}`,
        contentType: "SUBJECT_SUMMARY_CASE",
        lastPositionLabel: `${Math.round(scrollProgressPct)}% through case`,
        path: `/app/library/subject-summaries/cases/${item.id}`,
        readingProgressPct: scrollProgressPct,
        scrollProgressPct,
        subjectName: item.subject.name,
        timeSpentSeconds: Math.round(visibleMs / 1000),
        title: item.title,
        topicName: item.topic.name
      });
    };

    const intervalId = window.setInterval(flushProgress, 15000);
    const handleVisibilityChange = () => {
      syncVisibleMs();

      if (document.visibilityState === "hidden") {
        flushProgress();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", flushProgress);

    return () => {
      flushProgress();
      isCancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", flushProgress);
      window.clearInterval(intervalId);
    };
  }, [isStudentReader, item]);

  if (caseQuery.isLoading) {
    return <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading case details...</p>;
  }

  if (!item) {
    return <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>This case could not be found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700")} to={backPath}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
            <span className={cn("text-sm", isDark ? "text-slate-500" : "text-slate-400")}>
              {item.subject.name} / {item.topic.name}
            </span>
          </div>
          <h2 className={cn("font-heading text-4xl leading-tight", isDark ? "text-white" : "text-slate-950")}>{item.title}</h2>
          <div className="flex flex-wrap items-center gap-3">
            {item.citation ? (
              <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-sm", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700")}>
                {item.citation}
              </span>
            ) : null}
            {item.court ? (
              <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-sm", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700")}>
                {item.court}
              </span>
            ) : null}
            {item.year ? (
              <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-sm", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700")}>
                {item.year}
              </span>
            ) : null}
            {isStudentReader ? (
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                  activeBookmark
                    ? isDark
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                    : isDark
                      ? "border-slate-700 bg-slate-900 text-slate-200"
                      : "border-slate-200 bg-white text-slate-700"
                )}
                onClick={() => {
                  if (activeBookmark) {
                    deleteBookmarkMutation.mutate(activeBookmark.id);
                    return;
                  }

                  createBookmarkMutation.mutate({
                    contentKey: `SUBJECT_SUMMARY_CASE:${item.id}`,
                    contentType: "SUBJECT_SUMMARY_CASE",
                    path: `/app/library/subject-summaries/cases/${item.id}`,
                    subjectName: item.subject.name,
                    title: item.title,
                    topicName: item.topic.name
                  });
                }}
                type="button"
              >
                <Bookmark className="h-4 w-4" />
                {activeBookmark ? "Saved" : "Bookmark"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Subject", value: item.subject.name, icon: BookOpenText },
          { label: "Topic", value: item.topic.name, icon: BookOpenText },
          { label: "Status", value: item.status, icon: Tag },
          { label: "Jurisdiction", value: item.jurisdiction || "Not set", icon: Tag }
        ].map((entry) => {
          const Icon = entry.icon;

          return (
            <article className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")} key={entry.label}>
              <div className="flex items-center gap-3">
                <div className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700")}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>{entry.label}</p>
                  <p className={cn("mt-2 text-base font-medium", isDark ? "text-white" : "text-slate-950")}>{entry.value}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {isStudentReader && item.isPreview ? (
        <section
          className={cn(
            "rounded-[28px] border px-6 py-5",
            isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800"
          )}
        >
          <p className="text-xs uppercase tracking-[0.2em]">Preview only</p>
          <h3 className="mt-3 text-lg font-semibold">This case is limited to a short preview.</h3>
          <p className="mt-2 text-sm leading-7">
            {item.upgradeMessage} You can read up to {item.previewWordLimit} words of published case content until a subscription is active.
          </p>
          <Link className="mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-medium" to="/app/subscription">
            Upgrade access
          </Link>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {item.caseSummary ? <Section isDark={isDark} title="Case Summary">{item.caseSummary}</Section> : null}
        {item.facts ? <Section isDark={isDark} title="Facts">{item.facts}</Section> : null}
        {item.issues ? <Section isDark={isDark} title="Issues">{item.issues}</Section> : null}
        {item.decisionHolding ? <Section isDark={isDark} title="Decision / Holding">{item.decisionHolding}</Section> : null}
        {item.ratioDecidendi ? <Section isDark={isDark} title="Ratio Decidendi">{item.ratioDecidendi}</Section> : null}
        {item.obiterDicta ? <Section isDark={isDark} title="Obiter Dicta">{item.obiterDicta}</Section> : null}
      </div>

      <ArraySection isDark={isDark} items={item.judges} title="Judge(s)" />
      <ArraySection isDark={isDark} items={item.legalPrinciples} title="Legal Principles" />
      <ArraySection isDark={isDark} items={item.relatedStatutes} title="Related Statutes" />
      <ArraySection isDark={isDark} items={item.relatedCases} title="Related Cases" />
      <ArraySection isDark={isDark} items={item.keywords} title="Keywords / Tags" />

      {item.attachments.length ? (
        <Section isDark={isDark} title="Attachments">
          <div className="space-y-3">
            {item.attachments.map((attachment) => (
              <a
                className={cn("flex items-center justify-between rounded-[20px] border px-4 py-3 transition", isDark ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300")}
                href={attachment}
                key={attachment}
                onClick={() => {
                  if (!isStudentReader) {
                    return;
                  }

                  void recordStudentStudyDownload({
                    contentKey: `SUBJECT_SUMMARY_CASE:${item.id}:attachment:${attachment}`,
                    contentType: "SUBJECT_SUMMARY_CASE",
                    fileName: attachment.split("/").pop() || item.title,
                    path: attachment,
                    subjectName: item.subject.name,
                    title: item.title,
                    topicName: item.topic.name
                  });
                }}
                rel="noreferrer"
                target="_blank"
              >
                <span className="truncate">{attachment}</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
            ))}
          </div>
        </Section>
      ) : null}

      {item.externalReferences.length ? (
        <Section isDark={isDark} title="External References">
          <div className="space-y-3">
            {item.externalReferences.map((reference) => (
              <a
                className={cn("flex items-center justify-between rounded-[20px] border px-4 py-3 transition", isDark ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300")}
                href={reference}
                key={reference}
                rel="noreferrer"
                target="_blank"
              >
                <span className="truncate">{reference}</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
