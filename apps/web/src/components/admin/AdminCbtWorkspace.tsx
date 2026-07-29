import { AxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Search,
  X,
  Trash2,
  Copy,
  Eye,
  CheckCircle2,
  XCircle,
  Download
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  fetchCbtList,
  fetchCbtDetail,
  createCbt,
  updateCbt,
  deleteCbt,
  duplicateCbt,
  publishCbt,
  unpublishCbt,
  fetchCbtResults,
  exportCbtResultsCsv,
  fetchQuestionList,
  addQuestionToCbt,
  removeQuestionFromCbt,
  type CbtQuestion,
  type CbtListFilters,
  type CbtCreateInput,
  type CbtUpdateInput
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const defaultFilters: CbtListFilters = {
  page: 1,
  pageSize: 20,
  search: "",
  status: "all",
  isEnabled: "all",
  sortBy: "createdAt",
  sortOrder: "desc",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateOnly(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function prettifyEnum(value?: string | null) {
  if (!value) return "Not available";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
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
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>CBT details</p>
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

function QuestionAssignmentCard({
  isDark,
  onClick,
  question,
  variant
}: {
  isDark: boolean;
  onClick: () => void;
  question: CbtQuestion;
  variant: "attached" | "available";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold leading-6", isDark ? "text-white" : "text-slate-950")}>{question.prompt}</p>
          <p className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
            {prettifyEnum(question.type)} • {prettifyEnum(question.difficulty)} • {question.points} points
          </p>
        </div>
        <button
          className={cn(
            "inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold transition",
            variant === "attached"
              ? isDark
                ? "bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                : "bg-rose-100 text-rose-700 hover:bg-rose-200"
              : isDark
                ? "bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          )}
          onClick={onClick}
          type="button"
        >
          {variant === "attached" ? "Remove" : "Add"}
        </button>
      </div>
    </div>
  );
}

function getCbtStatusTone(status: string) {
  switch (status) {
    case "PUBLISHED":
      return "green";
    case "DRAFT":
      return "amber";
    case "ARCHIVED":
      return "slate";
    default:
      return "slate";
  }
}

function createDefaultCbtDraft(): CbtCreateInput & { id?: string } {
  return {
    title: "",
    description: "",
    instructions: "",
    status: "DRAFT",
    isEnabled: false,
    durationSeconds: 60 * 60,
    passPercentage: 50,
    maxAttempts: 3,
    showScoreOnCompletion: true,
    showCorrectAnswersOnCompletion: false,
    showExplanationsOnCompletion: false,
    randomizeQuestions: true,
    randomizeAnswers: true,
    totalQuestions: 0,
    questionsToAnswer: null
  };
}

function buildCbtPayload(draft: CbtCreateInput & { id?: string }): CbtCreateInput {
  return {
    title: draft.title.trim(),
    description: draft.description?.trim() ?? "",
    instructions: draft.instructions?.trim() ?? "",
    courseId: draft.courseId || undefined,
    subjectId: draft.subjectId || undefined,
    topicId: draft.topicId || undefined,
    learningMaterialId: draft.learningMaterialId || undefined,
    durationSeconds: draft.durationSeconds,
    totalQuestions: draft.totalQuestions ?? 0,
    questionsToAnswer: draft.questionsToAnswer ?? null,
    passPercentage: draft.passPercentage,
    maxAttempts: draft.maxAttempts,
    startsAt: draft.startsAt || null,
    endsAt: draft.endsAt || null,
    isEnabled: draft.isEnabled,
    showScoreOnCompletion: draft.showScoreOnCompletion ?? true,
    showCorrectAnswersOnCompletion: draft.showCorrectAnswersOnCompletion ?? false,
    showExplanationsOnCompletion: draft.showExplanationsOnCompletion ?? false,
    status: draft.status,
    randomizeQuestions: draft.randomizeQuestions ?? true,
    randomizeAnswers: draft.randomizeAnswers ?? true
  };
}

export function AdminCbtWorkspace() {
  const { isDark } = useTheme();
  const authSession = useAuthStore((state) => state.session);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState(defaultFilters);
  const [selectedCbtId, setSelectedCbtId] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [questionBankSearch, setQuestionBankSearch] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: "success" | "error" }>>([]);
  const [cbtDraft, setCbtDraft] = useState<CbtCreateInput & { id?: string }>(createDefaultCbtDraft);

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

  const cbtsQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken),
    queryKey: queryKeys.adminCbts(filters),
    queryFn: () => fetchCbtList(filters),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true
  });

  const selectedCbtQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(selectedCbtId) && (isDrawerOpen || isResultsDrawerOpen),
    queryKey: queryKeys.adminCbtDetail(selectedCbtId || "none"),
    queryFn: () => fetchCbtDetail(selectedCbtId)
  });

  const cbtResultsQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(selectedCbtId) && isResultsDrawerOpen,
    queryKey: queryKeys.adminCbtResults(selectedCbtId || "none"),
    queryFn: () => fetchCbtResults(selectedCbtId)
  });

  const availableQuestionsQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(selectedCbtId) && isDrawerOpen,
    queryKey: queryKeys.adminQuestions({
      onlyQuestionBank: true,
      page: 1,
      pageSize: 12,
      search: questionBankSearch,
      sortBy: "updatedAt",
      sortOrder: "desc"
    }),
    queryFn: () =>
      fetchQuestionList({
        onlyQuestionBank: true,
        page: 1,
        pageSize: 12,
        search: questionBankSearch,
        sortBy: "updatedAt",
        sortOrder: "desc"
      })
  });

  useEffect(() => {
    const incomingSearch = searchParams.get("search") ?? "";
    setFilters((current) => {
      if (current.search === incomingSearch) return current;
      return { ...current, page: 1, search: incomingSearch };
    });
  }, [searchParams]);

  useEffect(() => {
    const openCbtId = searchParams.get("openCbtId");
    if (!openCbtId) return;
    setSelectedCbtId(openCbtId);
    setIsDrawerOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("openCbtId");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (selectedCbtQuery.data) {
      setCbtDraft({
        id: selectedCbtQuery.data.id,
        title: selectedCbtQuery.data.title,
        description: selectedCbtQuery.data.description || "",
        instructions: selectedCbtQuery.data.instructions || "",
        status: selectedCbtQuery.data.status,
        isEnabled: selectedCbtQuery.data.isEnabled,
        subjectId: selectedCbtQuery.data.subjectId,
        topicId: selectedCbtQuery.data.topicId,
        courseId: selectedCbtQuery.data.courseId,
        learningMaterialId: selectedCbtQuery.data.learningMaterialId,
        durationSeconds: selectedCbtQuery.data.durationSeconds,
        passPercentage: selectedCbtQuery.data.passPercentage,
        maxAttempts: selectedCbtQuery.data.maxAttempts,
        startsAt: selectedCbtQuery.data.startsAt,
        endsAt: selectedCbtQuery.data.endsAt,
        showScoreOnCompletion: selectedCbtQuery.data.showScoreOnCompletion,
        showCorrectAnswersOnCompletion: selectedCbtQuery.data.showCorrectAnswersOnCompletion,
        showExplanationsOnCompletion: selectedCbtQuery.data.showExplanationsOnCompletion,
        randomizeQuestions: selectedCbtQuery.data.randomizeQuestions,
        randomizeAnswers: selectedCbtQuery.data.randomizeAnswers,
        totalQuestions: selectedCbtQuery.data.totalQuestions,
        questionsToAnswer: selectedCbtQuery.data.questionsToAnswer
      });
    } else if (!isDrawerOpen && !isResultsDrawerOpen) {
      setCbtDraft(createDefaultCbtDraft());
    }
  }, [selectedCbtQuery.data, isDrawerOpen, isResultsDrawerOpen]);

  const createCbtMutation = useMutation({
    mutationFn: (payload: CbtCreateInput) => createCbt(payload),
    onSuccess: async (createdCbt) => {
      showToast(`Created CBT "${createdCbt.title}" successfully.`, "success");
      setIsCreateModalOpen(false);
      setCbtDraft(createDefaultCbtDraft());
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) });
      setSelectedCbtId(createdCbt.id);
      setIsDrawerOpen(true);
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not create the CBT right now."
          : "Could not create the CBT right now.";
      showToast(errorMessage, "error");
    }
  });

  const updateCbtMutation = useMutation({
    mutationFn: ({ cbtId, payload }: { cbtId: string; payload: CbtUpdateInput }) => updateCbt(cbtId, payload),
    onSuccess: async (updatedCbt) => {
      showToast(`Updated CBT "${updatedCbt.title}" successfully.`, "success");
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbtDetail(updatedCbt.id) });
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not update the CBT right now."
          : "Could not update the CBT right now.";
      showToast(errorMessage, "error");
    }
  });

  const deleteCbtMutation = useMutation({
    mutationFn: (cbtId: string) => deleteCbt(cbtId),
    onSuccess: async () => {
      showToast("Deleted CBT successfully.", "success");
      setIsDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) });
    },
    onError: () => {
      showToast("Could not delete the CBT right now.", "error");
    }
  });

  const duplicateCbtMutation = useMutation({
    mutationFn: (cbtId: string) => duplicateCbt(cbtId),
    onSuccess: async (duplicatedCbt) => {
      showToast(`Duplicated CBT to "${duplicatedCbt.title}" successfully.`, "success");
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) });
      setSelectedCbtId(duplicatedCbt.id);
      setIsDrawerOpen(true);
    },
    onError: () => {
      showToast("Could not duplicate the CBT right now.", "error");
    }
  });

  const publishCbtMutation = useMutation({
    mutationFn: (cbtId: string) => publishCbt(cbtId),
    onSuccess: async (updatedCbt) => {
      showToast(`Published CBT "${updatedCbt.title}" successfully.`, "success");
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbtDetail(updatedCbt.id) });
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not publish the CBT right now."
          : "Could not publish the CBT right now.";
      showToast(errorMessage, "error");
    }
  });

  const unpublishCbtMutation = useMutation({
    mutationFn: (cbtId: string) => unpublishCbt(cbtId),
    onSuccess: async (updatedCbt) => {
      showToast(`Unpublished CBT "${updatedCbt.title}" successfully.`, "success");
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCbtDetail(updatedCbt.id) });
    },
    onError: () => {
      showToast("Could not unpublish the CBT right now.", "error");
    }
  });

  const addQuestionToCbtMutation = useMutation({
    mutationFn: ({ cbtId, questionId }: { cbtId: string; questionId: string }) => addQuestionToCbt(cbtId, questionId),
    onSuccess: async () => {
      showToast("Added question to CBT successfully.", "success");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminCbtDetail(selectedCbtId || "none") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminQuestions({
          onlyQuestionBank: true,
          page: 1,
          pageSize: 12,
          search: questionBankSearch,
          sortBy: "updatedAt",
          sortOrder: "desc"
        }) })
      ]);
    },
    onError: () => {
      showToast("Could not attach that question right now.", "error");
    }
  });

  const removeQuestionFromCbtMutation = useMutation({
    mutationFn: ({ cbtId, questionId }: { cbtId: string; questionId: string }) => removeQuestionFromCbt(cbtId, questionId),
    onSuccess: async () => {
      showToast("Removed question from CBT successfully.", "success");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminCbts(filters) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminCbtDetail(selectedCbtId || "none") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminQuestions({
          onlyQuestionBank: true,
          page: 1,
          pageSize: 12,
          search: questionBankSearch,
          sortBy: "updatedAt",
          sortOrder: "desc"
        }) })
      ]);
    },
    onError: () => {
      showToast("Could not remove that question right now.", "error");
    }
  });

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({
      ...current,
      ...patch,
      page:
        patch.page ??
        (patch.pageSize || patch.search !== undefined || patch.status || patch.isEnabled || patch.sortBy || patch.sortOrder
          ? 1
          : current.page)
    }));
  }

  function updateCbtDraft(field: keyof typeof cbtDraft, value: any) {
    setCbtDraft((current) => ({ ...current, [field]: value }));
  }

  function openCreateModal() {
    setSelectedCbtId("");
    setCbtDraft(createDefaultCbtDraft());
    setIsCreateModalOpen(true);
  }

  async function handleCreateCbt() {
    if (!cbtDraft.title.trim()) {
      showToast("Enter a title for the CBT.", "error");
      return;
    }
    try {
      await createCbtMutation.mutateAsync(buildCbtPayload(cbtDraft));
    } catch {}
  }

  async function handleSaveCbt() {
    if (!selectedCbtId) return;
    if (!cbtDraft.title.trim()) {
      showToast("Enter a title for the CBT.", "error");
      return;
    }
    try {
      await updateCbtMutation.mutateAsync({ cbtId: selectedCbtId, payload: buildCbtPayload(cbtDraft) });
    } catch {}
  }

  async function handleExportResults(cbtId: string, cbtTitle: string) {
    try {
      const blob = await exportCbtResultsCsv(cbtId);
      downloadBlob(blob, `${cbtTitle.replace(/\s+/g, "_")}_results_${new Date().toISOString().slice(0, 10)}.csv`);
      showToast("Exported CBT results successfully.", "success");
    } catch {
      showToast("Could not export the results right now.", "error");
    }
  }

  const totalCbtsValue = cbtsQuery.data?.pagination.totalItems.toLocaleString() ?? "0";

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric isDark={isDark} label="Total CBTs" value={totalCbtsValue} />
        </div>

        <Surface className="p-5 lg:p-6" isDark={isDark}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Quick search</p>
              <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>CBT management</h3>
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
                  placeholder="Search by title, description..."
                  type="text"
                  value={filters.search}
                />
              </div>
              <StatusPill isDark={isDark} tone="slate">
                {prettifyEnum(filters.status === "all" ? "all statuses" : filters.status)}
              </StatusPill>
              <ToolbarButton isDark={isDark} onClick={() => void cbtsQuery.refetch()}>
                <RefreshCw className={cn("h-4 w-4", cbtsQuery.isFetching && "animate-spin")} />
                Refresh
              </ToolbarButton>
              <button className="button-primary !px-4 !py-3" onClick={openCreateModal} type="button">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create CBT
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
              <EmptyState isDark={isDark} message="Sign in as an administrator to load CBT management." />
            ) : cbtsQuery.isLoading ? (
              <div className="grid gap-3">
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              </div>
            ) : cbtsQuery.isError ? (
              <EmptyState isDark={isDark} message="Could not load CBT management. Refresh the page or sign in again." />
            ) : cbtsQuery.data?.cbts.length ? (
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr className={cn("text-left text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    <th className="pb-4 pr-4 font-medium">CBT</th>
                    <th className="pb-4 pr-4 font-medium">Status</th>
                    <th className="pb-4 pr-4 font-medium">Questions</th>
                    <th className="pb-4 pr-4 font-medium">Duration</th>
                    <th className="pb-4 pr-4 font-medium">Created</th>
                    <th className="pb-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {cbtsQuery.data.cbts.map((cbt) => (
                    <tr
                      className={cn("cursor-pointer transition", isDark ? "hover:bg-slate-900/70" : "hover:bg-slate-50")}
                      key={cbt.id}
                      onClick={() => { setSelectedCbtId(cbt.id); setIsDrawerOpen(true); }}
                      tabIndex={0}
                    >
                      <td className="py-4 pr-4 align-top">
                        <div>
                          <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{cbt.title}</p>
                          <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{cbt.description || "No description"}</p>
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <div className="space-y-2">
                          <StatusPill isDark={isDark} tone={getCbtStatusTone(cbt.status)}>
                            {prettifyEnum(cbt.status)}
                          </StatusPill>
                          <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                            {cbt.isEnabled ? "Enabled" : "Disabled"}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{cbt._count.questions}</p>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{Math.round(cbt.durationSeconds / 60)} min</p>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{formatDateOnly(cbt.createdAt)}</p>
                      </td>
                      <td className="py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          <IconActionButton
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); setSelectedCbtId(cbt.id); setIsDrawerOpen(true); }}
                            title="View CBT"
                          >
                            <Eye className="h-4 w-4" />
                          </IconActionButton>
                          <IconActionButton
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); setSelectedCbtId(cbt.id); setIsResultsDrawerOpen(true); }}
                            title="View results"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </IconActionButton>
                          <IconActionButton
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); void duplicateCbtMutation.mutateAsync(cbt.id); }}
                            title="Duplicate CBT"
                            disabled={duplicateCbtMutation.isPending}
                          >
                            <Copy className="h-4 w-4" />
                          </IconActionButton>
                          {cbt.status === "PUBLISHED" ? (
                            <IconActionButton
                              isDark={isDark}
                              onClick={(e) => { e.stopPropagation(); void unpublishCbtMutation.mutateAsync(cbt.id); }}
                              title="Unpublish"
                              disabled={unpublishCbtMutation.isPending}
                            >
                              <XCircle className="h-4 w-4" />
                            </IconActionButton>
                          ) : cbt.status === "DRAFT" ? (
                            <IconActionButton
                              isDark={isDark}
                              onClick={(e) => { e.stopPropagation(); void publishCbtMutation.mutateAsync(cbt.id); }}
                              title="Publish"
                              disabled={publishCbtMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </IconActionButton>
                          ) : null}
                          <IconActionButton
                            className={isDark ? "text-rose-200" : "text-rose-600"}
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); void deleteCbtMutation.mutateAsync(cbt.id); }}
                            title="Delete CBT"
                            disabled={deleteCbtMutation.isPending}
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
              <EmptyState isDark={isDark} message="No CBTs found. Create your first CBT to get started!" />
            )}
          </div>

          {cbtsQuery.data?.cbts.length ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                Page {cbtsQuery.data.pagination.page} of {cbtsQuery.data.pagination.totalPages}
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
                  disabled={filters.page >= (cbtsQuery.data?.pagination.totalPages ?? 1)}
                  onClick={() => updateFilters({ page: Math.min(cbtsQuery.data?.pagination.totalPages ?? 1, filters.page + 1) })}
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
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                Create a new CBT exam.
              </p>
              <div className="flex items-center gap-3">
                <button className="button-secondary !px-4 !py-3" onClick={() => setIsCreateModalOpen(false)} type="button">
                  Cancel
                </button>
                <button
                  className="button-primary min-w-[180px] !px-5 !py-3"
                  disabled={createCbtMutation.isPending}
                  onClick={() => void handleCreateCbt()}
                  type="button"
                >
                  {createCbtMutation.isPending ? "Creating..." : "Create CBT"}
                </button>
              </div>
            </div>
          }
          isDark={isDark}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create new CBT"
        >
          <div className="grid gap-4">
            <div>
              <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Title</label>
              <input
                className={cn(
                  "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                  isDark
                    ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
                    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
                )}
                onChange={(e) => updateCbtDraft("title", e.target.value)}
                placeholder="CBT title..."
                type="text"
                value={cbtDraft.title}
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Description</label>
              <textarea
                className={cn(
                  "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                  isDark
                    ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
                    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
                )}
                onChange={(e) => updateCbtDraft("description", e.target.value)}
                placeholder="Description or instructions..."
                rows={3}
                value={cbtDraft.description}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Duration (minutes)</label>
                <input
                  className={cn(
                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                      : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                  )}
                  min={1}
                  onChange={(e) => updateCbtDraft("durationSeconds", (parseInt(e.target.value) || 60) * 60)}
                  type="number"
                  value={Math.round((cbtDraft.durationSeconds || 3600) / 60)}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Pass percentage</label>
                <input
                  className={cn(
                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                      : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                  )}
                  min={0}
                  max={100}
                  onChange={(e) => updateCbtDraft("passPercentage", parseInt(e.target.value) || 50)}
                  type="number"
                  value={cbtDraft.passPercentage}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Max attempts</label>
                <input
                  className={cn(
                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                      : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                  )}
                  min={1}
                  onChange={(e) => updateCbtDraft("maxAttempts", parseInt(e.target.value) || 3)}
                  type="number"
                  value={cbtDraft.maxAttempts}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Status</label>
                <select
                  className={cn(
                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                      : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                  )}
                  onChange={(e) => updateCbtDraft("status", e.target.value as "DRAFT" | "PUBLISHED" | "ARCHIVED")}
                  value={cbtDraft.status}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                checked={cbtDraft.isEnabled}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                id="cbt-enabled"
                onChange={(e) => updateCbtDraft("isEnabled", e.target.checked)}
                type="checkbox"
              />
              <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")} htmlFor="cbt-enabled">
                Enable CBT
              </label>
            </div>
          </div>
        </RightAlignedDrawer>
      ) : null}

      {isDrawerOpen ? (
        <RightAlignedDrawer
          footer={
            <div className="flex items-center justify-between gap-4">
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                Update CBT details.
              </p>
              <div className="flex items-center gap-3">
                <button className="button-secondary !px-4 !py-3" onClick={() => setIsDrawerOpen(false)} type="button">
                  Close
                </button>
                <button
                  className="button-primary min-w-[180px] !px-5 !py-3"
                  disabled={updateCbtMutation.isPending}
                  onClick={() => void handleSaveCbt()}
                  type="button"
                >
                  {updateCbtMutation.isPending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          }
          isDark={isDark}
          onClose={() => setIsDrawerOpen(false)}
          title={selectedCbtQuery.data?.title ?? "CBT details"}
        >
          {!selectedCbtId ? (
            <EmptyState isDark={isDark} message="Select a CBT from the table to view details." />
          ) : selectedCbtQuery.isLoading ? (
            <div className="grid gap-3">
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
            </div>
          ) : selectedCbtQuery.isError || !selectedCbtQuery.data ? (
            <EmptyState isDark={isDark} message="Could not load CBT details." />
          ) : (
            <div className="grid gap-6">
              <div>
                <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Title</label>
                <input
                  className={cn(
                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
                      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
                  )}
                  onChange={(e) => updateCbtDraft("title", e.target.value)}
                  placeholder="CBT title..."
                  type="text"
                  value={cbtDraft.title}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Description</label>
                <textarea
                  className={cn(
                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
                      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
                  )}
                  onChange={(e) => updateCbtDraft("description", e.target.value)}
                  placeholder="Description or instructions..."
                  rows={3}
                  value={cbtDraft.description}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Instructions</label>
                <textarea
                  className={cn(
                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-blue-500"
                      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
                  )}
                  onChange={(e) => updateCbtDraft("instructions", e.target.value)}
                  placeholder="What should candidates know before they begin?"
                  rows={4}
                  value={cbtDraft.instructions}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Duration (minutes)</label>
                  <input
                    className={cn(
                      "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                    )}
                    min={1}
                    onChange={(e) => updateCbtDraft("durationSeconds", (parseInt(e.target.value) || 60) * 60)}
                    type="number"
                    value={Math.round((cbtDraft.durationSeconds || 3600) / 60)}
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Pass percentage</label>
                  <input
                    className={cn(
                      "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                    )}
                    min={0}
                    max={100}
                    onChange={(e) => updateCbtDraft("passPercentage", parseInt(e.target.value) || 50)}
                    type="number"
                    value={cbtDraft.passPercentage}
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Max attempts</label>
                  <input
                    className={cn(
                      "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                    )}
                    min={1}
                    onChange={(e) => updateCbtDraft("maxAttempts", parseInt(e.target.value) || 3)}
                    type="number"
                    value={cbtDraft.maxAttempts}
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Status</label>
                  <select
                    className={cn(
                      "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                    )}
                    onChange={(e) => updateCbtDraft("status", e.target.value as "DRAFT" | "PUBLISHED" | "ARCHIVED")}
                    value={cbtDraft.status}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
                <div>
                  <label className={cn("block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-900")}>Questions to answer</label>
                  <input
                    className={cn(
                      "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-white focus:border-blue-500"
                        : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                    )}
                    min={0}
                    onChange={(e) => updateCbtDraft("questionsToAnswer", e.target.value ? parseInt(e.target.value, 10) : null)}
                    placeholder="Leave empty to require all questions"
                    type="number"
                    value={cbtDraft.questionsToAnswer ?? ""}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  {
                    checked: cbtDraft.isEnabled,
                    description: "Make this CBT available once it is published.",
                    field: "isEnabled",
                    id: "cbt-enabled-edit",
                    label: "Enable CBT"
                  },
                  {
                    checked: cbtDraft.showScoreOnCompletion,
                    description: "Show each candidate their score immediately after submission.",
                    field: "showScoreOnCompletion",
                    id: "cbt-show-score-edit",
                    label: "Show score immediately"
                  },
                  {
                    checked: cbtDraft.showCorrectAnswersOnCompletion,
                    description: "Reveal the correct answers after submission.",
                    field: "showCorrectAnswersOnCompletion",
                    id: "cbt-show-correct-edit",
                    label: "Reveal correct answers"
                  },
                  {
                    checked: cbtDraft.showExplanationsOnCompletion,
                    description: "Show answer explanations after submission.",
                    field: "showExplanationsOnCompletion",
                    id: "cbt-show-explanations-edit",
                    label: "Show explanations"
                  },
                  {
                    checked: cbtDraft.randomizeQuestions,
                    description: "Shuffle the order of questions for each attempt.",
                    field: "randomizeQuestions",
                    id: "cbt-randomize-questions-edit",
                    label: "Randomize questions"
                  },
                  {
                    checked: cbtDraft.randomizeAnswers,
                    description: "Shuffle answer options for each attempt.",
                    field: "randomizeAnswers",
                    id: "cbt-randomize-answers-edit",
                    label: "Randomize answers"
                  }
                ].map((toggle) => (
                  <label
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border p-4",
                      isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"
                    )}
                    htmlFor={toggle.id}
                    key={toggle.id}
                  >
                    <input
                      checked={toggle.checked}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      id={toggle.id}
                      onChange={(e) => updateCbtDraft(toggle.field as keyof typeof cbtDraft, e.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <span className={cn("block text-sm font-medium", isDark ? "text-slate-100" : "text-slate-900")}>{toggle.label}</span>
                      <span className={cn("mt-1 block text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{toggle.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>
                        Attached questions ({selectedCbtQuery.data._count.questions})
                      </h4>
                      <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                        These questions will be served to candidates in this CBT.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {selectedCbtQuery.data.questions.length ? selectedCbtQuery.data.questions.map((q) => (
                      <QuestionAssignmentCard
                        isDark={isDark}
                        key={q.id}
                        onClick={() => void removeQuestionFromCbtMutation.mutateAsync({ cbtId: selectedCbtId, questionId: q.id })}
                        question={q}
                        variant="attached"
                      />
                    )) : (
                      <EmptyState isDark={isDark} message="No questions attached yet. Add questions from the bank to make this CBT ready for candidates." />
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>Question bank</h4>
                      <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                        Content admins and superadmins can upload questions here and attach them to this CBT.
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3",
                      isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-700"
                    )}
                  >
                    <Search className="h-4 w-4" />
                    <input
                      className={cn("w-full bg-transparent text-sm outline-none placeholder:text-inherit", isDark ? "text-white" : "text-slate-900")}
                      onChange={(event) => setQuestionBankSearch(event.target.value)}
                      placeholder="Search question bank..."
                      type="text"
                      value={questionBankSearch}
                    />
                  </div>
                  <div className="mt-3 space-y-3">
                    {availableQuestionsQuery.isLoading ? (
                      <div className="grid gap-3">
                        <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                        <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                      </div>
                    ) : availableQuestionsQuery.data?.questions.length ? (
                      availableQuestionsQuery.data.questions
                        .filter((question) => !selectedCbtQuery.data.questions.some((attached) => attached.id === question.id))
                        .map((question) => (
                          <QuestionAssignmentCard
                            isDark={isDark}
                            key={question.id}
                            onClick={() => void addQuestionToCbtMutation.mutateAsync({ cbtId: selectedCbtId, questionId: question.id })}
                            question={question}
                            variant="available"
                          />
                        ))
                    ) : (
                      <EmptyState isDark={isDark} message="No question bank items match this search yet." />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </RightAlignedDrawer>
      ) : null}

      {isResultsDrawerOpen ? (
        <RightAlignedDrawer
          footer={
            selectedCbtQuery.data ? (
              <div className="flex items-center justify-between gap-4">
                <button
                  className="button-secondary !px-4 !py-3"
                  disabled={cbtResultsQuery.isFetching}
                  onClick={() => void handleExportResults(selectedCbtId, selectedCbtQuery.data!.title)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export results
                  </span>
                </button>
                <button className="button-primary min-w-[180px] !px-5 !py-3" onClick={() => setIsResultsDrawerOpen(false)} type="button">
                  Close
                </button>
              </div>
            ) : null
          }
          isDark={isDark}
          onClose={() => setIsResultsDrawerOpen(false)}
          title={`Results: ${selectedCbtQuery.data?.title ?? "CBT"}`}
        >
          {!selectedCbtId ? (
            <EmptyState isDark={isDark} message="Select a CBT to view results." />
          ) : cbtResultsQuery.isLoading ? (
            <div className="grid gap-3">
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
            </div>
          ) : cbtResultsQuery.isError || !cbtResultsQuery.data ? (
            <EmptyState isDark={isDark} message="Could not load CBT results." />
          ) : (
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-4">
                <MiniMetric isDark={isDark} label="Total attempts" value={cbtResultsQuery.data.totalAttempts.toString()} />
                <MiniMetric isDark={isDark} label="Passed" value={cbtResultsQuery.data.passedAttempts.toString()} />
                <MiniMetric isDark={isDark} label="Failed" value={cbtResultsQuery.data.failedAttempts.toString()} />
                <MiniMetric isDark={isDark} label="Avg score" value={`${cbtResultsQuery.data.averageScore.toFixed(1)}%`} />
              </div>
              <div className="space-y-3">
                <h4 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>Attempts</h4>
                {cbtResultsQuery.data.attempts.length ? (
                  cbtResultsQuery.data.attempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className={cn(
                        "rounded-2xl border p-4",
                        isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{attempt.user.fullName}</p>
                          <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                            Attempt {attempt.attemptNumber} • {attempt.submittedAt ? formatDateTime(attempt.submittedAt) : "Not submitted"}
                          </p>
                        </div>
                        <StatusPill isDark={isDark} tone={attempt.result?.passed ? "green" : "red"}>
                          {attempt.result?.passed ? "Passed" : "Failed"}
                        </StatusPill>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div>
                          <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Score</p>
                          <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>
                            {attempt.result ? `${attempt.result.earnedPoints}/${attempt.result.totalPoints} (${attempt.result.percentageScore.toFixed(1)}%)` : "No result"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState isDark={isDark} message="No attempts yet for this CBT." />
                )}
              </div>
            </div>
          )}
        </RightAlignedDrawer>
      ) : null}
    </>
  );
}
