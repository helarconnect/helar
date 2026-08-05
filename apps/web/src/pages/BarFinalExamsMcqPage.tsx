import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { CheckCircle2, ChevronRight, Circle, Eye, Pencil, Plus, Search, Trash2, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";

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

                <label className="space-y-2">
                  <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Question</span>
                  <textarea
                    className={cn(
                      "min-h-[140px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                    )}
                    onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
                    placeholder="Type the question..."
                    value={draft.question}
                  />
                </label>

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
                            "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
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
                        <input
                          className={cn(
                            "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                            isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                          )}
                          onChange={(event) => setOptionValue(index, event.target.value)}
                          placeholder={`Option ${index + 1}`}
                          value={option}
                        />
                        <button
                          className={cn(
                            "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
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
  const activeSubject = subjects.find((subject) => subject.id === selectedSubjectId) ?? null;

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
              <div className="space-y-3">
                {questions.map((item, index) => {
                  const isActive = item.id === activeQuestionId;
                  const preview = truncateWords(stripHtml(item.question), 100);

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
                            <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                              {activeSubject?.name ?? "Subject"} • Question {index + 1}
                            </p>
                            <p className={cn("text-sm leading-7", isDark ? "text-slate-200" : "text-slate-900")}>{preview.text}</p>
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
                              Attempt question
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
                  <div className={cn("mt-3 whitespace-pre-wrap text-sm leading-7", isDark ? "text-slate-200" : "text-slate-900")}>
                    {currentQuestion.question}
                  </div>
                </div>

                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedOptionIndex === index;
                    const isCorrect = result?.correctOptionIndex === index;
                    const isWrongSelection = result && result.selectedOptionIndex === index && !result.isCorrect;

                    return (
                      <button
                        className={cn(
                          "flex w-full items-start gap-3 rounded-3xl border px-4 py-4 text-left text-sm transition",
                          isDark ? "border-slate-800 bg-slate-950/30 text-slate-200" : "border-slate-200 bg-white text-slate-900",
                          isSelected ? (isDark ? "border-white/15 bg-white/10" : "border-slate-950 bg-slate-950 text-white") : null,
                          result && isCorrect ? (isDark ? "border-emerald-500/40" : "border-emerald-200") : null,
                          result && isWrongSelection ? (isDark ? "border-rose-500/40" : "border-rose-200") : null
                        )}
                        disabled={attemptMutation.isPending}
                        key={index}
                        onClick={() => setSelectedOptionIndex(index)}
                        type="button"
                      >
                        <span className={cn("mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", isDark ? "border-slate-700" : "border-slate-200")}>
                          {index + 1}
                        </span>
                        <span className="whitespace-pre-wrap leading-7">{option}</span>
                      </button>
                    );
                  })}
                </div>

                {result ? (
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
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
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
                    ) : result ? (
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
