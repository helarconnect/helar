import { AxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Search,
  X,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  fetchQuestionList,
  fetchQuestionDetail,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  type QuestionListFilters,
  type QuestionCreateInput,
  type QuestionUpdateInput
} from "@/lib/admin-api";
import { formatDateDMY } from "@/lib/date";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const defaultFilters: QuestionListFilters = {
  page: 1,
  pageSize: 20,
  search: "",
  questionType: "all",
  difficulty: "all",
  sortBy: "createdAt",
  sortOrder: "desc",
  onlyQuestionBank: true,
};

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

function ToastViewport({
  isDark,
  onDismiss,
  toasts
}: {
  isDark: boolean;
  onDismiss: (id: number) => void;
  toasts: Array<{ id: number; message: string; tone: "success" | "error" }>;
}) {
  if (!toasts.length || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[999] flex justify-end px-4 pt-4 sm:px-6 sm:pt-6"
    >
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
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

function RightAlignedDrawer({
  children,
  footer,
  isDark,
  onClose,
  title
}: {
  children: ReactNode;
  footer?: ReactNode;
  isDark: boolean;
  onClose: () => void;
  title: string;
}) {
  if (typeof document === "undefined") return null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
      <div
        className={cn(
          "grid h-[78vh] w-[min(70vw,1120px)] min-w-[960px] max-w-[1120px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[32px] border shadow-[0_40px_140px_rgba(15,23,42,0.4)]",
          isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
        )}
      >
        <div className={cn("flex items-center justify-between border-b px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <div>
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Question details</p>
            <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>{title}</h3>
          </div>
          <button
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full border transition",
              isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
            )}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4 lg:px-6 lg:py-5">{children}</div>
        {footer ? (
          <div
            className={cn("border-t px-5 py-4 lg:px-6", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function ToolbarButton({
  children,
  disabled,
  isDark,
  onClick,
  type = "button"
}: {
  children: ReactNode;
  disabled?: boolean;
  isDark: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        isDark
          ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800"
          : "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50"
      )}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function IconActionButton({
  children,
  className,
  disabled,
  isDark,
  onClick,
  title
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  isDark: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition disabled:cursor-not-allowed disabled:opacity-60",
        isDark
          ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800"
          : "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function StatusPill({
  children,
  isDark,
  tone
}: {
  children: ReactNode;
  isDark: boolean;
  tone: "amber" | "green" | "red" | "slate" | "blue";
}) {
  const classes = {
    amber: isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-700",
    green: isDark ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: isDark ? "border-rose-500/25 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700",
    slate: isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-slate-100 text-slate-700",
    blue: isDark ? "border-blue-500/25 bg-blue-500/10 text-blue-200" : "border-blue-200 bg-blue-50 text-blue-700"
  } as const;

  return <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", classes[tone])}>{children}</span>;
}

function MiniMetric({
  isDark,
  label,
  value
}: {
  isDark: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("rounded-[22px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>{label}</p>
      <p className={cn("mt-3 text-3xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{value}</p>
    </div>
  );
}

function getDifficultyTone(level: string) {
  switch (level) {
    case "BEGINNER":
      return "green";
    case "INTERMEDIATE":
      return "amber";
    case "ADVANCED":
      return "red";
    default:
      return "slate";
  }
}

export function AdminQuestionBankWorkspace() {
  const { isDark } = useTheme();
  const authSession = useAuthStore((state) => state.session);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState(defaultFilters);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: "success" | "error" }>>([]);
  const [questionDraft, setQuestionDraft] = useState<QuestionCreateInput & { id?: string }>({
    prompt: "",
    type: "MULTIPLE_CHOICE",
    points: 1,
    difficulty: "INTERMEDIATE",
    options: [],
    isInQuestionBank: true,
  });

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(message: string, tone: "success" | "error", options?: { durationMs?: number }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, options?.durationMs ?? 4000);
  }

  const questionsQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken),
    queryKey: queryKeys.adminQuestions(filters),
    queryFn: () => fetchQuestionList(filters),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true
  });

  const selectedQuestionQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(selectedQuestionId) && isDrawerOpen,
    queryKey: queryKeys.adminQuestionDetail(selectedQuestionId || "none"),
    queryFn: () => fetchQuestionDetail(selectedQuestionId)
  });

  useEffect(() => {
    const incomingSearch = searchParams.get("search") ?? "";
    setFilters((current) => {
      if (current.search === incomingSearch) return current;
      return { ...current, page: 1, search: incomingSearch };
    });
  }, [searchParams]);

  useEffect(() => {
    if (selectedQuestionQuery.data) {
      setQuestionDraft({
        id: selectedQuestionQuery.data.id,
        prompt: selectedQuestionQuery.data.prompt,
        type: selectedQuestionQuery.data.type,
        options: selectedQuestionQuery.data.options.map((o) => ({
          label: o.label,
          text: o.text,
          isCorrect: o.isCorrect,
          displayOrder: o.displayOrder
        })),
        points: selectedQuestionQuery.data.points,
        explanation: selectedQuestionQuery.data.explanation,
        subjectId: selectedQuestionQuery.data.subjectId,
        topicId: selectedQuestionQuery.data.topicId,
        difficulty: selectedQuestionQuery.data.difficulty,
        isInQuestionBank: selectedQuestionQuery.data.isInQuestionBank,
        imageUrl: selectedQuestionQuery.data.imageUrl,
        attachmentUrls: selectedQuestionQuery.data.attachmentUrls,
      });
    } else if (!isDrawerOpen) {
      setQuestionDraft({
        prompt: "",
        type: "MULTIPLE_CHOICE",
        points: 1,
        difficulty: "INTERMEDIATE",
        options: [],
        isInQuestionBank: true,
      });
    }
  }, [selectedQuestionQuery.data, isDrawerOpen]);

  const createQuestionMutation = useMutation({
    mutationFn: (payload: QuestionCreateInput) => createQuestion(payload),
    onSuccess: async (createdQuestion) => {
      showToast("Created question successfully.", "success");
      setIsCreateModalOpen(false);
      setQuestionDraft({
        prompt: "",
        type: "MULTIPLE_CHOICE",
        points: 1,
        difficulty: "INTERMEDIATE",
        options: [],
        isInQuestionBank: true,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminQuestions(filters) });
      setSelectedQuestionId(createdQuestion.id);
      setIsDrawerOpen(true);
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not create the question right now."
          : "Could not create the question right now.";
      showToast(errorMessage, "error");
    }
  });

  const updateQuestionMutation = useMutation({
    mutationFn: ({ questionId, payload }: { questionId: string; payload: QuestionUpdateInput }) => updateQuestion(questionId, payload),
    onSuccess: async (updatedQuestion) => {
      showToast("Updated question successfully.", "success");
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminQuestions(filters) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminQuestionDetail(updatedQuestion.id) });
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not update the question right now."
          : "Could not update the question right now.";
      showToast(errorMessage, "error");
    }
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: string) => deleteQuestion(questionId),
    onSuccess: async () => {
      showToast("Deleted question successfully.", "success");
      setIsDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminQuestions(filters) });
    },
    onError: () => {
      showToast("Could not delete the question right now.", "error");
    }
  });

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({
      ...current,
      ...patch,
      page:
        patch.page ??
        (patch.pageSize || patch.search !== undefined || patch.questionType || patch.difficulty || patch.sortBy || patch.sortOrder || patch.subjectId || patch.topicId
          ? 1
          : current.page)
    }));
  }

  function updateQuestionDraft(field: keyof typeof questionDraft, value: any) {
    setQuestionDraft((current) => ({ ...current, [field]: value }));
  }

  function getChoiceLabel(index: number) {
    const baseCode = "A".charCodeAt(0);
    const nextCode = baseCode + index;
    return nextCode <= "Z".charCodeAt(0) ? String.fromCharCode(nextCode) : `Option ${index + 1}`;
  }

  function normalizeOptionsForType(nextType: QuestionCreateInput["type"], currentOptions: any[]) {
    const options = Array.isArray(currentOptions) ? currentOptions : [];

    if (nextType === "TRUE_FALSE") {
      return [
        { label: "True", text: "True", isCorrect: true, displayOrder: 1 },
        { label: "False", text: "False", isCorrect: false, displayOrder: 2 }
      ];
    }

    if (nextType === "SHORT_ANSWER") {
      if (options.length > 0) {
        return options.map((option, index) => ({
          ...option,
          label: option.label?.trim() ? option.label : `Accepted answer ${index + 1}`,
          isCorrect: true,
          displayOrder: index + 1
        }));
      }

      return [{ label: "Accepted answer 1", text: "", isCorrect: true, displayOrder: 1 }];
    }

    if (nextType === "MULTIPLE_CHOICE" || nextType === "MULTIPLE_SELECT") {
      const baseOptions =
        options.length >= 2
          ? options.map((option, index) => ({
              ...option,
              label: getChoiceLabel(index),
              displayOrder: index + 1
            }))
          : Array.from({ length: 4 }).map((_, index) => ({
              label: getChoiceLabel(index),
              text: "",
              isCorrect: false,
              displayOrder: index + 1
            }));

      const correctIndexes = baseOptions.flatMap((option, index) => (option.isCorrect ? [index] : []));

      if (nextType === "MULTIPLE_CHOICE") {
        const selectedIndex = correctIndexes[0] ?? 0;
        return baseOptions.map((option, index) => ({ ...option, isCorrect: index === selectedIndex }));
      }

      if (correctIndexes.length === 0) {
        const nextOptions = [...baseOptions];
        nextOptions[0] = { ...nextOptions[0], isCorrect: true };
        return nextOptions;
      }

      return baseOptions;
    }

    return options;
  }

  function updateQuestionType(nextType: QuestionCreateInput["type"]) {
    setQuestionDraft((current) => ({
      ...current,
      type: nextType,
      options: normalizeOptionsForType(nextType, current.options || [])
    }));
  }

  function addOption() {
    const newDisplayOrder = (questionDraft.options?.length || 0) + 1;
    setQuestionDraft((current) => ({
      ...current,
      options: [
        ...(current.options || []),
        {
          label:
            current.type === "SHORT_ANSWER"
              ? `Accepted answer ${newDisplayOrder}`
              : current.type === "MULTIPLE_CHOICE" || current.type === "MULTIPLE_SELECT"
                ? getChoiceLabel(newDisplayOrder - 1)
                : `Option ${newDisplayOrder}`,
          text: "",
          isCorrect: current.type === "SHORT_ANSWER",
          displayOrder: newDisplayOrder
        }
      ]
    }));
  }

  function updateOption(index: number, field: "label" | "text" | "isCorrect", value: any) {
    setQuestionDraft((current) => {
      const newOptions = [...(current.options || [])];
      newOptions[index] = { ...newOptions[index], [field]: value };
      if (field === "isCorrect" && value && current.type === "MULTIPLE_CHOICE") {
        newOptions.forEach((opt, i) => {
          if (i !== index) opt.isCorrect = false;
        });
      }
      return { ...current, options: newOptions };
    });
  }

  function removeOption(index: number) {
    setQuestionDraft((current) => ({
      ...current,
      options: (current.options || []).filter((_, i) => i !== index).map((opt, i) => ({ ...opt, displayOrder: i + 1 }))
    }));
  }

  async function handleCreateQuestion() {
    if (!questionDraft.prompt.trim()) {
      showToast("Enter question text.", "error");
      return;
    }
    try {
      await createQuestionMutation.mutateAsync({ ...questionDraft, prompt: questionDraft.prompt.trim() });
    } catch {}
  }

  async function handleSaveQuestion() {
    if (!selectedQuestionId) return;
    if (!questionDraft.prompt.trim()) {
      showToast("Enter question text.", "error");
      return;
    }
    try {
      await updateQuestionMutation.mutateAsync({
        questionId: selectedQuestionId,
        payload: { ...questionDraft, prompt: questionDraft.prompt.trim() }
      });
    } catch {}
  }

  const totalQuestionsValue = questionsQuery.data?.pagination.totalItems.toLocaleString() ?? "0";

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric isDark={isDark} label="Total questions" value={totalQuestionsValue} />
        </div>

        <Surface className="p-5 lg:p-6" isDark={isDark}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Quick search</p>
              <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>Question bank</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={cn(
                  "flex min-w-[280px] items-center gap-3 rounded-2xl border px-4 py-3",
                  isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-700"
                )}
              >
                <Search className="h-4 w-4" />
                <input
                  className={cn("w-full bg-transparent text-sm outline-none placeholder:text-inherit", isDark ? "text-white" : "text-slate-900")}
                  onChange={(event) => updateFilters({ search: event.target.value })}
                  placeholder="Search questions..."
                  type="text"
                  value={filters.search}
                />
              </div>
              <select
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm outline-none transition",
                  isDark
                    ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                    : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                )}
                onChange={(e) => updateFilters({ questionType: e.target.value as any })}
                value={filters.questionType}
              >
                <option value="all">All types</option>
                <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                <option value="TRUE_FALSE">True/False</option>
                <option value="MULTIPLE_SELECT">Multiple Select</option>
                <option value="SHORT_ANSWER">Short Answer</option>
              </select>
              <select
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm outline-none transition",
                  isDark
                    ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                    : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                )}
                onChange={(e) => updateFilters({ difficulty: e.target.value as any })}
                value={filters.difficulty}
              >
                <option value="all">All difficulties</option>
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
              <ToolbarButton isDark={isDark} onClick={() => void questionsQuery.refetch()}>
                <RefreshCw className={cn("h-4 w-4", questionsQuery.isFetching && "animate-spin")} />
                Refresh
              </ToolbarButton>
              <button className="button-primary !px-4 !py-3" onClick={() => setIsCreateModalOpen(true)} type="button">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add question
                </span>
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            {!hasHydrated ? (
              <div className="grid gap-3">
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              </div>
            ) : !authSession?.accessToken ? (
              <EmptyState isDark={isDark} message="Sign in as an administrator to load question bank." />
            ) : questionsQuery.isLoading ? (
              <div className="grid gap-3">
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              </div>
            ) : questionsQuery.isError ? (
              <EmptyState isDark={isDark} message="Could not load question bank. Refresh the page or sign in again." />
            ) : questionsQuery.data?.questions.length ? (
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr className={cn("text-left text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    <th className="pb-4 pr-4 font-medium">Question</th>
                    <th className="pb-4 pr-4 font-medium">Type</th>
                    <th className="pb-4 pr-4 font-medium">Difficulty</th>
                    <th className="pb-4 pr-4 font-medium">Marks</th>
                    <th className="pb-4 pr-4 font-medium">Created</th>
                    <th className="pb-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {questionsQuery.data.questions.map((q) => (
                    <tr
                      className={cn("cursor-pointer transition", isDark ? "hover:bg-slate-900/70" : "hover:bg-slate-50")}
                      key={q.id}
                      onClick={() => { setSelectedQuestionId(q.id); setIsDrawerOpen(true); }}
                      tabIndex={0}
                    >
                      <td className="py-4 pr-4 align-top">
                        <div>
                          <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{q.prompt}</p>
                          {q.subject?.name || q.topic?.name ? (
                            <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                              {[q.subject?.name, q.topic?.name].filter(Boolean).join(" • ")}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <StatusPill isDark={isDark} tone="slate">
                          {prettifyEnum(q.type)}
                        </StatusPill>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <StatusPill isDark={isDark} tone={getDifficultyTone(q.difficulty)}>
                          {prettifyEnum(q.difficulty)}
                        </StatusPill>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{q.points}</p>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{formatDateDMY(q.createdAt)}</p>
                      </td>
                      <td className="py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          <IconActionButton
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); setSelectedQuestionId(q.id); setIsDrawerOpen(true); }}
                            title="View question"
                          >
                            <Edit className="h-4 w-4" />
                          </IconActionButton>
                          <IconActionButton
                            className={isDark ? "text-rose-200" : "text-rose-600"}
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); void deleteQuestionMutation.mutateAsync(q.id); }}
                            title="Delete question"
                            disabled={deleteQuestionMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState isDark={isDark} message="No questions found. Add your first question to get started!" />
            )}
          </div>

          {questionsQuery.data?.questions.length ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                Page {questionsQuery.data.pagination.page} of {questionsQuery.data.pagination.totalPages}
              </p>
              <div className="flex items-center gap-3">
                <button
                  className="button-secondary !px-4 !py-3"
                  disabled={filters.page <= 1}
                  onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="button-primary !px-4 !py-3"
                  disabled={filters.page >= (questionsQuery.data?.pagination.totalPages ?? 1)}
                  onClick={() => updateFilters({ page: Math.min(questionsQuery.data?.pagination.totalPages ?? 1, filters.page + 1) })}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </Surface>
      </div>

      {isCreateModalOpen ? (
        <RightAlignedDrawer
          footer={
            <div className="flex items-center justify-between gap-4">
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>Create a new question.</p>
              <div className="flex items-center gap-3">
                <button className="button-secondary !px-4 !py-3" onClick={() => setIsCreateModalOpen(false)} type="button">
                  Cancel
                </button>
                <button
                  className="button-primary min-w-[180px] !px-5 !py-3"
                  disabled={createQuestionMutation.isPending}
                  onClick={() => void handleCreateQuestion()}
                  type="button"
                >
                  {createQuestionMutation.isPending ? "Creating..." : "Create question"}
                </button>
              </div>
            </div>
          }
          isDark={isDark}
          onClose={() => setIsCreateModalOpen(false)}
          title="Add question"
        >
          <QuestionForm
            isDark={isDark}
            questionDraft={questionDraft}
            updateQuestionDraft={updateQuestionDraft}
            updateQuestionType={updateQuestionType}
            addOption={addOption}
            updateOption={updateOption}
            removeOption={removeOption}
          />
        </RightAlignedDrawer>
      ) : null}

      {isDrawerOpen ? (
        <RightAlignedDrawer
          footer={
            <div className="flex items-center justify-between gap-4">
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>Update question details.</p>
              <div className="flex items-center gap-3">
                <button className="button-secondary !px-4 !py-3" onClick={() => setIsDrawerOpen(false)} type="button">
                  Close
                </button>
                <button
                  className="button-primary min-w-[180px] !px-5 !py-3"
                  disabled={updateQuestionMutation.isPending}
                  onClick={() => void handleSaveQuestion()}
                  type="button"
                >
                  {updateQuestionMutation.isPending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          }
          isDark={isDark}
          onClose={() => setIsDrawerOpen(false)}
          title="Edit question"
        >
          {!selectedQuestionId ? (
            <EmptyState isDark={isDark} message="Select a question from the table to view details." />
          ) : selectedQuestionQuery.isLoading ? (
            <div className="grid gap-3">
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
            </div>
          ) : selectedQuestionQuery.isError || !selectedQuestionQuery.data ? (
            <EmptyState isDark={isDark} message="Could not load question details." />
          ) : (
            <QuestionForm
              isDark={isDark}
              questionDraft={questionDraft}
              updateQuestionDraft={updateQuestionDraft}
              updateQuestionType={updateQuestionType}
              addOption={addOption}
              updateOption={updateOption}
              removeOption={removeOption}
            />
          )}
        </RightAlignedDrawer>
      ) : null}
    </>
  );
}

