import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { CheckCircle2, ChevronRight, Circle, Eye, Lock, Pencil, Plus, Search, Trash2, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useTheme } from "@/hooks/useTheme";
import {
  createAdminBarFinalExamMcqQuestion,
  deleteAdminBarFinalExamMcqQuestion,
  fetchAdminBarFinalExamMcqQuestions,
  fetchBarFinalExamMcqFormOptions,
  fetchStudentBarFinalExamMcqQuestions,
  fetchStudentBarFinalExamMcqSubjects,
  submitStudentBarFinalExamMcqAttempt,
  updateAdminBarFinalExamMcqQuestion,
  type BarFinalExamMcqQuestion,
  type BarFinalExamMcqQuestionInput,
  type BarFinalExamQuestionStatus
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type ToastTone = "error" | "success";
type AdminModalMode = { kind: "create" } | { kind: "edit"; question: BarFinalExamMcqQuestion } | null;

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateWords(value: string, maxWords: number) {
  const normalized = value.trim();
  if (!normalized) {
    return { isTruncated: false, text: "" };
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return { isTruncated: false, text: words.join(" ") };
  }

  return { isTruncated: true, text: `${words.slice(0, maxWords).join(" ")}…` };
}

// --- MCQ View Tracking (Answer Gating) + Attempt Tracking --------------------
//
// Answer reveal rule (per product):
//   Students, Lawyers, and Judges must VIEW every question in a subject before
//   correct answers are displayed. Attempting (submitting) answers is optional —
//   answers unlock once the student has visited the LAST question in the
//   subject (equivalently: once all question IDs exist in the viewed set).
//
// BOTH state records persist to localStorage under per-subject composite keys
// so gating survives refreshes / back-nav / browser restarts.

// ---- VIEW tracking ----
const MCQ_VIEW_STORAGE_PREFIX = "bar-final-mcq:views:";

function buildViewStorageKey(subjectId: string) {
  return `${MCQ_VIEW_STORAGE_PREFIX}${subjectId}`;
}

function readViewedQuestionIds(subjectId: string): Set<string> {
  if (typeof window === "undefined" || !subjectId) return new Set();
  try {
    const raw = window.localStorage.getItem(buildViewStorageKey(subjectId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((item) => typeof item === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeViewedQuestionId(subjectId: string, questionId: string) {
  if (typeof window === "undefined" || !subjectId || !questionId) return;
  const current = readViewedQuestionIds(subjectId);
  if (current.has(questionId)) return;
  current.add(questionId);
  try {
    window.localStorage.setItem(buildViewStorageKey(subjectId), JSON.stringify(Array.from(current)));
  } catch {
    // Ignore quota / disabled localStorage.
  }
}

// ---- ATTEMPT tracking (for badges only; no longer drives answer reveal) ----
const MCQ_ATTEMPT_STORAGE_PREFIX = "bar-final-mcq:attempts:";

function buildAttemptStorageKey(subjectId: string) {
  return `${MCQ_ATTEMPT_STORAGE_PREFIX}${subjectId}`;
}

function readAttemptedQuestionIds(subjectId: string): Set<string> {
  if (typeof window === "undefined" || !subjectId) return new Set();
  try {
    const raw = window.localStorage.getItem(buildAttemptStorageKey(subjectId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((item) => typeof item === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeAttemptedQuestionId(subjectId: string, questionId: string) {
  if (typeof window === "undefined" || !subjectId || !questionId) return;
  const current = readAttemptedQuestionIds(subjectId);
  if (current.has(questionId)) return;
  current.add(questionId);
  try {
    window.localStorage.setItem(buildAttemptStorageKey(subjectId), JSON.stringify(Array.from(current)));
  } catch {
    // Ignore quota / disabled localStorage errors.
  }
}

// ---- Unified Gating Hook ----
// `allQuestionIds` is the ordered list of question IDs for the selected subject
// (index order = list order). `allViewed` is true when the last question has
// been viewed (enforces "go to the last of it" semantics regardless of gaps).
function useMcqAnswerGating(subjectId: string, allQuestionIds: string[]) {
  const [viewedSet, setViewedSet] = useState<Set<string>>(() => readViewedQuestionIds(subjectId));
  const [attemptedSet, setAttemptedSet] = useState<Set<string>>(() => readAttemptedQuestionIds(subjectId));

  useEffect(() => {
    setViewedSet(readViewedQuestionIds(subjectId));
    setAttemptedSet(readAttemptedQuestionIds(subjectId));
  }, [subjectId]);

  const totalQuestions = allQuestionIds.length;
  const lastQuestionId = totalQuestions > 0 ? allQuestionIds[totalQuestions - 1] : null;

  // View counters
  const viewedCount = allQuestionIds.reduce((acc, id) => (viewedSet.has(id) ? acc + 1 : acc), 0);
  // Per spec: unlock when the LAST question has been visited. That is strictly
  // a stronger condition than "any/all viewed" and prevents shortcuts where a
  // user directly opens the first/last URL without scrolling through the rest.
  const allViewed = Boolean(lastQuestionId) && viewedSet.has(lastQuestionId);

  // Attempt counters (kept for UI badges, no longer drives unlocking)
  const attemptedCount = allQuestionIds.reduce((acc, id) => (attemptedSet.has(id) ? acc + 1 : acc), 0);
  const allAttempted = totalQuestions > 0 && attemptedCount >= totalQuestions;

  // Answers are revealed once the entire subject has been VIEWED.
  const canRevealAnswers = allViewed;

  function registerView(questionId: string) {
    writeViewedQuestionId(subjectId, questionId);
    setViewedSet((current) => {
      if (current.has(questionId)) return current;
      const next = new Set(current);
      next.add(questionId);
      return next;
    });
  }

  function registerAttempt(questionId: string) {
    writeAttemptedQuestionId(subjectId, questionId);
    setAttemptedSet((current) => {
      if (current.has(questionId)) return current;
      const next = new Set(current);
      next.add(questionId);
      return next;
    });
  }

  return {
    // Primary unlock flag (consumed by option coloring + result card).
    canRevealAnswers,
    // View progress (used by progress bar + status pill).
    allViewed,
    viewedCount,
    totalQuestions,
    viewedSet,
    registerView,
    // Attempt progress (kept for per-question badges; allAttempted unused for
    // gating now but retained for analytics-type UI later).
    allAttempted,
    attemptedCount,
    attemptedSet,
    registerAttempt
  };
}

function statusLabel(status: BarFinalExamQuestionStatus) {
  if (status === "PUBLISHED") return "Published";
  if (status === "PENDING_APPROVAL") return "Pending approval";
  if (status === "ARCHIVED") return "Archived";
  return "Draft";
}

function statusTone(status: BarFinalExamQuestionStatus, isDark: boolean) {
  if (status === "PUBLISHED") return isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700";
  if (status === "PENDING_APPROVAL") return isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-50 text-amber-700";
  if (status === "ARCHIVED") return isDark ? "bg-slate-500/15 text-slate-200" : "bg-slate-100 text-slate-700";
  return isDark ? "bg-sky-500/15 text-sky-200" : "bg-sky-50 text-sky-700";
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

function buildDefaultDraft(subjectId: string): BarFinalExamMcqQuestionInput {
  return {
    correctOptionIndex: 0,
    examDate: "",
    options: ["", "", "", ""],
    question: "",
    status: "PUBLISHED",
    subjectId
  };
}

function resolveMutationError(error: unknown) {
  if (error instanceof AxiosError) {
    const message =
      (error.response?.data as any)?.error?.message ??
      (error.response?.data as any)?.message ??
      error.message ??
      "Something went wrong.";
    return typeof message === "string" ? message : "Something went wrong.";
  }
  return "Something went wrong.";
}

export function AdminBarFinalExamsMcqPage() {
  const queryClient = useQueryClient();
  const { isDark } = useTheme();
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<AdminModalMode>(null);
  const [draft, setDraft] = useState<BarFinalExamMcqQuestionInput>(() => buildDefaultDraft(""));
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([]);

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(message: string, tone: ToastTone, options?: { durationMs?: number }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), options?.durationMs ?? 4000);
  }

  const formOptionsQuery = useQuery({
    queryKey: queryKeys.adminBarFinalExamMcqFormOptions,
    queryFn: fetchBarFinalExamMcqFormOptions
  });

  const filters = useMemo(
    () => ({
      page: 1,
      pageSize: 50,
      search,
      status: "all" as const,
      subjectId: subjectId || undefined
    }),
    [search, subjectId]
  );

  const questionsQuery = useQuery({
    enabled: Boolean(subjectId),
    queryKey: queryKeys.adminBarFinalExamMcqQuestions(filters),
    queryFn: () => fetchAdminBarFinalExamMcqQuestions(filters)
  });

  const countSubjectId = modalMode?.kind === "create" ? draft.subjectId : subjectId;
  const questionCountQuery = useQuery({
    enabled: Boolean(countSubjectId),
    queryKey: queryKeys.adminBarFinalExamMcqQuestions({
      page: 1,
      pageSize: 1,
      search: "",
      status: "all",
      subjectId: countSubjectId || undefined
    }),
    queryFn: () =>
      fetchAdminBarFinalExamMcqQuestions({
        page: 1,
        pageSize: 1,
        search: "",
        status: "all",
        subjectId: countSubjectId
      })
  });

  const createMutation = useMutation({
    mutationFn: (payload: BarFinalExamMcqQuestionInput) => createAdminBarFinalExamMcqQuestion(payload),
    onSuccess: async (_data, payload) => {
      setSubjectId(payload.subjectId);
      await queryClient.invalidateQueries({ queryKey: ["admin-bar-final-exam-mcq-questions"] });
      setModalMode(null);
      showToast("Question saved.", "success");
    },
    onError: (error) => showToast(resolveMutationError(error), "error")
  });

  const updateMutation = useMutation({
    mutationFn: (params: { payload: BarFinalExamMcqQuestionInput; questionId: string }) =>
      updateAdminBarFinalExamMcqQuestion(params.questionId, params.payload),
    onSuccess: async (_data, params) => {
      setSubjectId(params.payload.subjectId);
      await queryClient.invalidateQueries({ queryKey: ["admin-bar-final-exam-mcq-questions"] });
      setModalMode(null);
      showToast("Question updated.", "success");
    },
    onError: (error) => showToast(resolveMutationError(error), "error")
  });

  const deleteMutation = useMutation({
    mutationFn: (questionId: string) => deleteAdminBarFinalExamMcqQuestion(questionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-bar-final-exam-mcq-questions"] });
      showToast("Question deleted.", "success");
    },
    onError: (error) => showToast(resolveMutationError(error), "error")
  });

  const subjects = formOptionsQuery.data?.subjects ?? [];
  const items = questionsQuery.data?.items ?? [];
  const sortedItems = useMemo(
    () => [...items].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [items]
  );
  const nextQuestionNumber =
    countSubjectId && modalMode?.kind === "create" ? (questionCountQuery.data?.pagination.totalItems ?? 0) + 1 : null;
  const canOpenCreate = !formOptionsQuery.isLoading && subjects.length > 0;
  const normalizedOptions = draft.options.map((value) => value.trim());
  const optionIndexMap = normalizedOptions.reduce<number[]>((acc, option, index) => {
    if (option) acc.push(index);
    return acc;
  }, []);
  const hasEnoughOptions = optionIndexMap.length >= 2;
  const selectedCorrectOption = normalizedOptions[draft.correctOptionIndex] ?? "";
  const correctIndexValid = Boolean(selectedCorrectOption) && optionIndexMap.includes(draft.correctOptionIndex);
  const canSaveDraft = Boolean(draft.subjectId) && stripHtml(draft.question).length >= 2 && hasEnoughOptions && correctIndexValid;

  function openCreate() {
    setDraft(buildDefaultDraft(subjectId));
    setModalMode({ kind: "create" });
  }

  function openEdit(question: BarFinalExamMcqQuestion) {
    setDraft({
      correctOptionIndex: question.correctOptionIndex,
      examDate: question.examDate ? question.examDate.slice(0, 10) : "",
      options: question.options.length ? question.options : ["", "", "", ""],
      question: question.question,
      status: question.status,
      subjectId: question.subjectId
    });
    setModalMode({ kind: "edit", question });
  }

  function closeModal() {
    setModalMode(null);
  }

  function setOptionValue(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? value : option))
    }));
  }

  function addOption() {
    setDraft((current) => {
      if (current.options.length >= 6) {
        return current;
      }
      return { ...current, options: [...current.options, ""] };
    });
  }

  function removeOption(index: number) {
    setDraft((current) => {
      if (current.options.length <= 2) {
        return current;
      }
      const nextOptions = current.options.filter((_, optionIndex) => optionIndex !== index);
      const nextCorrectIndex =
        current.correctOptionIndex === index
          ? 0
          : current.correctOptionIndex > index
            ? current.correctOptionIndex - 1
            : current.correctOptionIndex;
      return { ...current, options: nextOptions, correctOptionIndex: Math.max(0, Math.min(nextCorrectIndex, nextOptions.length - 1)) };
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h1 className={cn("text-xl font-semibold tracking-tight", isDark ? "text-white" : "text-slate-950")}>Bar Final Exam • MCQ</h1>
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>Select a subject and upload multiple choice questions.</p>
          </div>

          <button
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition",
              !canOpenCreate
                ? isDark
                  ? "cursor-not-allowed bg-slate-800 text-slate-500"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
                : isDark
                  ? "bg-white text-slate-950 hover:bg-slate-100"
                  : "bg-slate-950 text-white hover:bg-slate-900"
            )}
            disabled={!canOpenCreate}
            onClick={openCreate}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add question
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className={cn("rounded-[28px] border p-4", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
              <select
                className={cn(
                  "w-full rounded-2xl border px-3.5 py-3 text-sm outline-none",
                  isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                )}
                onChange={(event) => {
                  const next = event.target.value;
                  setSubjectId(next);
                  setSearch("");
                  setModalMode(null);
                  setDraft(buildDefaultDraft(next));
                }}
                value={subjectId}
              >
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Search</span>
              <div className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2.5", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                <Search className={cn("h-4 w-4", isDark ? "text-slate-400" : "text-slate-500")} />
                <input
                  className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-500")}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search questions"
                  value={search}
                />
              </div>
            </label>
          </div>

          <div className={cn("rounded-[28px] border p-4", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
            {!subjectId ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                Choose a subject to manage its MCQ questions.
              </div>
            ) : questionsQuery.isLoading ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                Loading questions...
              </div>
            ) : sortedItems.length === 0 ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                No MCQ questions yet for this subject.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedItems.map((item, index) => (
                  <div
                    className={cn(
                      "rounded-3xl border px-4 py-4",
                      isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"
                    )}
                    key={item.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", statusTone(item.status, isDark))}>
                            {statusLabel(item.status)}
                          </span>
                          <span className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-500")}>{item.subject.name}</span>
                        </div>
                        <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                          Question {index + 1}
                        </p>
                        <p className={cn("text-sm font-medium leading-relaxed", isDark ? "text-white" : "text-slate-950")}>
                          {truncateWords(stripHtml(item.question), 30).text}
                        </p>
                        <p className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-600")}>
                          {item.options.length} options • Correct option {item.correctOptionIndex + 1}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition",
                            isDark ? "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700 hover:text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
                          )}
                          onClick={() => openEdit(item)}
                          title="Edit question"
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition",
                            isDark ? "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-rose-500/50 hover:text-rose-200" : "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-700"
                          )}
                          onClick={() => deleteMutation.mutate(item.id)}
                          title="Delete question"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {modalMode ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={closeModal}>
          <div
            className={cn(
              "relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border",
              isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
            )}
            onClick={(event) => event.stopPropagation()}
            style={{ maxHeight: "82vh" }}
          >
            <div className={cn("flex items-start justify-between gap-4 border-b p-5", isDark ? "border-slate-800" : "border-slate-200")}>
              <div className="space-y-1">
                <p className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>
                  {modalMode.kind === "create" ? "Add question" : "Edit question"}
                </p>
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>Provide the MCQ prompt and options.</p>
              </div>
              <button
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                  isDark ? "border-slate-800 bg-slate-950/40 text-slate-200" : "border-slate-200 bg-white text-slate-700"
                )}
                onClick={closeModal}
                type="button"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-4">
                {modalMode.kind === "create" && draft.subjectId && nextQuestionNumber ? (
                  <div className={cn("rounded-3xl border px-4 py-3 text-sm", isDark ? "border-slate-800 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700")}>
                    This will be saved as <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-950")}>Question {nextQuestionNumber}</span> for the selected subject.
                  </div>
                ) : null}

                <label className="space-y-2">
                  <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
                  <select
                    className={cn(
                      "w-full rounded-2xl border px-3.5 py-3 text-sm outline-none",
                      isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                    )}
                    onChange={(event) => setDraft((current) => ({ ...current, subjectId: event.target.value }))}
                    value={draft.subjectId}
                  >
                    <option value="">Select subject</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Status</span>
                    <select
                      className={cn(
                        "w-full rounded-2xl border px-3.5 py-3 text-sm outline-none",
                        isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                      )}
                      onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as BarFinalExamQuestionStatus }))}
                      value={draft.status}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="PENDING_APPROVAL">Pending approval</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Exam date</span>
                    <input
                      className={cn(
                        "w-full rounded-2xl border px-3.5 py-3 text-sm outline-none",
                        isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                      )}
                      onChange={(event) => setDraft((current) => ({ ...current, examDate: event.target.value }))}
                      type="date"
                      value={draft.examDate}
                    />
                  </label>
                </div>

                <RichTextEditor
                  isDark={isDark}
                  label="Question"
                  minHeight={180}
                  maxHeight={300}
                  onChange={(value) => setDraft((current) => ({ ...current, question: value }))}
                  placeholder="Type the multiple choice question. Use headings, bullet points, and formatting as needed."
                  value={draft.question}
                />

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                      Options
                    </p>
                    <button
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition",
                        draft.options.length >= 6
                          ? isDark
                            ? "cursor-not-allowed border-slate-800 bg-slate-950/40 text-slate-600"
                            : "cursor-not-allowed border-slate-200 bg-white text-slate-400"
                          : isDark
                            ? "border-slate-800 bg-slate-950/40 text-slate-200 hover:border-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      )}
                      disabled={draft.options.length >= 6}
                      onClick={addOption}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      Add option
                    </button>
                  </div>

                  <div className="space-y-2">
                    {draft.options.map((option, index) => (
                      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]" key={index}>
                        <button
                          className={cn(
                            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition self-start mt-2",
                            isDark ? "border-slate-800 bg-slate-950/40 text-slate-200" : "border-slate-200 bg-white text-slate-700",
                            draft.correctOptionIndex === index
                              ? isDark
                                ? "border-emerald-500/40"
                                : "border-emerald-300"
                              : null
                          )}
                          onClick={() => setDraft((current) => ({ ...current, correctOptionIndex: index }))}
                          title="Mark as correct"
                          type="button"
                        >
                          {draft.correctOptionIndex === index ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                        </button>
                        <RichTextEditor
                          isDark={isDark}
                          label={`Option ${index + 1}`}
                          minHeight={72}
                          maxHeight={160}
                          onChange={(value) => setOptionValue(index, value)}
                          placeholder={`Option ${index + 1} — supports bold, italics, and lists`}
                          value={option}
                        />
                        <button
                          className={cn(
                            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition self-start mt-8",
                            draft.options.length <= 2
                              ? isDark
                                ? "cursor-not-allowed border-slate-800 bg-slate-950/40 text-slate-600"
                                : "cursor-not-allowed border-slate-200 bg-white text-slate-400"
                              : isDark
                                ? "border-slate-800 bg-slate-950/40 text-slate-200 hover:border-rose-500/40 hover:text-rose-200"
                                : "border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:text-rose-700"
                          )}
                          disabled={draft.options.length <= 2}
                          onClick={() => removeOption(index)}
                          title="Remove option"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={cn("flex flex-col gap-3 border-t p-5 sm:flex-row sm:items-center sm:justify-end", isDark ? "border-slate-800" : "border-slate-200")}>
              <button
                className={cn(
                  "inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-medium",
                  isDark ? "border-slate-800 bg-slate-950/40 text-slate-200" : "border-slate-200 bg-white text-slate-700"
                )}
                onClick={closeModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  !canSaveDraft || createMutation.isPending || updateMutation.isPending
                    ? isDark
                      ? "cursor-not-allowed bg-slate-800 text-slate-500"
                      : "cursor-not-allowed bg-slate-200 text-slate-500"
                    : isDark
                      ? "bg-white text-slate-950 hover:bg-slate-100"
                      : "bg-slate-950 text-white hover:bg-slate-900"
                )}
                disabled={!canSaveDraft || createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  const trimmedOptions = draft.options.map((option) => option.trim());
                  const cleanOptions: string[] = [];
                  const indexMap: number[] = [];

                  for (let index = 0; index < trimmedOptions.length; index += 1) {
                    const option = trimmedOptions[index];
                    if (!option) continue;
                    indexMap.push(index);
                    cleanOptions.push(option);
                  }

                  const remappedCorrectIndex = indexMap.indexOf(draft.correctOptionIndex);

                  if (remappedCorrectIndex < 0) {
                    showToast("Correct option cannot be empty.", "error");
                    return;
                  }

                  const payload: BarFinalExamMcqQuestionInput = {
                    ...draft,
                    correctOptionIndex: remappedCorrectIndex,
                    options: cleanOptions
                  };
                  if (modalMode.kind === "create") {
                    createMutation.mutate(payload);
                    return;
                  }
                  updateMutation.mutate({ payload, questionId: modalMode.question.id });
                }}
                type="button"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    {modalMode.kind === "create" ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    <span>{modalMode.kind === "create" ? "Save question" : "Update question"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StudentBarFinalExamsMcqPage() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const questionRefs = useRef(new Map<string, HTMLDivElement>());

  const subjectsQuery = useQuery({
    queryKey: queryKeys.studentBarFinalExamMcqSubjects(search),
    queryFn: () => fetchStudentBarFinalExamMcqSubjects(search)
  });

  const questionsQuery = useQuery({
    enabled: Boolean(selectedSubjectId),
    queryKey: queryKeys.studentBarFinalExamMcqQuestions(selectedSubjectId),
    queryFn: () => fetchStudentBarFinalExamMcqQuestions(selectedSubjectId)
  });

  useEffect(() => {
    const stateSubjectId = (location.state as any)?.subjectId;
    if (!stateSubjectId || typeof stateSubjectId !== "string") {
      return;
    }
    if (stateSubjectId === selectedSubjectId) {
      return;
    }
    setSelectedSubjectId(stateSubjectId);
  }, [location.key, location.state, selectedSubjectId]);

  const subjects = subjectsQuery.data?.subjects ?? [];
  const questions = questionsQuery.data?.items ?? [];
  const allQuestionIds = useMemo(() => questions.map((item) => item.id), [questions]);
  const activeSubject = subjects.find((subject) => subject.id === selectedSubjectId) ?? null;

  // Use the same attempt gating hook on the list page so per-question
  // badges and the subject-level progress bar update live as the student
  // works through the exam.
  const gating = useMcqAnswerGating(selectedSubjectId, allQuestionIds);

  useEffect(() => {
    if (!selectedSubjectId) {
      setActiveQuestionId("");
      return;
    }

    if (!questions.length) {
      setActiveQuestionId("");
      return;
    }

    if (activeQuestionId && questions.some((item) => item.id === activeQuestionId)) {
      return;
    }

    setActiveQuestionId(questions[0].id);
  }, [activeQuestionId, questions, selectedSubjectId]);

  function scrollToQuestion(questionId: string) {
    const target = questionRefs.current.get(questionId);
    if (!target) {
      return;
    }

    const topOffset = target.getBoundingClientRect().top + window.scrollY - 118;
    window.requestAnimationFrame(() => window.scrollTo({ behavior: "smooth", top: topOffset }));
  }

  function goToNextQuestion(currentQuestionId: string) {
    const currentIndex = questions.findIndex((item) => item.id === currentQuestionId);
    if (currentIndex === -1 || currentIndex >= questions.length - 1) {
      return;
    }

    const nextQuestionId = questions[currentIndex + 1].id;
    setActiveQuestionId(nextQuestionId);
    scrollToQuestion(nextQuestionId);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className={cn("text-xl font-semibold tracking-tight", isDark ? "text-white" : "text-slate-950")}>Bar Final Exam • MCQ</h1>
          <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>Pick a subject and attempt the multiple choice questions.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className={cn("rounded-[28px] border p-4", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Search subjects</span>
              <div className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2.5", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                <Search className={cn("h-4 w-4", isDark ? "text-slate-400" : "text-slate-500")} />
                <input
                  className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-500")}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  value={search}
                />
              </div>
            </label>

            <div className="mt-4 space-y-2">
              {subjectsQuery.isLoading ? (
                <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                  Loading subjects...
                </div>
              ) : subjects.length === 0 ? (
                <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                  No subjects found.
                </div>
              ) : (
                subjects.map((subject) => (
                  <button
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition",
                      selectedSubjectId === subject.id
                        ? isDark
                          ? "border-white/10 bg-white/10 text-white"
                          : "border-slate-200 bg-slate-950 text-white"
                        : isDark
                          ? "border-slate-800 bg-slate-950/30 text-slate-200 hover:border-slate-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                    key={subject.id}
                    onClick={() => setSelectedSubjectId(subject.id)}
                    type="button"
                  >
                    <span>{subject.name}</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className={cn("rounded-[28px] border p-4", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
            {!selectedSubjectId ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                Choose a subject to begin.
              </div>
            ) : questionsQuery.isLoading ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                Loading questions...
              </div>
            ) : questions.length === 0 ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                No published MCQ questions yet for this subject.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Subject-level answer-unlock progress summary */}
                <div className={cn("rounded-2xl border px-4 py-3", isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Progress</span>
                      <span className={cn("text-xs font-semibold", isDark ? "text-white" : "text-slate-950")}>
                        {gating.attemptedCount}/{gating.totalQuestions} attempted
                      </span>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        gating.allAttempted
                          ? isDark
                            ? "bg-emerald-500/15 text-emerald-200"
                            : "bg-emerald-50 text-emerald-700"
                          : isDark
                            ? "bg-amber-500/15 text-amber-200"
                            : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {gating.allAttempted ? "Answers unlocked" : "Attempt all to unlock"}
                    </span>
                  </div>
                  <div className={cn("mt-2.5 h-2 w-full overflow-hidden rounded-full", isDark ? "bg-slate-800" : "bg-slate-200")}>
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        gating.allAttempted
                          ? isDark
                            ? "bg-emerald-500"
                            : "bg-emerald-600"
                          : isDark
                            ? "bg-amber-500"
                            : "bg-amber-500"
                      )}
                      style={{
                        width: `${gating.totalQuestions > 0 ? Math.max(0, Math.min(100, (gating.attemptedCount / gating.totalQuestions) * 100)) : 0}%`
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                {questions.map((item, index) => {
                  const isActive = item.id === activeQuestionId;
                  const hasContent = stripHtml(item.question).length > 0;
                  const attempted = gating.attemptedSet.has(item.id);

                  return (
                    <div
                      className={cn(
                        "rounded-3xl border p-4 transition",
                        isActive
                          ? isDark
                            ? "border-white/15 bg-white/10"
                            : "border-slate-200 bg-slate-950 text-white"
                          : isDark
                            ? "border-slate-800 bg-slate-950/30"
                            : "border-slate-200 bg-slate-50"
                      )}
                      key={item.id}
                      ref={(node) => {
                        if (!node) return;
                        questionRefs.current.set(item.id, node);
                      }}
                    >
                      <div className="flex flex-col gap-3">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                                {activeSubject?.name ?? "Subject"} • Question {index + 1}
                              </p>
                              {/* Per-question status badge — Attempted / Not
                                  yet attempted. When all are attempted a
                                  global unlock badge shows above and per-
                                  question answer colors display in reader. */}
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                  attempted
                                    ? isDark
                                      ? "bg-sky-500/15 text-sky-200"
                                      : "bg-sky-50 text-sky-700"
                                    : isDark
                                      ? "bg-slate-700/60 text-slate-300"
                                      : "bg-slate-100 text-slate-600"
                                )}
                              >
                                {attempted ? "Attempted" : "Not attempted"}
                              </span>
                            </div>
                            {hasContent ? (
                              // Render rich text preview with controlled height
                              // for professional card layout.
                              <div
                                className={cn(
                                  "overflow-hidden text-sm leading-7 rich-text-preview rich-text-content",
                                  isDark ? "text-slate-200" : "text-slate-900"
                                )}
                                style={{
                                  display: "-webkit-box",
                                  WebkitLineClamp: 5,
                                  WebkitBoxOrient: "vertical",
                                  maxHeight: "9rem",
                                  overflow: "hidden"
                                }}
                                dangerouslySetInnerHTML={{ __html: item.question }}
                              />
                            ) : (
                              <p className={cn("text-sm leading-7 italic", isDark ? "text-slate-500" : "text-slate-500")}>No question content.</p>
                            )}
                            <p className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-600")}>{item.options.length} options</p>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              className={cn(
                                "inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition",
                                isDark ? "bg-white text-slate-950 hover:bg-slate-100" : "bg-slate-950 text-white hover:bg-slate-900"
                              )}
                              onClick={() => {
                                setActiveQuestionId(item.id);
                                navigate(`/app/bar-final-exams-mcq/${selectedSubjectId}/questions/${item.id}`);
                              }}
                              type="button"
                            >
                              <Eye className="h-4 w-4" />
                              {attempted ? "Review question" : "Attempt question"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            )}
          </div>
        </div>

        {typeof document !== "undefined" && selectedSubjectId && questions.length > 0
          ? createPortal(
              <div className="pointer-events-none fixed right-6 top-1/2 z-[140] flex -translate-y-1/2 flex-col gap-2">
                <button
                  className={cn(
                    "pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
                    isDark ? "border-white/15 bg-white/10 text-white hover:bg-white/15" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                  disabled={!activeQuestionId || questions[0]?.id === activeQuestionId}
                  onClick={() => {
                    const currentIndex = questions.findIndex((item) => item.id === activeQuestionId);
                    if (currentIndex <= 0) {
                      return;
                    }
                    const previousQuestionId = questions[currentIndex - 1].id;
                    setActiveQuestionId(previousQuestionId);
                    scrollToQuestion(previousQuestionId);
                  }}
                  title="Previous question"
                  type="button"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
                <button
                  className={cn(
                    "pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
                    isDark ? "border-white/15 bg-white/10 text-white hover:bg-white/15" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                  disabled={!activeQuestionId || questions[questions.length - 1]?.id === activeQuestionId}
                  onClick={() => goToNextQuestion(activeQuestionId)}
                  title="Next question"
                  type="button"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>,
              document.body
            )
          : null}
      </div>
    </div>
  );
}

export function StudentBarFinalExamMcqQuestionPage() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [result, setResult] = useState<{ correctOptionIndex: number; isCorrect: boolean; selectedOptionIndex: number } | null>(null);
  const routeParams = useParams();
  const subjectId = routeParams.subjectId ?? "";
  const questionId = routeParams.questionId ?? "";

  const subjectsQuery = useQuery({
    queryKey: queryKeys.studentBarFinalExamMcqSubjects(""),
    queryFn: () => fetchStudentBarFinalExamMcqSubjects("")
  });

  const questionsQuery = useQuery({
    enabled: Boolean(subjectId),
    queryKey: queryKeys.studentBarFinalExamMcqQuestions(subjectId),
    queryFn: () => fetchStudentBarFinalExamMcqQuestions(subjectId)
  });

  useEffect(() => {
    setSelectedOptionIndex(null);
    setResult(null);
  }, [questionId]);

  const subjects = subjectsQuery.data?.subjects ?? [];
  const questions = questionsQuery.data?.items ?? [];
  const allQuestionIds = useMemo(() => questions.map((item) => item.id), [questions]);

  // Answer gating: answers are revealed only when EVERY question in the
  // selected subject has been attempted. Individual submissions are still
  // graded server-side; but the UI only shows correct/incorrect styling
  // once the full set is complete.
  const gating = useMcqAnswerGating(subjectId, allQuestionIds);
  const canRevealAnswers = gating.allAttempted;

  const activeSubject = subjects.find((subject) => subject.id === subjectId) ?? null;
  const currentIndex = questions.findIndex((item) => item.id === questionId);
  const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null;
  const previousQuestionId = currentIndex > 0 ? questions[currentIndex - 1]?.id ?? "" : "";
  const nextQuestionId = currentIndex >= 0 && currentIndex < questions.length - 1 ? questions[currentIndex + 1]?.id ?? "" : "";

  const attemptMutation = useMutation({
    mutationFn: (payload: { questionId: string; selectedOptionIndex: number }) =>
      submitStudentBarFinalExamMcqAttempt(payload.questionId, { selectedOptionIndex: payload.selectedOptionIndex }),
    onSuccess: (data) => {
      setResult({
        correctOptionIndex: data.correctOptionIndex,
        isCorrect: data.isCorrect,
        selectedOptionIndex: data.selectedOptionIndex
      });
      // Persist attempt so answer gating can progress subject-wide.
      gating.registerAttempt(questionId);
    }
  });

  const canSubmit = selectedOptionIndex !== null && !attemptMutation.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                isDark ? "border-slate-800 bg-slate-950/20 text-slate-200 hover:bg-slate-950/40" : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
              )}
              onClick={() => navigate("/app/bar-final-exams-mcq", { state: { subjectId } })}
              type="button"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              Back to questions
            </button>
            <h1 className={cn("text-xl font-semibold tracking-tight", isDark ? "text-white" : "text-slate-950")}>Bar Final Exam • MCQ</h1>
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
              {activeSubject?.name ?? "Subject"} • {currentIndex >= 0 ? `Question ${currentIndex + 1} of ${questions.length}` : "Question"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                isDark ? "border-white/10 bg-white text-slate-950 hover:bg-slate-100" : "border-slate-200 bg-slate-950 text-white hover:bg-slate-900"
              )}
              disabled={!previousQuestionId}
              onClick={() => navigate(`/app/bar-final-exams-mcq/${subjectId}/questions/${previousQuestionId}`)}
              type="button"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              Previous
            </button>
            <button
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                isDark ? "border-white/10 bg-white text-slate-950 hover:bg-slate-100" : "border-slate-200 bg-slate-950 text-white hover:bg-slate-900"
              )}
              disabled={!nextQuestionId}
              onClick={() => navigate(`/app/bar-final-exams-mcq/${subjectId}/questions/${nextQuestionId}`)}
              type="button"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={cn("rounded-[28px] border p-5", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
          {questionsQuery.isLoading ? (
            <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
              Loading question...
            </div>
          ) : !currentQuestion ? (
            <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
              This question could not be found.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <div className={cn("rounded-3xl border p-5", isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Question</p>
                  {stripHtml(currentQuestion.question) ? (
                    // Rich-text question rendering with professional typography
                    // (headings, lists, blockquotes all styled via .rich-text-content).
                    <div
                      className={cn("mt-3 text-sm leading-8 rich-text-content", isDark ? "text-slate-200" : "text-slate-900")}
                      dangerouslySetInnerHTML={{ __html: currentQuestion.question }}
                    />
                  ) : (
                    <p className={cn("mt-3 text-sm leading-7 italic", isDark ? "text-slate-500" : "text-slate-500")}>No question content available.</p>
                  )}
                </div>

                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedOptionIndex === index;
                    // Only apply correct/incorrect styling if all questions
                    // in the subject have been attempted (answer gating).
                    // Otherwise we show the user's selection but no result.
                    const isCorrect = canRevealAnswers && result?.correctOptionIndex === index;
                    const isWrongSelection = canRevealAnswers && result && result.selectedOptionIndex === index && !result.isCorrect;

                    return (
                      <button
                        className={cn(
                          "flex w-full items-start gap-3 rounded-3xl border px-4 py-4 text-left text-sm transition",
                          isDark ? "border-slate-800 bg-slate-950/30 text-slate-200" : "border-slate-200 bg-white text-slate-900",
                          isSelected ? (isDark ? "border-white/15 bg-white/10" : "border-slate-950 bg-slate-950 text-white") : null,
                          canRevealAnswers && isCorrect ? (isDark ? "border-emerald-500/40" : "border-emerald-200") : null,
                          canRevealAnswers && isWrongSelection ? (isDark ? "border-rose-500/40" : "border-rose-200") : null
                        )}
                        disabled={attemptMutation.isPending}
                        key={index}
                        onClick={() => setSelectedOptionIndex(index)}
                        type="button"
                      >
                        <span className={cn("mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", isDark ? "border-slate-700" : "border-slate-200")}>
                          {index + 1}
                        </span>
                        {stripHtml(option) ? (
                          // Rich-text option rendering so admins can format
                          // options with bold/italic for legal terminology.
                          <div
                            className={cn("min-w-0 flex-1 leading-7 rich-text-content rich-text-preview", isSelected ? "text-inherit" : "")}
                            dangerouslySetInnerHTML={{ __html: option }}
                          />
                        ) : (
                          <span className="leading-7 italic opacity-70">Empty option</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {canRevealAnswers && result ? (
                  // Full answer reveal card — visible only when every question
                  // in the subject has been attempted.
                  <div
                    className={cn(
                      "rounded-3xl border p-4",
                      result.isCorrect
                        ? isDark
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : isDark
                          ? "border-rose-500/25 bg-rose-500/10 text-rose-100"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                    )}
                  >
                    <p className="text-xs uppercase tracking-[0.18em]">{result.isCorrect ? "Correct" : "Incorrect"}</p>
                    <p className="mt-2 text-sm">
                      Correct option: <span className="font-semibold">{result.correctOptionIndex + 1}</span>
                    </p>
                    {result.isCorrect ? null : (
                      <p className="mt-1 text-xs opacity-90">
                        You selected option {result.selectedOptionIndex + 1}.
                      </p>
                    )}
                  </div>
                ) : !canRevealAnswers && result ? (
                  // Attempt recorded, but other questions remain. Encourage
                  // the student to complete all questions to see results.
                  <div
                    className={cn(
                      "rounded-3xl border p-4",
                      isDark
                        ? "border-sky-500/25 bg-sky-500/10 text-sky-100"
                        : "border-sky-200 bg-sky-50 text-sky-800"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em]">Answer locked</p>
                        <p className="mt-2 text-sm">
                          Your attempt was saved. To reveal correct answers for ALL questions in this subject, attempt the remaining{" "}
                          <span className="font-semibold">{gating.totalQuestions - gating.attemptedCount}</span> question
                          {gating.totalQuestions - gating.attemptedCount === 1 ? "" : "s"}.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className={cn("rounded-3xl border px-4 py-4", isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Progress</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className={cn(isDark ? "text-slate-400" : "text-slate-600")}>Questions attempted</span>
                    <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-950")}>
                      {gating.attemptedCount} / {gating.totalQuestions}
                    </span>
                  </div>
                  {/* Compact progress bar — emerald when fully complete (answers
                      unlocked), amber until then. */}
                  <div className={cn("mt-3 h-2 w-full overflow-hidden rounded-full", isDark ? "bg-slate-800" : "bg-slate-200")}>
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        canRevealAnswers
                          ? isDark
                            ? "bg-emerald-500"
                            : "bg-emerald-600"
                          : isDark
                            ? "bg-amber-500"
                            : "bg-amber-500"
                      )}
                      style={{
                        width: `${gating.totalQuestions > 0 ? Math.max(0, Math.min(100, (gating.attemptedCount / gating.totalQuestions) * 100)) : 0}%`
                      }}
                    />
                  </div>
                  <p className={cn("mt-2 text-xs", isDark ? "text-slate-400" : "text-slate-600")}>
                    {canRevealAnswers
                      ? "All questions attempted — answers are unlocked."
                      : "Attempt all questions in this subject to reveal correct answers."}
                  </p>
                </div>

                <div className={cn("rounded-3xl border px-4 py-4", isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Controls</p>
                  <button
                    className={cn(
                      "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition",
                      !canSubmit
                        ? isDark
                          ? "cursor-not-allowed bg-slate-800 text-slate-500"
                          : "cursor-not-allowed bg-slate-200 text-slate-500"
                        : isDark
                          ? "bg-white text-slate-950 hover:bg-slate-100"
                          : "bg-slate-950 text-white hover:bg-slate-900"
                    )}
                    disabled={!canSubmit}
                    onClick={() => {
                      if (!currentQuestion || selectedOptionIndex === null) {
                        return;
                      }
                      attemptMutation.mutate({ questionId: currentQuestion.id, selectedOptionIndex });
                    }}
                    type="button"
                  >
                    {attemptMutation.isPending ? (
                      <span>Submitting...</span>
                    ) : canRevealAnswers && result ? (
                      <>
                        {result.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        <span>Submit answer</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4" />
                        <span>Submit answer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
