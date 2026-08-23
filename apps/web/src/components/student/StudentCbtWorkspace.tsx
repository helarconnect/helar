import { AxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Flag,
  Play,
  XCircle
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { formatDateTimeDMY } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  fetchCbtAttempt,
  fetchCbtAttemptResult,
  fetchStudentCbtDetail,
  fetchStudentCbtList,
  fetchStudentCbtResults,
  saveCbtAnswer,
  startCbtAttempt,
  submitCbtAttempt,
  type CbtAttempt,
  type CbtAttemptResult,
  type StudentAttemptAnswer,
  type StudentCbtListItem
} from "@/lib/student-api";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth-store";

type Toast = { id: number; message: string; tone: "error" | "success" };

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function prettifyEnum(value?: string | null) {
  if (!value) return "Not available";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function Surface({
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
        "rounded-[28px] border shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
        isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white",
        className
      )}
    >
      {children}
    </section>
  );
}

function EmptyState({ isDark, message }: { isDark: boolean; message: string }) {
  return (
    <div
      className={cn(
        "rounded-[22px] border px-5 py-8 text-sm leading-6",
        isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {message}
    </div>
  );
}

function StatusPill({
  children,
  isDark,
  tone
}: {
  children: ReactNode;
  isDark: boolean;
  tone: "amber" | "blue" | "green" | "red" | "slate";
}) {
  const classes = {
    amber: isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-700",
    blue: isDark ? "border-blue-500/25 bg-blue-500/10 text-blue-200" : "border-blue-200 bg-blue-50 text-blue-700",
    green: isDark ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: isDark ? "border-rose-500/25 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700",
    slate: isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-slate-100 text-slate-700"
  } as const;

  return <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", classes[tone])}>{children}</span>;
}

function ToastViewport({
  isDark,
  onDismiss,
  toasts
}: {
  isDark: boolean;
  onDismiss: (id: number) => void;
  toasts: Toast[];
}) {
  if (!toasts.length || typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[999] flex justify-end px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            className={cn(
              "pointer-events-auto rounded-[22px] border px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-sm",
              toast.tone === "success"
                ? isDark
                  ? "border-emerald-500/30 bg-slate-950/95 text-emerald-100"
                  : "border-emerald-200 bg-white text-emerald-800"
                : isDark
                  ? "border-rose-500/30 bg-slate-950/95 text-rose-100"
                  : "border-rose-200 bg-white text-rose-800"
            )}
            key={toast.id}
            role="status"
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full",
                  toast.tone === "success"
                    ? isDark
                      ? "bg-emerald-500/18 text-emerald-200"
                      : "bg-emerald-50 text-emerald-700"
                    : isDark
                      ? "bg-rose-500/18 text-rose-200"
                      : "bg-rose-50 text-rose-700"
                )}
              >
                {toast.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-6">{toast.message}</p>
              </div>
              <button
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                  isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"
                )}
                onClick={() => onDismiss(toast.id)}
                type="button"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

function getAvailabilityTone(status: StudentCbtListItem["availabilityStatus"]) {
  switch (status) {
    case "active":
      return "green";
    case "upcoming":
      return "blue";
    case "completed":
      return "slate";
    default:
      return "slate";
  }
}

function buildInitialAnswers(attempt: CbtAttempt) {
  return attempt.cbt.questions.reduce<Record<string, StudentAttemptAnswer>>((acc, question) => {
    acc[question.id] = attempt.answers[question.id] ?? {
      answerText: "",
      markedForReview: false,
      selectedOptionIds: []
    };
    return acc;
  }, {});
}

export function StudentCbtWorkspace() {
  const { isDark } = useTheme();
  const authSession = useAuthStore((state) => state.session);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const attemptId = searchParams.get("attemptId");
  const view = searchParams.get("view");

  const [activeTab, setActiveTab] = useState<"available" | "results">("available");
  const [selectedCbtId, setSelectedCbtId] = useState<string | null>(null);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(message: string, tone: Toast["tone"]) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }

  const cbtListQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken),
    queryKey: queryKeys.studentCbts(),
    queryFn: () => fetchStudentCbtList()
  });

  const selectedCbtQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(selectedCbtId),
    queryKey: queryKeys.studentCbtDetail(selectedCbtId ?? "none"),
    queryFn: () => fetchStudentCbtDetail(selectedCbtId!)
  });

  const attemptQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(attemptId) && view !== "results",
    queryKey: queryKeys.studentCbtAttempt(attemptId ?? "none"),
    queryFn: () => fetchCbtAttempt(attemptId!)
  });

  const resultsQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken),
    queryKey: queryKeys.studentCbtResults(),
    queryFn: () => fetchStudentCbtResults()
  });

  const attemptResultQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(attemptId) && view === "results",
    queryKey: queryKeys.studentCbtAttemptResult(attemptId ?? "none"),
    queryFn: () => fetchCbtAttemptResult(attemptId!)
  });

  const startAttemptMutation = useMutation({
    mutationFn: (cbtId: string) => startCbtAttempt(cbtId),
    onSuccess: (attempt) => {
      showToast("Assessment started successfully.", "success");
      setIsStartModalOpen(false);
      setSearchParams({ attemptId: attempt.id });
    },
    onError: (error: AxiosError) => {
      const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? "Could not start this assessment.";
      showToast(message, "error");
    }
  });

  const saveAnswerMutation = useMutation({
    mutationFn: ({
      answerText,
      markedForReview,
      questionId,
      selectedOptionIds
    }: {
      answerText?: string;
      markedForReview?: boolean;
      questionId: string;
      selectedOptionIds?: string[];
    }) => saveCbtAnswer(attemptId!, { answerText, markedForReview, questionId, selectedOptionIds }),
    onError: () => {
      showToast("Could not save your latest answer.", "error");
    }
  });

  const submitAttemptMutation = useMutation({
    mutationFn: (currentAttemptId: string) => submitCbtAttempt(currentAttemptId),
    onSuccess: async (_, submittedAttemptId) => {
      showToast("Assessment submitted successfully.", "success");
      setIsSubmitConfirmOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.studentCbts() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.studentCbtResults() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.studentCbtAttempt(submittedAttemptId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.studentCbtAttemptResult(submittedAttemptId) })
      ]);
      setSearchParams({ attemptId: submittedAttemptId, view: "results" });
    },
    onError: (error: AxiosError) => {
      const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? "Could not submit this assessment.";
      showToast(message, "error");
    }
  });

  const availableCbts = useMemo(
    () => [...(cbtListQuery.data?.active ?? []), ...(cbtListQuery.data?.upcoming ?? [])],
    [cbtListQuery.data]
  );

  if (attemptId && view === "results" && attemptResultQuery.data) {
    return (
      <>
        <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
        <ResultsView
          isDark={isDark}
          result={attemptResultQuery.data}
          onClose={() => setSearchParams({})}
        />
      </>
    );
  }

  if (attemptId && attemptQuery.data) {
    return (
      <StudentAttemptScreen
        attempt={attemptQuery.data}
        dismissToast={dismissToast}
        isDark={isDark}
        isSubmitConfirmOpen={isSubmitConfirmOpen}
        onCloseSubmitConfirm={() => setIsSubmitConfirmOpen(false)}
        onRequestSubmit={() => setIsSubmitConfirmOpen(true)}
        onSubmit={() => submitAttemptMutation.mutate(attemptQuery.data.id)}
        saveAnswerMutation={saveAnswerMutation}
        setToasts={setToasts}
        toasts={toasts}
      />
    );
  }

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className={cn("text-2xl font-semibold", isDark ? "text-white" : "text-slate-900")}>CBT / Assessments</h1>
            <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
              Take timed assessments, submit with confidence, and review your results immediately.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            className={cn(
              "rounded-2xl px-4 py-2 text-sm font-medium transition",
              activeTab === "available"
                ? isDark
                  ? "bg-white/10 text-white"
                  : "bg-slate-900 text-white"
                : isDark
                  ? "text-slate-400 hover:text-white"
                  : "text-slate-600 hover:text-slate-900"
            )}
            onClick={() => setActiveTab("available")}
            type="button"
          >
            Available Tests
          </button>
          <button
            className={cn(
              "rounded-2xl px-4 py-2 text-sm font-medium transition",
              activeTab === "results"
                ? isDark
                  ? "bg-white/10 text-white"
                  : "bg-slate-900 text-white"
                : isDark
                  ? "text-slate-400 hover:text-white"
                  : "text-slate-600 hover:text-slate-900"
            )}
            onClick={() => setActiveTab("results")}
            type="button"
          >
            My Results
          </button>
        </div>

        {activeTab === "available" ? (
          cbtListQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div className={cn("h-56 animate-pulse rounded-3xl", isDark ? "bg-slate-800" : "bg-slate-100")} key={item} />
              ))}
            </div>
          ) : cbtListQuery.isError ? (
            <EmptyState isDark={isDark} message="Could not load the CBT catalogue right now." />
          ) : availableCbts.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {availableCbts.map((cbt) => (
                <CbtCard
                  cbt={cbt}
                  isDark={isDark}
                  key={cbt.id}
                  onStart={() => {
                    setSelectedCbtId(cbt.id);
                    setIsStartModalOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState isDark={isDark} message="There are no active or upcoming assessments at the moment." />
          )
        ) : resultsQuery.isLoading ? (
          <div className="grid gap-4">
            {[1, 2].map((item) => (
              <div className={cn("h-32 animate-pulse rounded-3xl", isDark ? "bg-slate-800" : "bg-slate-100")} key={item} />
            ))}
          </div>
        ) : resultsQuery.isError ? (
          <EmptyState isDark={isDark} message="Could not load your CBT results right now." />
        ) : resultsQuery.data?.results.length ? (
          <div className="grid gap-4">
            {resultsQuery.data.results.map((entry) => (
              <Surface className="p-5 lg:p-6" isDark={isDark} key={entry.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <button
                    className={cn(
                      "min-w-0 flex-1 rounded-2xl text-left transition",
                      isDark ? "hover:text-white" : "hover:text-slate-950"
                    )}
                    onClick={() => setSearchParams({ attemptId: entry.id, view: "results" })}
                    type="button"
                  >
                    <h3 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>{entry.cbtTitle}</h3>
                    <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                      Attempt {entry.attemptNumber} • Submitted {formatDateTimeDMY(entry.submittedAt)}
                    </p>
                  </button>
                  <div className="flex items-center gap-3">
                    {entry.result ? (
                      <StatusPill isDark={isDark} tone={entry.result.passed ? "green" : "red"}>
                        {entry.result.passed ? "Passed" : "Failed"} • {entry.result.percentageScore.toFixed(1)}%
                      </StatusPill>
                    ) : (
                      <StatusPill isDark={isDark} tone="amber">
                        Pending review
                      </StatusPill>
                    )}
                    <button
                      className="button-secondary !px-4 !py-3"
                      onClick={() => setSearchParams({ attemptId: entry.id, view: "results" })}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        View result
                      </span>
                    </button>
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        ) : (
          <EmptyState isDark={isDark} message="No CBT results yet. Complete an assessment to see your score history." />
        )}

        {isStartModalOpen && selectedCbtId ? (
          <StartAssessmentModal
            cbt={selectedCbtQuery.data}
            isDark={isDark}
            isLoading={selectedCbtQuery.isLoading || startAttemptMutation.isPending}
            onClose={() => {
              setIsStartModalOpen(false);
              setSelectedCbtId(null);
            }}
            onStart={() => startAttemptMutation.mutate(selectedCbtId)}
          />
        ) : null}
      </div>
    </>
  );
}

function CbtCard({
  cbt,
  isDark,
  onStart
}: {
  cbt: StudentCbtListItem;
  isDark: boolean;
  onStart: () => void;
}) {
  const isStartable = cbt.availabilityStatus === "active" && cbt.attemptsRemaining > 0;

  return (
    <Surface className="p-5 lg:p-6" isDark={isDark}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={cn("truncate text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>{cbt.title}</h3>
          <p className={cn("mt-1 text-sm leading-6", isDark ? "text-slate-400" : "text-slate-600")}>
            {cbt.description || cbt.instructions || "No additional assessment summary provided."}
          </p>
        </div>
        <StatusPill isDark={isDark} tone={getAvailabilityTone(cbt.availabilityStatus)}>
          {prettifyEnum(cbt.availabilityStatus)}
        </StatusPill>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Questions" value={String(cbt.totalQuestions)} isDark={isDark} />
        <Metric label="Duration" value={`${Math.round(cbt.durationSeconds / 60)} min`} isDark={isDark} />
        <Metric label="Pass mark" value={`${cbt.passPercentage}%`} isDark={isDark} />
        <Metric label="Attempts left" value={String(cbt.attemptsRemaining)} isDark={isDark} />
      </div>

      {(cbt.subject?.name || cbt.topic?.name) && (
        <p className={cn("mt-4 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
          {[cbt.subject?.name, cbt.topic?.name].filter(Boolean).join(" • ")}
        </p>
      )}

      <button
        className="button-primary !mt-5 !w-full !px-4 !py-3"
        disabled={!isStartable}
        onClick={onStart}
        type="button"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Play className="h-4 w-4" />
          {cbt.availabilityStatus === "upcoming"
            ? "Starts soon"
            : cbt.attemptsRemaining <= 0
              ? "No attempts left"
              : "Start assessment"}
        </span>
      </button>
    </Surface>
  );
}

function Metric({ isDark, label, value }: { isDark: boolean; label: string; value: string }) {
  return (
    <div>
      <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>{label}</p>
      <p className={cn("mt-1 font-medium", isDark ? "text-white" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function StartAssessmentModal({
  cbt,
  isDark,
  isLoading,
  onClose,
  onStart
}: {
  cbt: StudentCbtListItem | undefined;
  isDark: boolean;
  isLoading: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
      <div className={cn("w-full max-w-2xl rounded-[32px] border", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
        <div className={cn("border-b px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Ready to begin</p>
          <h3 className={cn("mt-2 text-2xl font-semibold", isDark ? "text-white" : "text-slate-900")}>
            {cbt?.title ?? "Loading assessment"}
          </h3>
        </div>
        <div className="grid gap-5 px-6 py-6">
          {cbt ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard isDark={isDark} label="Duration" value={`${Math.round(cbt.durationSeconds / 60)} minutes`} />
                <SummaryCard isDark={isDark} label="Questions" value={String(cbt.totalQuestions)} />
                <SummaryCard isDark={isDark} label="Pass mark" value={`${cbt.passPercentage}%`} />
              </div>
              <div className={cn("rounded-3xl border p-5", isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-slate-50")}>
                <p className={cn("text-sm leading-7", isDark ? "text-slate-300" : "text-slate-700")}>
                  {cbt.instructions || cbt.description || "Read each question carefully. Your answers are saved as you go, and your score will be shown immediately after submission when the assessment is fully auto-graded."}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className={cn("mt-0.5 h-5 w-5", isDark ? "text-amber-300" : "text-amber-700")} />
                <p className={cn("text-sm leading-6", isDark ? "text-slate-300" : "text-slate-700")}>
                  Once you begin, the countdown starts immediately. Stay on this page until you submit the assessment.
                </p>
              </div>
            </>
          ) : (
            <div className="grid gap-3">
              <div className={cn("h-20 animate-pulse rounded-3xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-20 animate-pulse rounded-3xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
            </div>
          )}
        </div>
        <div className={cn("flex items-center gap-3 border-t px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <button className="button-secondary !flex-1 !px-4 !py-3" disabled={isLoading} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button-primary !flex-1 !px-4 !py-3" disabled={isLoading || !cbt} onClick={onStart} type="button">
            {isLoading ? "Starting..." : "Start assessment"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SummaryCard({ isDark, label, value }: { isDark: boolean; label: string; value: string }) {
  return (
    <div className={cn("rounded-3xl border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
      <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>{label}</p>
      <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function StudentAttemptScreen({
  attempt,
  dismissToast,
  isDark,
  isSubmitConfirmOpen,
  onCloseSubmitConfirm,
  onRequestSubmit,
  onSubmit,
  saveAnswerMutation,
  setToasts,
  toasts
}: {
  attempt: CbtAttempt;
  dismissToast: (id: number) => void;
  isDark: boolean;
  isSubmitConfirmOpen: boolean;
  onCloseSubmitConfirm: () => void;
  onRequestSubmit: () => void;
  onSubmit: () => void;
  saveAnswerMutation: ReturnType<typeof useMutation>;
  setToasts: React.Dispatch<React.SetStateAction<Toast[]>>;
  toasts: Toast[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, StudentAttemptAnswer>>(() => buildInitialAnswers(attempt));

  useEffect(() => {
    setLocalAnswers(buildInitialAnswers(attempt));
  }, [attempt]);

  const currentQuestion = attempt.cbt.questions[currentIndex];
  const answeredCount = attempt.cbt.questions.filter((question) => {
    const answer = localAnswers[question.id];
    return Boolean(answer?.selectedOptionIds.length || answer?.answerText.trim());
  }).length;
  const markedCount = attempt.cbt.questions.filter((question) => localAnswers[question.id]?.markedForReview).length;
  const durationSeconds = attempt.cbt.durationSeconds;
  const attemptEndsAt = durationSeconds > 0 ? new Date(attempt.startedAt).getTime() + durationSeconds * 1000 : null;
  const [timeRemaining, setTimeRemaining] = useState(
    attemptEndsAt ? Math.max(0, Math.floor((attemptEndsAt - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (!attemptEndsAt) {
      return;
    }

    if (timeRemaining <= 0) {
      onSubmit();
      return;
    }

    const timer = window.setInterval(() => {
      setTimeRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          onSubmit();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [attemptEndsAt, onSubmit, timeRemaining]);

  function persistAnswer(questionId: string, nextValue: StudentAttemptAnswer) {
    setLocalAnswers((current) => ({ ...current, [questionId]: nextValue }));
    saveAnswerMutation.mutate({
      questionId,
      selectedOptionIds: nextValue.selectedOptionIds,
      answerText: nextValue.answerText,
      markedForReview: nextValue.markedForReview
    });
  }

  function showInlineToast(message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone: "error" }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
  }

  function selectSingleOption(optionId: string) {
    persistAnswer(currentQuestion.id, {
      answerText: "",
      markedForReview: localAnswers[currentQuestion.id]?.markedForReview ?? false,
      selectedOptionIds: [optionId]
    });
  }

  function toggleMultipleOption(optionId: string) {
    const current = localAnswers[currentQuestion.id] ?? { answerText: "", markedForReview: false, selectedOptionIds: [] };
    const selectedOptionIds = current.selectedOptionIds.includes(optionId)
      ? current.selectedOptionIds.filter((id) => id !== optionId)
      : [...current.selectedOptionIds, optionId];

    persistAnswer(currentQuestion.id, {
      ...current,
      selectedOptionIds
    });
  }

  function updateAnswerText(value: string) {
    persistAnswer(currentQuestion.id, {
      answerText: value,
      markedForReview: localAnswers[currentQuestion.id]?.markedForReview ?? false,
      selectedOptionIds: []
    });
  }

  function toggleMarkForReview() {
    const current = localAnswers[currentQuestion.id] ?? { answerText: "", markedForReview: false, selectedOptionIds: [] };
    persistAnswer(currentQuestion.id, {
      ...current,
      markedForReview: !current.markedForReview
    });
  }

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <Surface className="flex items-center justify-between p-4 lg:p-5" isDark={isDark}>
            <div className="flex items-center gap-6">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                  {attempt.cbt.title}
                </p>
                <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-900")}>
                  Question {currentIndex + 1} of {attempt.cbt.questions.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Clock className={cn("h-4 w-4", isDark ? "text-slate-400" : "text-slate-500")} />
                <span className={cn("text-lg font-mono font-semibold", isDark ? "text-white" : "text-slate-900")}>
                  {attemptEndsAt ? formatDuration(timeRemaining) : "Untimed"}
                </span>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className={isDark ? "text-slate-300" : "text-slate-700"}>{answeredCount} answered</p>
              <p className={isDark ? "text-slate-500" : "text-slate-400"}>{markedCount} marked for review</p>
            </div>
          </Surface>

          <Surface className="mt-4 flex-1 overflow-y-auto p-6 lg:p-8" isDark={isDark}>
            <div className="mx-auto max-w-3xl">
              <h2 className={cn("text-xl font-semibold", isDark ? "text-white" : "text-slate-900")}>{currentQuestion.prompt}</h2>
              <p className={cn("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                {prettifyEnum(currentQuestion.type)} • {currentQuestion.points} point{currentQuestion.points === 1 ? "" : "s"}
              </p>

              <div className="mt-6 space-y-3">
                {currentQuestion.type === "SHORT_ANSWER" ? (
                  <textarea
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
                    )}
                    onChange={(event) => updateAnswerText(event.target.value)}
                    placeholder="Type your answer here"
                    rows={6}
                    value={localAnswers[currentQuestion.id]?.answerText ?? ""}
                  />
                ) : currentQuestion.type === "MULTIPLE_SELECT" ? (
                  currentQuestion.options.map((option) => {
                    const isChecked = localAnswers[currentQuestion.id]?.selectedOptionIds.includes(option.id) ?? false;
                    return (
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition",
                          isChecked
                            ? isDark
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-blue-500 bg-blue-50"
                            : isDark
                              ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                              : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        )}
                        key={option.id}
                      >
                        <input
                          checked={isChecked}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          onChange={() => toggleMultipleOption(option.id)}
                          type="checkbox"
                        />
                        <span className={cn("font-medium", isDark ? "text-white" : "text-slate-900")}>
                          {option.label}. {option.text}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  currentQuestion.options.map((option) => {
                    const isSelected = (localAnswers[currentQuestion.id]?.selectedOptionIds ?? []).includes(option.id);
                    return (
                      <button
                        className={cn(
                          "w-full rounded-2xl border p-4 text-left transition",
                          isSelected
                            ? isDark
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-blue-500 bg-blue-50"
                            : isDark
                              ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                              : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        )}
                        key={option.id}
                        onClick={() => selectSingleOption(option.id)}
                        type="button"
                      >
                        <span className={cn("font-medium", isDark ? "text-white" : "text-slate-900")}>
                          {option.label}. {option.text}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  className="button-secondary !px-4 !py-3"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((current) => Math.max(0, current - 1))}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </span>
                </button>
                <button
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                    localAnswers[currentQuestion.id]?.markedForReview
                      ? isDark
                        ? "border-amber-500 bg-amber-500/10 text-amber-200"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                      : isDark
                        ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                  )}
                  onClick={toggleMarkForReview}
                  type="button"
                >
                  <Flag className="h-4 w-4" />
                  {localAnswers[currentQuestion.id]?.markedForReview ? "Unmark review" : "Mark for review"}
                </button>
                {currentIndex === attempt.cbt.questions.length - 1 ? (
                  <button className="button-primary !px-4 !py-3" onClick={onRequestSubmit} type="button">
                    Submit assessment
                  </button>
                ) : (
                  <button
                    className="button-primary !px-4 !py-3"
                    onClick={() => setCurrentIndex((current) => Math.min(attempt.cbt.questions.length - 1, current + 1))}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </button>
                )}
              </div>

              {saveAnswerMutation.isError ? (
                <div className="mt-4">
                  <button
                    className={cn("text-sm font-medium underline", isDark ? "text-rose-300" : "text-rose-700")}
                    onClick={() => showInlineToast("The last answer did not save. Please click again to retry.")}
                    type="button"
                  >
                    Having trouble saving? Tap here for a reminder.
                  </button>
                </div>
              ) : null}
            </div>
          </Surface>
        </div>

        <div className="w-72 shrink-0">
          <Surface className="h-full p-4 lg:p-5" isDark={isDark}>
            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Navigator</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {attempt.cbt.questions.map((question, index) => {
                const answer = localAnswers[question.id];
                const isAnswered = Boolean(answer?.selectedOptionIds.length || answer?.answerText.trim());
                const isMarked = answer?.markedForReview;
                const isCurrent = index === currentIndex;

                return (
                  <button
                    className={cn(
                      "h-10 rounded-xl text-sm font-medium transition",
                      isCurrent
                        ? "bg-blue-500 text-white"
                        : isMarked
                          ? isDark
                            ? "border border-amber-500/30 bg-amber-500/20 text-amber-200"
                            : "border border-amber-200 bg-amber-100 text-amber-800"
                          : isAnswered
                            ? isDark
                              ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-200"
                              : "border border-emerald-200 bg-emerald-100 text-emerald-800"
                            : isDark
                              ? "border border-slate-700 bg-slate-800 text-slate-400"
                              : "border border-slate-200 bg-slate-100 text-slate-600"
                    )}
                    key={question.id}
                    onClick={() => setCurrentIndex(index)}
                    type="button"
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-2 text-xs">
              <Legend label="Answered" tone="emerald" isDark={isDark} />
              <Legend label="Marked" tone="amber" isDark={isDark} />
              <Legend label="Pending" tone="slate" isDark={isDark} />
            </div>

            <button className="button-primary !mt-6 !w-full !px-4 !py-3" onClick={onRequestSubmit} type="button">
              Submit assessment
            </button>
          </Surface>
        </div>
      </div>

      {isSubmitConfirmOpen ? (
        <ConfirmSubmitModal
          answeredCount={answeredCount}
          isDark={isDark}
          isLoading={saveAnswerMutation.isPending}
          markedCount={markedCount}
          onClose={onCloseSubmitConfirm}
          onSubmit={onSubmit}
          totalQuestions={attempt.cbt.questions.length}
        />
      ) : null}
    </>
  );
}

function Legend({
  isDark,
  label,
  tone
}: {
  isDark: boolean;
  label: string;
  tone: "amber" | "emerald" | "slate";
}) {
  const classes = {
    amber: isDark ? "border-amber-500/30 bg-amber-500/20" : "border-amber-200 bg-amber-100",
    emerald: isDark ? "border-emerald-500/30 bg-emerald-500/20" : "border-emerald-200 bg-emerald-100",
    slate: isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"
  } as const;

  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-3 w-3 rounded-md border", classes[tone])} />
      <span className={cn(isDark ? "text-slate-400" : "text-slate-500")}>{label}</span>
    </div>
  );
}

function ConfirmSubmitModal({
  answeredCount,
  isDark,
  isLoading,
  markedCount,
  onClose,
  onSubmit,
  totalQuestions
}: {
  answeredCount: number;
  isDark: boolean;
  isLoading: boolean;
  markedCount: number;
  onClose: () => void;
  onSubmit: () => void;
  totalQuestions: number;
}) {
  if (typeof document === "undefined") return null;

  const unansweredCount = totalQuestions - answeredCount;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
      <div className={cn("w-full max-w-lg rounded-[32px] border", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
        <div className={cn("border-b px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Submit assessment</p>
          <h3 className={cn("mt-2 text-xl font-semibold", isDark ? "text-white" : "text-slate-900")}>Ready to submit?</h3>
        </div>
        <div className="grid grid-cols-3 gap-3 px-6 py-5">
          <SubmitMetric isDark={isDark} label="Answered" tone="emerald" value={answeredCount} />
          <SubmitMetric isDark={isDark} label="Unanswered" tone="rose" value={unansweredCount} />
          <SubmitMetric isDark={isDark} label="Marked" tone="amber" value={markedCount} />
        </div>
        <div className={cn("flex items-center gap-3 border-t px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <button className="button-secondary !flex-1 !px-4 !py-3" disabled={isLoading} onClick={onClose} type="button">
            Go back
          </button>
          <button className="button-primary !flex-1 !px-4 !py-3" disabled={isLoading} onClick={onSubmit} type="button">
            {isLoading ? "Submitting..." : "Submit now"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SubmitMetric({
  isDark,
  label,
  tone,
  value
}: {
  isDark: boolean;
  label: string;
  tone: "amber" | "emerald" | "rose";
  value: number;
}) {
  const colors = {
    amber: isDark ? "text-amber-300" : "text-amber-700",
    emerald: isDark ? "text-emerald-300" : "text-emerald-700",
    rose: isDark ? "text-rose-300" : "text-rose-700"
  } as const;

  return (
    <div className={cn("rounded-2xl border p-4 text-center", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")}>
      <p className={cn("text-2xl font-bold", colors[tone])}>{value}</p>
      <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>{label}</p>
    </div>
  );
}

function getReviewTone(status: "correct" | "incorrect" | "unanswered" | "pending_review"): "green" | "red" | "amber" | "blue" {
  switch (status) {
    case "correct":
      return "green";
    case "incorrect":
      return "red";
    case "pending_review":
      return "blue";
    default:
      return "amber";
  }
}

function getReviewLabel(status: "correct" | "incorrect" | "unanswered" | "pending_review") {
  switch (status) {
    case "correct":
      return "Correct";
    case "incorrect":
      return "Incorrect";
    case "pending_review":
      return "Pending review";
    default:
      return "No answer";
  }
}

function ResultsView({
  isDark,
  onClose,
  result
}: {
  isDark: boolean;
  onClose: () => void;
  result: CbtAttemptResult;
}) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const currentQuestion = result.questions[currentQuestionIndex];
  const scoreIsVisible = result.cbt.showScoreOnCompletion && Boolean(result.result);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("text-2xl font-semibold", isDark ? "text-white" : "text-slate-900")}>Assessment Results</h1>
          <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{result.cbt.title}</p>
        </div>
        <button className="button-secondary !px-4 !py-3" onClick={onClose} type="button">
          Back to CBTs
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          isDark={isDark}
          label="Result"
          value={
            result.result
              ? result.result.needsManualGrading
                ? "Pending review"
                : result.result.passed
                  ? "Passed"
                  : "Failed"
              : "Pending"
          }
        />
        <SummaryCard
          isDark={isDark}
          label="Score"
          value={
            scoreIsVisible && result.result
              ? `${result.result.earnedPoints}/${result.result.totalPoints} (${result.result.percentageScore.toFixed(1)}%)`
              : "Hidden"
          }
        />
        <SummaryCard
          isDark={isDark}
          label="Answered"
          value={result.result ? `${result.result.answeredCount}/${result.result.totalQuestions}` : "Not available"}
        />
        <SummaryCard isDark={isDark} label="Questions" value={String(result.questions.length)} />
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <Surface className="p-6 lg:p-8" isDark={isDark}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                  Question {currentQuestionIndex + 1} of {result.questions.length}
                </p>
                <h2 className={cn("mt-2 text-xl font-semibold", isDark ? "text-white" : "text-slate-900")}>{currentQuestion.prompt}</h2>
              </div>
              <StatusPill
                isDark={isDark}
                tone={getReviewTone(currentQuestion.reviewStatus)}
              >
                {getReviewLabel(currentQuestion.reviewStatus)}
              </StatusPill>
            </div>

            <div className="mt-6 space-y-4">
              {currentQuestion.type === "SHORT_ANSWER" ? (
                <>
                  <div className={cn("rounded-3xl border p-5", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")}>
                    <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>Your answer</p>
                    <p className={cn("mt-2 text-sm leading-7", isDark ? "text-white" : "text-slate-900")}>
                      {currentQuestion.studentAnswer?.answerText || "No answer submitted."}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-3xl border p-5",
                      currentQuestion.reviewStatus === "correct"
                        ? isDark
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-emerald-200 bg-emerald-50"
                        : isDark
                          ? "border-slate-700 bg-slate-800"
                          : "border-slate-200 bg-slate-50"
                    )}
                  >
                    <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>Accepted answer(s)</p>
                    <p className={cn("mt-2 text-sm leading-7", isDark ? "text-white" : "text-slate-900")}>
                      {currentQuestion.acceptedAnswers.length ? currentQuestion.acceptedAnswers.join(", ") : "No accepted answers configured."}
                    </p>
                  </div>
                </>
              ) : (
                currentQuestion.options.map((option) => {
                  const isSelected = currentQuestion.studentAnswer?.selectedOptionIds.includes(option.id) ?? false;
                  const isCorrect = option.isCorrect === true;

                  return (
                    <div
                      className={cn(
                        "rounded-2xl border p-4",
                        result.cbt.showCorrectAnswersOnCompletion && isCorrect
                          ? isDark
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-emerald-200 bg-emerald-50"
                          : isSelected
                            ? isDark
                              ? "border-blue-500/40 bg-blue-500/10"
                              : "border-blue-200 bg-blue-50"
                            : isDark
                              ? "border-slate-700 bg-slate-800"
                              : "border-slate-200 bg-slate-50"
                      )}
                      key={option.id}
                    >
                      <div className="flex items-center gap-3">
                        {result.cbt.showCorrectAnswersOnCompletion && isCorrect ? (
                          <CheckCircle2 className={isDark ? "text-emerald-300" : "text-emerald-700"} />
                        ) : null}
                        {isSelected && !isCorrect && result.cbt.showCorrectAnswersOnCompletion ? (
                          <XCircle className={isDark ? "text-rose-300" : "text-rose-700"} />
                        ) : null}
                        <span className={cn("font-medium", isDark ? "text-white" : "text-slate-900")}>
                          {option.label}. {option.text}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              {result.cbt.showExplanationsOnCompletion && currentQuestion.explanation ? (
                <div className={cn("rounded-3xl border p-5", isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>Explanation</p>
                  <p className={cn("mt-2 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-700")}>{currentQuestion.explanation}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                className="button-secondary !px-4 !py-3"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((current) => Math.max(0, current - 1))}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </span>
              </button>
              {currentQuestionIndex < result.questions.length - 1 ? (
                <button
                  className="button-primary !px-4 !py-3"
                  onClick={() => setCurrentQuestionIndex((current) => Math.min(result.questions.length - 1, current + 1))}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              ) : null}
            </div>
          </Surface>
        </div>

        <div className="w-72 shrink-0">
          <Surface className="p-4 lg:p-5" isDark={isDark}>
            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Question review</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {result.questions.map((question, index) => (
                <button
                  className={cn(
                    "h-10 rounded-xl text-sm font-medium transition",
                    index === currentQuestionIndex
                      ? "bg-blue-500 text-white"
                      : question.reviewStatus === "correct"
                        ? isDark
                          ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-200"
                          : "border border-emerald-200 bg-emerald-100 text-emerald-800"
                        : question.reviewStatus === "incorrect"
                          ? isDark
                            ? "border border-rose-500/30 bg-rose-500/20 text-rose-200"
                            : "border border-rose-200 bg-rose-100 text-rose-800"
                          : question.reviewStatus === "pending_review"
                            ? isDark
                              ? "border border-blue-500/30 bg-blue-500/20 text-blue-200"
                              : "border border-blue-200 bg-blue-100 text-blue-800"
                        : isDark
                          ? "border border-slate-700 bg-slate-800 text-slate-400"
                          : "border border-slate-200 bg-slate-100 text-slate-600"
                  )}
                  key={question.id}
                  onClick={() => setCurrentQuestionIndex(index)}
                  type="button"
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