function QuestionForm({
  isDark,
  questionDraft,
  updateQuestionDraft,
  updateQuestionType,
  addOption,
  updateOption,
  removeOption
}: {
  isDark: boolean;
  questionDraft: any;
  updateQuestionDraft: (field: string, value: any) => void;
  updateQuestionType: (type: QuestionCreateInput["type"]) => void;
  addOption: () => void;
  updateOption: (index: number, field: "label" | "text" | "isCorrect", value: any) => void;
  removeOption: (index: number) => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Question text</label>
        <textarea
          className={cn(
            "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
            isDark
              ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
              : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
          )}
          onChange={(e) => updateQuestionDraft("prompt", e.target.value)}
          placeholder="Enter your question..."
          rows={3}
          value={questionDraft.prompt}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Question type</label>
          <select
            className={cn(
              "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
              isDark
                ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
            )}
            onChange={(e) => updateQuestionType(e.target.value as QuestionCreateInput["type"])}
            value={questionDraft.type}
          >
            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
            <option value="TRUE_FALSE">True/False</option>
            <option value="MULTIPLE_SELECT">Multiple Select</option>
            <option value="SHORT_ANSWER">Short Answer</option>
          </select>
        </div>
        <div>
          <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Points</label>
          <input
            className={cn(
              "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
              isDark
                ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
            )}
            min={0}
            onChange={(e) => updateQuestionDraft("points", parseInt(e.target.value) || 1)}
            type="number"
            value={questionDraft.points}
          />
        </div>
        <div>
          <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Difficulty</label>
          <select
            className={cn(
              "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
              isDark
                ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
            )}
            onChange={(e) => updateQuestionDraft("difficulty", e.target.value as any)}
            value={questionDraft.difficulty}
          >
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </div>
      </div>
      {questionDraft.type === "TRUE_FALSE" ? (
        <div>
          <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Correct answer</label>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="trueFalse"
                value="true"
                checked={
                  questionDraft.options?.length === 2 &&
                  ((questionDraft.options[0]?.label === "True" && questionDraft.options[0]?.isCorrect) ||
                    (questionDraft.options[1]?.label === "True" && questionDraft.options[1]?.isCorrect))
                }
                onChange={() => {
                  const newOptions = [
                    { label: "True", text: "True", isCorrect: true, displayOrder: 1 },
                    { label: "False", text: "False", isCorrect: false, displayOrder: 2 },
                  ];
                  updateQuestionDraft("options", newOptions);
                }}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              True
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="trueFalse"
                value="false"
                checked={
                  questionDraft.options?.length === 2 &&
                  ((questionDraft.options[0]?.label === "False" && questionDraft.options[0]?.isCorrect) ||
                    (questionDraft.options[1]?.label === "False" && questionDraft.options[1]?.isCorrect))
                }
                onChange={() => {
                  const newOptions = [
                    { label: "True", text: "True", isCorrect: false, displayOrder: 1 },
                    { label: "False", text: "False", isCorrect: true, displayOrder: 2 },
                  ];
                  updateQuestionDraft("options", newOptions);
                }}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              False
            </label>
          </div>
        </div>
      ) : questionDraft.type === "MULTIPLE_CHOICE" || questionDraft.type === "MULTIPLE_SELECT" || questionDraft.type === "SHORT_ANSWER" ? (
        <div>
          <div className="flex items-center justify-between">
            <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>
              {questionDraft.type === "SHORT_ANSWER" ? "Accepted answers" : "Options"}
            </label>
            <button className="button-secondary !px-3 !py-2 text-sm" onClick={addOption} type="button">
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {questionDraft.type === "SHORT_ANSWER" ? "Add answer" : "Add option"}
              </span>
            </button>
          </div>
          {questionDraft.type === "SHORT_ANSWER" ? (
            <p className={cn("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
              Add one or more accepted answers. These are used for automatic grading so students can see their scores immediately.
            </p>
          ) : null}
          <div className="mt-3 space-y-3">
            {(questionDraft.options || []).map((opt: any, index: number) => (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4",
                  isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
                )}
              >
                {questionDraft.type === "MULTIPLE_CHOICE" ? (
                  <input
                    checked={opt.isCorrect}
                    className="mt-1 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                    name="multipleChoiceCorrect"
                    onChange={() => updateOption(index, "isCorrect", true)}
                    type="radio"
                  />
                ) : (
                  <input
                    checked={opt.isCorrect}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    disabled={questionDraft.type === "SHORT_ANSWER"}
                    onChange={(e) => updateOption(index, "isCorrect", e.target.checked)}
                    type="checkbox"
                  />
                )}
                <div className="flex-1 grid gap-2">
                  <input
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-sm outline-none transition",
                      isDark
                        ? "border-slate-600 bg-slate-900 text-white focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                    )}
                    onChange={(e) => updateOption(index, "label", e.target.value)}
                    placeholder={questionDraft.type === "SHORT_ANSWER" ? `Answer label ${index + 1}...` : `Label ${index + 1}...`}
                    type="text"
                    value={opt.label}
                  />
                  <input
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-sm outline-none transition",
                      isDark
                        ? "border-slate-600 bg-slate-900 text-white focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                    )}
                    onChange={(e) => updateOption(index, "text", e.target.value)}
                    placeholder={
                      questionDraft.type === "SHORT_ANSWER"
                        ? `Accepted answer ${index + 1}...`
                        : `Option ${index + 1} description...`
                    }
                    type="text"
                    value={opt.text}
                  />
                </div>
                <button
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                    isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-200"
                  )}
                  onClick={() => removeOption(index)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Subject ID (optional)</label>
          <input
            className={cn(
              "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
              isDark
                ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
                : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
            )}
            onChange={(e) => updateQuestionDraft("subjectId", e.target.value)}
            placeholder="Subject ID..."
            type="text"
            value={questionDraft.subjectId}
          />
        </div>
        <div>
          <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Topic ID (optional)</label>
          <input
            className={cn(
              "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
              isDark
                ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
                : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
            )}
            onChange={(e) => updateQuestionDraft("topicId", e.target.value)}
            placeholder="Topic ID..."
            type="text"
            value={questionDraft.topicId}
          />
        </div>
      </div>
      <div>
        <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Explanation (optional)</label>
        <textarea
          className={cn(
            "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
            isDark
              ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
              : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
          )}
          onChange={(e) => updateQuestionDraft("explanation", e.target.value)}
          placeholder="Add an explanation for the correct answer..."
          rows={2}
          value={questionDraft.explanation}
        />
      </div>
    </div>
  );
}
