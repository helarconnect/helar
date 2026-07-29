import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Clock3,
  Flame,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { fetchSubscriptionSnapshot } from "@/lib/api";
import {
  deleteStudentStudyBookmark,
  fetchStudentStudyBookmarks,
  fetchStudentStudyCenterDashboard,
  fetchStudentStudyDownloads,
  searchStudentStudyCenter
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

type ToastTone = "error" | "success";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function formatHours(seconds: number) {
  return `${(seconds / 3600).toFixed(seconds >= 3600 ? 1 : 2)}h`;
}

function formatExpiryCountdown(daysUntilExpiry: number | null) {
  if (daysUntilExpiry === null) {
    return "No active plan";
  }

  if (daysUntilExpiry <= 0) {
    return "Expires today";
  }

  if (daysUntilExpiry === 1) {
    return "1 day left";
  }

  return `${daysUntilExpiry} days left`;
}

function formatMinutes(seconds: number) {
  if (seconds <= 0) {
    return "0 min";
  }

  if (seconds < 3600) {
    return `${Math.max(1, Math.round(seconds / 60))} min`;
  }

  return formatHours(seconds);
}

function formatStudyContentType(contentType: string) {
  switch (contentType) {
    case "LAW_REPORT":
      return "Law report";
    case "SUBJECT_SUMMARY_CASE":
      return "Case";
    case "SUBJECT_SUMMARY_ENTRY":
      return "Summary entry";
    case "SUBJECT_SUMMARY_SUBJECT":
      return "Subject";
    case "SUBJECT_SUMMARY_TOPIC":
      return "Topic";
    case "STATUTE":
      return "Statute";
    case "REVISION_MATERIAL":
      return "Revision material";
    default:
      return "Reading item";
  }
}

function getBadgeToneClasses(tone: "amber" | "blue" | "emerald", isDark: boolean) {
  if (tone === "emerald") {
    return isDark
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "amber") {
    return isDark
      ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
      : "border-amber-200 bg-amber-50 text-amber-800";
  }

  return isDark ? "border-sky-500/20 bg-sky-500/10 text-sky-100" : "border-sky-200 bg-sky-50 text-sky-800";
}

function DashboardCard({
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

function SectionHeading({
  eyebrow,
  isDark,
  title
}: {
  eyebrow: string;
  isDark: boolean;
  title: string;
}) {
  return (
    <div>
      <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>{eyebrow}</p>
      <h3 className={cn("mt-2 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>{title}</h3>
    </div>
  );
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

export function StudentDashboardPage() {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const learnerName = session?.user.fullName.split(" ")[0] ?? "Adaeze";
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([]);
  const [bookmarkSearch, setBookmarkSearch] = useState("");
  const [bookmarkSort, setBookmarkSort] = useState<"date" | "subject" | "title" | "topic">("date");
  const [globalSearch, setGlobalSearch] = useState("");
  const [timelinePage, setTimelinePage] = useState(0);

  const dashboardQuery = useQuery({
    queryFn: fetchStudentStudyCenterDashboard,
    queryKey: queryKeys.studentStudyCenter
  });
  const bookmarksQuery = useQuery({
    queryFn: () => fetchStudentStudyBookmarks({ search: bookmarkSearch, sortBy: bookmarkSort }),
    queryKey: queryKeys.studentStudyBookmarks({ search: bookmarkSearch, sortBy: bookmarkSort })
  });
  const downloadsQuery = useQuery({
    queryFn: () => fetchStudentStudyDownloads(""),
    queryKey: queryKeys.studentStudyDownloads("")
  });
  const searchQuery = useQuery({
    enabled: globalSearch.trim().length >= 2,
    queryFn: () => searchStudentStudyCenter(globalSearch),
    queryKey: queryKeys.studentStudySearch(globalSearch)
  });
  const subscriptionSnapshotQuery = useQuery({
    queryFn: fetchSubscriptionSnapshot,
    queryKey: queryKeys.subscriptionSnapshot
  });

  function showToast(message: string, tone: ToastTone) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  async function refreshStudyQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyCenter }),
      queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyBookmarks({}) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyDownloads("") })
    ]);
  }

  const deleteBookmarkMutation = useMutation({
    mutationFn: deleteStudentStudyBookmark,
    onSuccess: async () => {
      showToast("Bookmark removed.", "success");
      await refreshStudyQueries();
    },
    onError: () => showToast("Could not remove the bookmark.", "error")
  });

  const dashboard = dashboardQuery.data;
  const activeSubscription = subscriptionSnapshotQuery.data?.activeSubscription ?? null;
  const recentlyOpened = dashboard?.recentlyOpened.slice(0, 5) ?? [];
  const recentlyViewedCases = dashboard?.recentlyViewedCases.slice(0, 5) ?? [];
  const timeline = dashboard?.timeline ?? [];
  const timelinePageSize = 8;
  const timelineTotalPages = Math.max(1, Math.ceil(timeline.length / timelinePageSize));
  const timelinePageSafe = Math.min(timelinePage, timelineTotalPages - 1);
  const timelineItems = timeline.slice(timelinePageSafe * timelinePageSize, (timelinePageSafe + 1) * timelinePageSize);
  const frequencyPeakSeconds = useMemo(
    () => Math.max(...(dashboard?.frequency.dailyActivity.map((item) => item.seconds) ?? [0])),
    [dashboard?.frequency.dailyActivity]
  );

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />

      <div className="space-y-6">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(254,83,61,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(206,160,95,0.16),transparent_24%),linear-gradient(135deg,#111b32_0%,#162545_58%,#1e3157_100%)] p-8 text-white shadow-[0_32px_100px_rgba(15,23,42,0.18)] lg:p-10">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60">Reading & Study Center</p>
            <h2 className="mt-4 max-w-3xl font-heading text-3xl leading-tight text-white lg:text-[2.65rem]">
              Welcome back, {learnerName}. Resume reading and keep your study rhythm visible.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/72">
              Your dashboard tracks active reading, recent sessions, bookmarks, study badges, and weekly consistency across your library sessions.
            </p>

            {activeSubscription ? (
              <div
                className={cn(
                  "mt-6 flex flex-wrap items-start justify-between gap-4 rounded-[24px] border px-5 py-4 backdrop-blur-sm",
                  activeSubscription.shouldShowExpiryReminder
                    ? "border-amber-300/30 bg-amber-400/10"
                    : "border-white/10 bg-white/8"
                )}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/65">Subscription status</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{activeSubscription.plan.name}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                    {activeSubscription.shouldShowExpiryReminder
                      ? activeSubscription.expiryReminderMessage
                      : `Your subscription is active and expires on ${formatDateTime(activeSubscription.endsAt ?? activeSubscription.startsAt)}.`}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0f1a31]/70 px-4 py-3 text-sm font-semibold text-white">
                  {formatExpiryCountdown(activeSubscription.daysUntilExpiry)}
                </div>
              </div>
            ) : null}

            <div className="relative mt-8 max-w-2xl">
              <div className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
                <Search className="h-4 w-4 text-white/70" />
                <input
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/50"
                  onChange={(event) => setGlobalSearch(event.target.value)}
                    placeholder={dashboard?.unifiedSearchPlaceholder ?? "Search bookmarks, downloads, and reading history"}
                  value={globalSearch}
                />
              </div>
              {searchQuery.data?.items.length ? (
                <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-[24px] border border-white/10 bg-[#12203d] shadow-[0_20px_60px_rgba(15,23,42,0.24)]">
                  {searchQuery.data.items.map((item) => (
                    <button
                      className="flex w-full items-start justify-between gap-3 border-b border-white/10 px-4 py-3 text-left last:border-b-0 hover:bg-white/5"
                      key={`${item.kind}-${item.id}`}
                      onClick={() => {
                        setGlobalSearch("");
                        navigate(item.path);
                      }}
                      type="button"
                    >
                      <div>
                        <p className="font-medium text-white">{item.label}</p>
                        <p className="mt-1 text-sm text-white/65">{item.meta || item.kind}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs uppercase text-white/65">{item.kind}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { icon: Flame, label: "Study streak", value: `${dashboard?.frequency.streakDays ?? 0} days` },
                { icon: Clock3, label: "Weekly reading", value: formatHours(dashboard?.readingDuration.weeklySeconds ?? 0) },
                { icon: Sparkles, label: "Tracked items", value: String(dashboard?.progress.totalTrackedItems ?? 0) }
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <article className="rounded-[22px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm" key={item.label}>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-[color:var(--color-accent-strong)]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-2xl font-semibold text-white">{item.value}</p>
                        <p className="text-sm text-white/62">{item.label}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <DashboardCard isDark={isDark}>
            <SectionHeading eyebrow="Continue reading" isDark={isDark} title="Pick up where you stopped" />
            {dashboard?.continueReading ? (
              <div className="mt-6 space-y-4">
                <div className={cn("rounded-[22px] border p-5", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    {dashboard.continueReading.subjectName || "Library material"}
                  </p>
                  <h4 className={cn("mt-2 text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{dashboard.continueReading.title}</h4>
                  <p className={cn("mt-2 text-sm leading-6", isDark ? "text-slate-400" : "text-slate-600")}>
                    {dashboard.continueReading.topicName || dashboard.continueReading.lastPositionLabel || "Saved position available"}
                  </p>
                  <div className={cn("mt-4 h-2 overflow-hidden rounded-full", isDark ? "bg-slate-700" : "bg-slate-200")}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[color:var(--color-accent)] to-[color:var(--color-accent-strong)]"
                      style={{ width: `${Math.max(dashboard.continueReading.readingProgressPct, 4)}%` }}
                    />
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                      {dashboard.continueReading.readingProgressPct.toFixed(0)}% read
                    </span>
                    <Link
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                        isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-950 shadow-sm"
                      )}
                      to={dashboard.continueReading.path}
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                {dashboard.lastStudiedTopic ? (
                  <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                    <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>Last studied topic</p>
                    <p className={cn("mt-2 text-base font-semibold", isDark ? "text-white" : "text-slate-950")}>
                      {dashboard.lastStudiedTopic.topicName || dashboard.lastStudiedTopic.title}
                    </p>
                    <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                      {dashboard.lastStudiedTopic.subjectName || "Subject summary"} • {formatDateTime(dashboard.lastStudiedTopic.lastOpenedAt)}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={cn("mt-6 text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>
                Open a law report or published case and your continue-reading card will appear here automatically.
              </p>
            )}
          </DashboardCard>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Today", value: formatHours(dashboard?.readingDuration.todaySeconds ?? 0) },
            { label: "This week", value: formatHours(dashboard?.readingDuration.weeklySeconds ?? 0) },
            { label: "This month", value: formatHours(dashboard?.readingDuration.monthlySeconds ?? 0) },
            { label: "Lifetime", value: formatHours(dashboard?.readingDuration.totalSeconds ?? 0) }
          ].map((item) => (
            <DashboardCard isDark={isDark} key={item.label}>
              <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label} reading</p>
              <p className={cn("mt-3 text-3xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
            </DashboardCard>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
          <DashboardCard isDark={isDark}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SectionHeading eyebrow="Reading timeline" isDark={isDark} title="Recent study sessions" />
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full border px-4 py-2 text-sm", isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
                  {dashboard?.frequency.mostActiveStudyDay ?? "No activity yet"}
                </span>
                <button
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition",
                    isDark ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600" : "border-slate-200 bg-white text-slate-900 shadow-sm hover:border-slate-300"
                  )}
                  disabled={timelinePageSafe <= 0}
                  onClick={() => setTimelinePage((current) => Math.max(0, current - 1))}
                  title="Previous sessions"
                  type="button"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition",
                    isDark ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600" : "border-slate-200 bg-white text-slate-900 shadow-sm hover:border-slate-300"
                  )}
                  disabled={timelinePageSafe >= timelineTotalPages - 1}
                  onClick={() => setTimelinePage((current) => Math.min(timelineTotalPages - 1, current + 1))}
                  title="Next sessions"
                  type="button"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {timelineItems.length ? (
                timelineItems.map((item) => (
                  <Link
                    className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[22px] border px-4 py-4 transition", isDark ? "border-slate-700 bg-slate-800 hover:border-slate-600" : "border-slate-200 bg-slate-50 hover:border-slate-300")}
                    key={item.id}
                    to={item.path}
                  >
                    <div className="max-w-2xl">
                      <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                      <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                          {formatStudyContentType(item.contentType)} • {formatDateTime(item.lastOpenedAt)} • {formatMinutes(item.durationSeconds)}
                      </p>
                        <p className={cn("mt-2 text-sm", isDark ? "text-slate-500" : "text-slate-500")}>{item.lastPositionLabel || item.status}</p>
                    </div>
                      <div className="min-w-[92px] text-right">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-3 py-1 text-xs",
                            item.status === "Completed"
                              ? isDark
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : isDark
                                ? "border-slate-600 text-slate-300"
                                : "border-slate-200 text-slate-600"
                          )}
                        >
                          {item.status}
                        </span>
                        <p className={cn("mt-2 text-xs font-medium", isDark ? "text-slate-400" : "text-slate-500")}>{item.progressPct.toFixed(0)}% read</p>
                      </div>
                  </Link>
                ))
              ) : (
                <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>
                  Your reading timeline will fill in as you study library materials.
                </p>
              )}
            </div>
          </DashboardCard>

          <div className="space-y-5">
            <DashboardCard isDark={isDark}>
              <SectionHeading eyebrow="Reading frequency" isDark={isDark} title="Consistency snapshot" />
                {(dashboard?.frequency.dailyActivity.length ?? 0) > 0 ? (
                  <div className="mt-6 grid grid-cols-7 gap-2">
                    {(dashboard?.frequency.dailyActivity ?? []).map((item) => {
                      const height = frequencyPeakSeconds > 0 ? Math.max(18, (item.seconds / frequencyPeakSeconds) * 110) : 18;

                      return (
                        <div className="flex flex-col items-center gap-2" key={item.date}>
                          <div className={cn("flex h-32 w-full items-end rounded-[20px] border px-2 py-2", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")}>
                            <div
                              className="w-full rounded-2xl bg-gradient-to-t from-[color:var(--color-accent-strong)] to-[color:var(--color-accent)]"
                              style={{ height }}
                            />
                          </div>
                          <div className="text-center">
                            <p className={cn("text-xs font-medium", isDark ? "text-white" : "text-slate-950")}>{item.label}</p>
                            <p className={cn("text-[11px]", isDark ? "text-slate-400" : "text-slate-500")}>{item.sessionCount} sessions</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={cn("mt-6 text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>
                    Your weekly reading chart will appear after you open and study materials in the library.
                  </p>
                )}
                <div className="mt-5 grid gap-3">
                {[
                  { label: "Streak", value: `${dashboard?.frequency.streakDays ?? 0} days` },
                  { label: "Days this week", value: String(dashboard?.frequency.daysStudiedThisWeek ?? 0) },
                  { label: "Days this month", value: String(dashboard?.frequency.daysStudiedThisMonth ?? 0) },
                  { label: "Avg sessions / week", value: String(dashboard?.frequency.averageStudySessionsPerWeek ?? 0) }
                ].map((item) => (
                  <div className={cn("rounded-[20px] border p-4", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                    <p className={cn("mt-2 text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                  </div>
                ))}
              </div>
            </DashboardCard>

            <DashboardCard isDark={isDark}>
              <SectionHeading eyebrow="Achievements" isDark={isDark} title="Study badges" />
                <div className="mt-6 space-y-3">
                {dashboard?.achievements.length ? (
                  dashboard.achievements.map((badge) => (
                      <article className={cn("rounded-[22px] border p-4", getBadgeToneClasses(badge.tone, isDark))} key={`${badge.label}-${badge.description}`}>
                        <p className="text-sm font-semibold">{badge.label}</p>
                        <p className="mt-2 text-sm leading-6 opacity-90">{badge.description}</p>
                      </article>
                  ))
                ) : (
                  <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>
                      Your badges will appear as your reading streak and study activity build up.
                  </p>
                )}
              </div>
            </DashboardCard>
          </div>
        </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <DashboardCard isDark={isDark}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SectionHeading eyebrow="Bookmarks" isDark={isDark} title="Saved reading references" />
              <div className="flex flex-wrap gap-2">
                <input
                  className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                  onChange={(event) => setBookmarkSearch(event.target.value)}
                  placeholder="Search bookmarks"
                  value={bookmarkSearch}
                />
                <select
                  className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                  onChange={(event) => setBookmarkSort(event.target.value as typeof bookmarkSort)}
                  value={bookmarkSort}
                >
                  <option value="date">Sort by date</option>
                  <option value="title">Sort by title</option>
                  <option value="subject">Sort by subject</option>
                  <option value="topic">Sort by topic</option>
                </select>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {bookmarksQuery.data?.items.length ? (
                bookmarksQuery.data.items.map((item) => (
                  <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[22px] border px-4 py-4", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")} key={item.id}>
                    <Link className="min-w-0 flex-1" to={item.path}>
                      <p className={cn("truncate font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                      <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                        {[item.subjectName, item.topicName].filter(Boolean).join(" / ") || formatDateTime(item.createdAt)}
                      </p>
                    </Link>
                    <button
                      className={cn("inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition", isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900 shadow-sm")}
                      onClick={() => deleteBookmarkMutation.mutate(item.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>
                  Bookmark law reports, subjects, topics, or cases and they will appear here.
                </p>
              )}
            </div>
          </DashboardCard>

          <DashboardCard isDark={isDark}>
              <SectionHeading eyebrow="Study progress" isDark={isDark} title="Current momentum" />
              <div className="mt-6 space-y-3">
                {[
                  {
                    icon: BookOpenText,
                    label: "In progress",
                    value: String(dashboard?.progress.inProgressItems ?? 0)
                  },
                  {
                    icon: Sparkles,
                    label: "Completed items",
                    value: String(dashboard?.progress.completedItems ?? 0)
                  },
                  {
                    icon: Flame,
                    label: "Bookmarks saved",
                    value: String(dashboard?.bookmarks.total ?? 0)
                  },
                  {
                    icon: Clock3,
                    label: "Downloads tracked",
                    value: String(dashboard?.downloads.total ?? 0)
                  }
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div className={cn("flex items-center gap-3 rounded-[22px] border p-4", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")} key={item.label}>
                      <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-slate-950 text-slate-200" : "bg-white text-slate-700 shadow-sm")}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                        <p className={cn("mt-2 text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                    </div>
                    </div>
                  );
                })}
                {dashboard?.continueReading ? (
                  <Link
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-[22px] border px-4 py-4 transition",
                      isDark ? "border-slate-700 bg-slate-900 hover:border-slate-600" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    )}
                    to={dashboard.continueReading.path}
                  >
                    <div>
                      <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>Current focus</p>
                      <p className={cn("mt-2 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{dashboard.continueReading.title}</p>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </DashboardCard>
          </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <DashboardCard isDark={isDark}>
            <SectionHeading eyebrow="Recently opened" isDark={isDark} title="Resume any material" />
            <div className="mt-6 space-y-3">
              {recentlyOpened.length ? (
                recentlyOpened.map((item) => (
                  <Link className={cn("block rounded-[22px] border px-4 py-4 transition", isDark ? "border-slate-700 bg-slate-800 hover:border-slate-600" : "border-slate-200 bg-slate-50 hover:border-slate-300")} key={item.id} to={item.path}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                        <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{formatDateTime(item.lastOpenedAt)}</p>
                      </div>
                      <span className={cn("rounded-full border px-3 py-1 text-xs", isDark ? "border-slate-600 text-slate-300" : "border-slate-200 text-slate-600")}>
                        {item.readingProgressPct.toFixed(0)}%
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>Your recent materials will appear after you open items in the library.</p>
              )}
            </div>
          </DashboardCard>

          <DashboardCard isDark={isDark}>
            <SectionHeading eyebrow="Recently viewed cases" isDark={isDark} title="Case reading history" />
            <div className="mt-6 space-y-3">
              {recentlyViewedCases.length ? (
                recentlyViewedCases.map((item) => (
                  <Link className={cn("block rounded-[22px] border px-4 py-4 transition", isDark ? "border-slate-700 bg-slate-800 hover:border-slate-600" : "border-slate-200 bg-slate-50 hover:border-slate-300")} key={item.id} to={item.path}>
                    <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                    <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                      {[item.subjectName, item.topicName].filter(Boolean).join(" / ")} • {formatDateTime(item.lastOpenedAt)}
                    </p>
                  </Link>
                ))
              ) : (
                <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>Published cases you review will be tracked here for quick return.</p>
              )}
            </div>
          </DashboardCard>

          <DashboardCard isDark={isDark}>
            <SectionHeading eyebrow="Download history" isDark={isDark} title="Saved downloads" />
            <div className="mt-6 space-y-3">
              {downloadsQuery.data?.items.length ? (
                downloadsQuery.data.items.map((item) => (
                  <a
                    className={cn("block rounded-[22px] border px-4 py-4 transition", isDark ? "border-slate-700 bg-slate-800 hover:border-slate-600" : "border-slate-200 bg-slate-50 hover:border-slate-300")}
                    href={item.path}
                    key={item.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <p className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{item.fileName}</p>
                    <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                      {item.title} • {formatDateTime(item.createdAt)}
                    </p>
                  </a>
                ))
              ) : (
                <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-500")}>
                  Downloads you trigger from the library will be recorded here for quick access.
                </p>
              )}
            </div>
          </DashboardCard>
        </section>
      </div>
    </>
  );
}
