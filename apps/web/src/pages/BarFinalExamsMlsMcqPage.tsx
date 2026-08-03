import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { CheckCircle2, ChevronRight, Eye, Pencil, Plus, Search, Trash2, X, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useTheme } from "@/hooks/useTheme";
import {
  type BarFinalExamQuestion,
  type BarFinalExamQuestionInput,
  type BarFinalExamQuestionStatus,
  createAdminBarFinalExamQuestion,
  deleteAdminBarFinalExamQuestion,
  fetchAdminBarFinalExamQuestions,
  fetchBarFinalExamFormOptions,
  fetchStudentBarFinalExamQuestions,
  fetchStudentBarFinalExamSubjects,
  updateAdminBarFinalExamQuestion
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type AdminModalMode = { kind: "create" } | { kind: "edit"; question: BarFinalExamQuestion } | null;

type ToastTone = "success" | "error";

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
            <div className="flex items-start gap-2.5">
              {toast.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
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
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
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

function truncateWords(value: string, maxWords: number) {
  const normalized = value.trim();
  if (!normalized) {
    return {
      isTruncated: false,
      text: ""
    };
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return {
      isTruncated: false,
      text: words.join(" ")
    };
  }

  return {
    isTruncated: true,
    text: `${words.slice(0, maxWords).join(" ")}…`
  };
}

function buildDefaultDraft(subjectId: string): BarFinalExamQuestionInput {
  return {
    answer: "",
    question: "",
    status: "PUBLISHED",
    subjectId
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

export function AdminBarFinalExamsMlsMcqPage() {
  const queryClient = useQueryClient();
  const { isDark } = useTheme();
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<AdminModalMode>(null);
  const [draft, setDraft] = useState<BarFinalExamQuestionInput>(() => buildDefaultDraft(""));
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([]);

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(message: string, tone: ToastTone, options?: { durationMs?: number }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, options?.durationMs ?? 4000);
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

  const formOptionsQuery = useQuery({
    queryKey: queryKeys.adminBarFinalExamFormOptions,
    queryFn: fetchBarFinalExamFormOptions
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
    queryKey: queryKeys.adminBarFinalExamQuestions(filters),
    queryFn: () => fetchAdminBarFinalExamQuestions(filters)
  });

  const countSubjectId = modalMode?.kind === "create" ? draft.subjectId : subjectId;
  const questionCountQuery = useQuery({
    enabled: Boolean(countSubjectId),
    queryKey: queryKeys.adminBarFinalExamQuestions({
      page: 1,
      pageSize: 1,
      search: "",
      status: "all",
      subjectId: countSubjectId || undefined
    }),
    queryFn: () =>
      fetchAdminBarFinalExamQuestions({
        page: 1,
        pageSize: 1,
        search: "",
        status: "all",
        subjectId: countSubjectId
      })
  });

  const createMutation = useMutation({
    mutationFn: () => createAdminBarFinalExamQuestion(draft),
    onSuccess: async () => {
      setSubjectId(draft.subjectId);
      await queryClient.invalidateQueries({ queryKey: ["admin-bar-final-exam-questions"] });
      setModalMode(null);
      showToast("Question saved.", "success");
    },
    onError: (error) => {
      showToast(resolveMutationError(error), "error");
    }
  });

  const updateMutation = useMutation({
    mutationFn: (questionId: string) => updateAdminBarFinalExamQuestion(questionId, draft),
    onSuccess: async () => {
      setSubjectId(draft.subjectId);
      await queryClient.invalidateQueries({ queryKey: ["admin-bar-final-exam-questions"] });
      setModalMode(null);
      showToast("Question updated.", "success");
    },
    onError: (error) => {
      showToast(resolveMutationError(error), "error");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (questionId: string) => deleteAdminBarFinalExamQuestion(questionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-bar-final-exam-questions"] });
      showToast("Question deleted.", "success");
    },
    onError: (error) => {
      showToast(resolveMutationError(error), "error");
    }
  });

  const subjects = formOptionsQuery.data?.subjects ?? [];
  const items = questionsQuery.data?.items ?? [];
  const sortedItems = useMemo(
    () => [...items].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [items]
  );
  const canSaveDraft = Boolean(draft.subjectId) && stripHtml(draft.question).length >= 2 && stripHtml(draft.answer).length >= 2;
  const canOpenCreate = !formOptionsQuery.isLoading && subjects.length > 0;
  const nextQuestionNumber =
    countSubjectId && modalMode?.kind === "create" ? (questionCountQuery.data?.pagination.totalItems ?? 0) + 1 : null;

  function openCreate() {
    setDraft(buildDefaultDraft(subjectId));
    setModalMode({ kind: "create" });
  }

  function openEdit(question: BarFinalExamQuestion) {
    setDraft({
      answer: question.answer,
      question: question.question,
      status: question.status,
      subjectId: question.subjectId
    });
    setModalMode({ kind: "edit", question });
  }

  function closeModal() {
    setModalMode(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h1 className={cn("text-xl font-semibold tracking-tight", isDark ? "text-white" : "text-slate-950")}>
              Bar Final Exams NLS-MCQ (Q & A)
            </h1>
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
              Select a subject and upload questions with their answers.
            </p>
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
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                Subject
              </span>
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

            <label className="mt-4 flex items-center gap-3 rounded-2xl border px-3.5 py-3">
              <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
              <input
                className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-600" : "text-slate-950 placeholder:text-slate-400")}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search questions or answers"
                value={search}
              />
            </label>
          </div>

          <div className={cn("rounded-[28px] border p-4", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
            {!subjectId ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                Select a subject to view and manage questions.
              </div>
            ) : questionsQuery.isLoading ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                Loading questions...
              </div>
            ) : items.length === 0 ? (
              <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                No questions yet for this subject.
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
                        <p className={cn("text-sm font-medium leading-relaxed", isDark ? "text-white" : "text-slate-950")}>{stripHtml(item.question)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                            isDark ? "border-slate-800 bg-slate-950/50 text-slate-200" : "border-slate-200 bg-white text-slate-700"
                          )}
                          onClick={() => openEdit(item)}
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                            isDark ? "border-slate-800 bg-slate-950/50 text-rose-200" : "border-slate-200 bg-white text-rose-600"
                          )}
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(item.id)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div
            className={cn(
              "relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border",
              isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
            )}
            style={{ maxHeight: "82vh" }}
          >
            <div className={cn("flex items-start justify-between gap-4 border-b p-5", isDark ? "border-slate-800" : "border-slate-200")}>
              <div className="space-y-1">
                <p className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>
                  {modalMode.kind === "create" ? "Add question" : "Edit question"}
                </p>
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>Choose the subject for this question.</p>
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

              <RichTextEditor
                isDark={isDark}
                label="Question"
                minHeight={160}
                maxHeight={260}
                onChange={(value) => setDraft((current) => ({ ...current, question: value }))}
                placeholder="Type the question..."
                value={draft.question}
              />

              <RichTextEditor
                isDark={isDark}
                label="Answer"
                minHeight={240}
                maxHeight={340}
                onChange={(value) => setDraft((current) => ({ ...current, answer: value }))}
                placeholder="Type the answer..."
                value={draft.answer}
              />
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
                  if (modalMode.kind === "create") {
                    createMutation.mutate();
                    return;
                  }
                  updateMutation.mutate(modalMode.question.id);
                }}
                type="button"
              >
                {modalMode.kind === "create" ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save question"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
    </div>
  );
}

export function StudentBarFinalExamsMlsMcqPage() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const questionRefs = useRef(new Map<string, HTMLDivElement>());

  const subjectsQuery = useQuery({
    queryKey: queryKeys.studentBarFinalExamSubjects(search),
    queryFn: () => fetchStudentBarFinalExamSubjects(search)
  });

  const questionsQuery = useQuery({
    enabled: Boolean(selectedSubjectId),
    queryKey: queryKeys.studentBarFinalExamQuestions(selectedSubjectId),
    queryFn: () => fetchStudentBarFinalExamQuestions(selectedSubjectId)
  });

  const subjects = subjectsQuery.data?.subjects ?? [];
  const questions = questionsQuery.data?.items ?? [];
  const activeSubject = subjects.find((subject) => subject.id === selectedSubjectId) ?? null;

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
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const node = questionRefs.current.get(questionId);
      node?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
        <div className="space-y-1">
          <h1 className={cn("text-xl font-semibold tracking-tight", isDark ? "text-white" : "text-slate-950")}>
            Bar Final Exams NLS-MCQ (Q & A)
          </h1>
          <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
            Choose a subject to reveal all available questions, then open the answer when you are ready.
          </p>
        </div>

        <div className={cn("rounded-[28px] border p-4", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-3 rounded-2xl border px-3.5 py-3">
              <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
              <input
                className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-600" : "text-slate-950 placeholder:text-slate-400")}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subjects"
                value={search}
              />
            </label>
            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
              Subjects
            </p>
          </div>

          <div className="mt-4">
            {subjectsQuery.isLoading ? (
              <div className={cn("rounded-2xl border px-4 py-5 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                Loading subjects...
              </div>
            ) : subjects.length === 0 ? (
              <div className={cn("rounded-2xl border px-4 py-5 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
                No subjects with published questions yet.
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {subjects.map((subject) => {
                  const isActive = subject.id === selectedSubjectId;
                  return (
                    <button
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                        isActive
                          ? isDark
                            ? "border-white/10 bg-white/10 text-white"
                            : "border-slate-950/10 bg-slate-950 text-white"
                          : isDark
                            ? "border-slate-800 bg-slate-950/20 text-slate-200 hover:bg-slate-950/40"
                            : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                      )}
                      key={subject.id}
                      onClick={() => {
                        setSelectedSubjectId(subject.id);
                      }}
                      type="button"
                    >
                      <span>{subject.name}</span>
                      <ChevronRight className={cn("h-4 w-4", isActive ? "text-white" : isDark ? "text-slate-500" : "text-slate-400")} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={cn("rounded-[28px] border p-4", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
          {!selectedSubjectId ? (
            <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
              Select a subject to reveal questions.
            </div>
          ) : questionsQuery.isLoading ? (
            <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
              Loading questions...
            </div>
          ) : questions.length === 0 ? (
            <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
              No questions published yet for {activeSubject?.name ?? "this subject"}.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>
                  {activeSubject?.name ?? "Subject"} questions
                </p>
                <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-500")}>{questions.length} questions</p>
              </div>

              {questions.map((item, index) => {
                const isActive = item.id === activeQuestionId;
                const preview = truncateWords(stripHtml(item.question), 100);

                return (
                  <div
                    className={cn(
                      "rounded-3xl border p-4 transition",
                      isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50",
                      isActive && (isDark ? "border-white/10 bg-white/5" : "border-slate-300 bg-white")
                    )}
                    key={item.id}
                    ref={(node) => {
                      if (node) {
                        questionRefs.current.set(item.id, node);
                        return;
                      }
                      questionRefs.current.delete(item.id);
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                            Question {index + 1}
                          </p>
                          <p className={cn("text-sm leading-7", isDark ? "text-slate-200" : "text-slate-900")}>
                            {preview.text}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            className={cn(
                              "inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition",
                              isDark ? "bg-white text-slate-950 hover:bg-slate-100" : "bg-slate-950 text-white hover:bg-slate-900"
                            )}
                            onClick={() => {
                              setActiveQuestionId(item.id);
                              navigate(`/app/bar-final-exams-nls-mcq/${selectedSubjectId}/questions/${item.id}`);
                            }}
                            type="button"
                          >
                            <Eye className="h-4 w-4" />
                            View full question & answer
                          </button>

                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {typeof document !== "undefined" && selectedSubjectId && questions.length > 0
          ? createPortal(
              <div className="pointer-events-none fixed right-6 top-1/2 z-[140] flex -translate-y-1/2 flex-col gap-2">
                <button
                  className={cn(
                    "pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_18px_50px_rgba(15,23,42,0.22)] transition disabled:cursor-not-allowed disabled:opacity-60",
                    isDark
                      ? "border-white/10 bg-white text-slate-950 hover:bg-slate-100"
                      : "border-slate-200 bg-slate-950 text-white hover:bg-slate-900"
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
                    "pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_18px_50px_rgba(15,23,42,0.22)] transition disabled:cursor-not-allowed disabled:opacity-60",
                    isDark
                      ? "border-white/10 bg-white text-slate-950 hover:bg-slate-100"
                      : "border-slate-200 bg-slate-950 text-white hover:bg-slate-900"
                  )}
                  disabled={!activeQuestionId || questions[questions.length - 1]?.id === activeQuestionId}
                  onClick={() => {
                    goToNextQuestion(activeQuestionId);
                  }}
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
