import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Eye,
  Pencil,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  clearAdminLibraryTransportChunks,
  createAdminLibraryMaterial,
  deleteAdminLibraryMaterial,
  extractServerErrorMessage,
  fetchAdminLibraryMaterials,
  prepareAdminLibraryTransport,
  type AdminLibraryFilters,
  type AdminLibraryMaterial,
  type AdminLibraryMaterialInput,
  type AdminLibraryMaterialType,
  type AdminLibrarySection,
  type AdminLibraryTransportProgressStep,
  updateAdminLibraryMaterial
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn, isContentAdmin } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useAuthStore } from "@/store/auth-store";

type ToastTone = "error" | "success";

const defaultFilters: Required<AdminLibraryFilters> = {
  materialType: "all",
  page: 1,
  pageSize: 12,
  search: "",
  sortBy: "reportNumber",
  sortOrder: "desc"
};

const sectionCopy: Record<
  AdminLibrarySection,
  {
    badge: string;
    description: string;
    title: string;
  }
> = {
  "cases-and-ratios": {
    badge: "Admin library",
    description: "Review, update, and publish case materials with clear links, estimated reading time, and quick action controls.",
    title: "Manage cases and ratios with a cleaner editorial workflow."
  },
  helarpedia: {
    badge: "Admin library",
    description: "Curate legal-term encyclopedia entries, definition summaries, and links to related Helar law report citations.",
    title: "Manage Helarpedia issue definitions, summaries, and related cases."
  },
  "law-reports": {
    badge: "Admin library",
    description: "Organize report entries, keep court references tidy, and maintain a dependable archive for legal research.",
    title: "Manage law reports with faster editorial control."
  },
  "subject-summaries": {
    badge: "Admin library",
    description: "Keep subject summaries concise, current, and easy for learners to find from the right admin workspace.",
    title: "Manage subject summaries without leaving the admin workspace."
  }
};

const standardMaterialTypeOptions: AdminLibraryMaterialType[] = ["PDF", "DOCX", "EPUB", "PPT", "VIDEO", "AUDIO", "IMAGE", "REFERENCE_ENTRY"];
const lawReportCourtOptions: AdminLibraryMaterialType[] = [
  "COURT_OF_APPEAL",
  "FEDERAL_HIGH_COURT",
  "HIGH_COURT",
  "SUPREME_COURT",
  "TRIBUNAL"
];
const helarpediaMaterialTypeOptions: AdminLibraryMaterialType[] = ["REFERENCE_ENTRY"];

function isLawReportsSection(section: AdminLibrarySection) {
  return section === "law-reports";
}

function isHelarpediaSection(section: AdminLibrarySection) {
  return section === "helarpedia";
}

function isReportNumberedSection(section: AdminLibrarySection) {
  return isLawReportsSection(section) || isHelarpediaSection(section);
}

function getMaterialTypeOptions(section: AdminLibrarySection) {
  if (isLawReportsSection(section)) return lawReportCourtOptions;
  if (isHelarpediaSection(section)) return helarpediaMaterialTypeOptions;
  return standardMaterialTypeOptions;
}

function getDefaultReportNumber() {
  return `Helar-${new Date().getFullYear()}-501`;
}

function getDefaultHelarpediaNumber() {
  return "Helarpedia-1000";
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(dateString));
}

function prettifyMaterialType(value: string) {
  const labels: Record<string, string> = {
    AUDIO: "Audio",
    COURT_OF_APPEAL: "Court of Appeal",
    DOCX: "DOCX",
    EPUB: "EPUB",
    FEDERAL_HIGH_COURT: "Federal High Court",
    HIGH_COURT: "High Court",
    IMAGE: "Image",
    PDF: "PDF",
    PPT: "PPT",
    REFERENCE_ENTRY: "Helarpedia entry",
    SUPREME_COURT: "Supreme Court",
    TRIBUNAL: "Tribunal",
    VIDEO: "Video"
  };

  return labels[value] ?? value.replace(/_/g, " ");
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

function estimateMinutesFromBody(body: string) {
  const plainText = stripHtml(body);

  if (!plainText) {
    return 0;
  }

  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

function createDraft(section: AdminLibrarySection, nextReportNumber?: string | null): AdminLibraryMaterialInput {
  return {
    body: "",
    downloadable: true,
    estimatedMins: 0,
    materialType: isLawReportsSection(section)
      ? "COURT_OF_APPEAL"
      : isHelarpediaSection(section)
        ? "REFERENCE_ENTRY"
        : "PDF",
    reportDate: isLawReportsSection(section) ? new Date().toISOString().slice(0, 10) : "",
    reportNumber: isReportNumberedSection(section)
      ? nextReportNumber ?? (isLawReportsSection(section) ? getDefaultReportNumber() : getDefaultHelarpediaNumber())
      : "",
    sharingEnabled: isReportNumberedSection(section),
    storageUrl: "",
    summary: "",
    title: ""
  };
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
    <div className="pointer-events-none fixed right-6 top-6 z-[120] flex w-full max-w-sm flex-col gap-3">
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

function ToolbarButton({
  children,
  disabled,
  isDark,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  isDark: boolean;
  onClick?: () => void;
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
      type="button"
    >
      {children}
    </button>
  );
}

function IconActionButton({
  children,
  className,
  isDark,
  onClick,
  title
}: {
  children: ReactNode;
  className?: string;
  isDark: boolean;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
        isDark
          ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800"
          : "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50",
        className
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}


function LibraryMaterialModal({
  draft,
  isDark,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  section,
  submitLabel,
  title,
  saveProgress
}: {
  draft: AdminLibraryMaterialInput;
  isDark: boolean;
  isSaving: boolean;
  onChange: (field: keyof AdminLibraryMaterialInput, value: string | boolean | number) => void;
  onClose: () => void;
  onSubmit: () => void;
  section: AdminLibrarySection;
  submitLabel: string;
  title: string;
  saveProgress:
    | { kind: "idle" }
    | { kind: "uploading"; bodyCompleted: number; bodyTotal: number; summaryCompleted: number; summaryTotal: number }
    | { kind: "finalizing" };
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const isLawReports = isLawReportsSection(section);
  const isHelarpedia = isHelarpediaSection(section);
  // Any section that receives a dedicated auto-incrementing report number
  // (law reports → Helar-{year}-N, Helarpedia → Helarpedia-1000+) displays the
  // same structured modal: report number field, suit/serial header section,
  // estimate body from text, numbered serial reference summary-card badge.
  const numberedSection = isLawReports || isHelarpedia;
  const materialOptions = getMaterialTypeOptions(section);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    const bodyElement = bodyRef.current;

    if (!bodyElement) {
      return;
    }

    const updateScrollState = () => {
      setCanScrollUp(bodyElement.scrollTop > 12);
      setCanScrollDown(bodyElement.scrollTop + bodyElement.clientHeight < bodyElement.scrollHeight - 12);
    };

    updateScrollState();
    bodyElement.addEventListener("scroll", updateScrollState);
    window.addEventListener("resize", updateScrollState);

    return () => {
      bodyElement.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [draft.body, draft.summary, numberedSection, materialOptions.length, title]);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
      <div
        className={cn(
          "relative flex h-[84vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[26px] border shadow-[0_30px_100px_rgba(15,23,42,0.28)]",
          isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
        )}
      >
        <div className={cn("flex items-center justify-between border-b px-4 py-3.5", isDark ? "border-slate-800" : "border-slate-200")}>
          <div className="min-w-0">
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>
              {isLawReports ? "Law report" : isHelarpedia ? "Helarpedia entry" : "Library material"}
            </p>
            <h3 className={cn("mt-1 font-heading text-[1.55rem]", isDark ? "text-white" : "text-slate-950")}>{title}</h3>
          </div>
          <div className="flex items-center gap-2.5">
            {numberedSection ? (
              <div
                className={cn(
                  "rounded-full border px-3 py-1.5 text-right",
                  isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
                )}
              >
                <p className={cn("text-[10px] uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Estimated Minutes</p>
                <p className={cn("mt-0.5 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{draft.estimatedMins} min</p>
              </div>
            ) : null}
            <button
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
                isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
              )}
              onClick={onClose}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto px-4 py-3.5" ref={bodyRef}>
          <div className={cn("grid gap-4 pb-2", numberedSection ? "grid-cols-1" : "md:grid-cols-2")}>
            <label className={cn("space-y-1.5", numberedSection ? "" : "md:col-span-2")}>
              <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>
                {isHelarpedia ? "Issue & terms" : "Title"}
              </span>
              <input
                className={cn(
                  "w-full rounded-2xl border px-3.5 py-2 text-sm outline-none transition",
                  isDark
                    ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                    : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                )}
                onChange={(event) => onChange("title", event.target.value)}
                placeholder={
                  isLawReports
                    ? "Enter the law report title"
                    : isHelarpedia
                      ? "Name the legal issue or term this entry covers (e.g. 'Doctrine of precedent')."
                      : "Enter a clear material title"
                }
                value={draft.title}
              />
            </label>

            {isLawReports ? (
              <>
                <div className="overflow-x-auto pb-1">
                  <div className="grid min-w-[620px] grid-cols-2 gap-2.5">
                    <label className="space-y-1">
                      <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Case Number</span>
                      <input
                        className={cn(
                          "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                          isDark
                            ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                            : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400"
                        )}
                        onChange={(event) => onChange("reportNumber", event.target.value)}
                        placeholder={getDefaultReportNumber() + " (auto-filled if left blank)"}
                        value={draft.reportNumber ?? ""}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Date</span>
                      <input
                        className={cn(
                          "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                          isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                        )}
                        onChange={(event) => onChange("reportDate", event.target.value)}
                        type="date"
                        value={draft.reportDate ?? ""}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Court</span>
                      <select
                        className={cn(
                          "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                          isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                        )}
                        onChange={(event) => onChange("materialType", event.target.value)}
                        value={draft.materialType}
                      >
                        {materialOptions.map((materialType) => (
                          <option key={materialType} value={materialType}>
                            {prettifyMaterialType(materialType)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Suit Number</span>
                      <input
                        className={cn(
                          "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                          isDark
                            ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                            : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                        )}
                        onChange={(event) => onChange("storageUrl", event.target.value)}
                        placeholder="Suit number"
                        value={draft.storageUrl}
                      />
                    </label>
                  </div>
                </div>
              </>
            ) : isHelarpedia ? (
              <>
                <div className="overflow-x-auto pb-1">
                  <div className="grid min-w-[620px] grid-cols-2 gap-2.5">
                    <label className="space-y-1">
                      <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Serial no.</span>
                      <input
                        className={cn(
                          "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                          isDark
                            ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                            : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400"
                        )}
                        onChange={(event) => onChange("reportNumber", event.target.value)}
                        placeholder="Helarpedia-1000 (auto-filled if left blank)"
                        value={draft.reportNumber ?? ""}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Updated</span>
                      <input
                        className={cn(
                          "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                          isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                        )}
                        onChange={(event) => onChange("reportDate", event.target.value)}
                        type="date"
                        value={draft.reportDate ?? ""}
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                        Cross-reference link / attachment <span className={cn("lowercase tracking-normal normal-case", isDark ? "text-slate-400" : "text-slate-400")}>(optional)</span>
                      </span>
                      <input
                        className={cn(
                          "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                          isDark
                            ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                            : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                        )}
                        onChange={(event) => onChange("storageUrl", event.target.value)}
                        placeholder="Helarpedia-###, case cross-reference URL, or a downloadable attachment URL — leave empty if not applicable"
                        value={draft.storageUrl}
                      />
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="space-y-2">
                  <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Material Type</span>
                  <select
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950"
                    )}
                    onChange={(event) => onChange("materialType", event.target.value)}
                    value={draft.materialType}
                  >
                    {materialOptions.map((materialType) => (
                      <option key={materialType} value={materialType}>
                        {prettifyMaterialType(materialType)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Estimated Minutes</span>
                  <input
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                    )}
                    min={0}
                    onChange={(event) => onChange("estimatedMins", Number(event.target.value))}
                    placeholder="0"
                    type="number"
                    value={draft.estimatedMins}
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className={cn("text-xs font-medium uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-500")}>Storage or External URL</span>
                  <input
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark
                        ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                    )}
                    onChange={(event) => onChange("storageUrl", event.target.value)}
                    placeholder="https://..."
                    value={draft.storageUrl}
                  />
                </label>
              </>
            )}

            {numberedSection ? (
              <>
                <div>
                  <RichTextEditor
                  isDark={isDark}
                  label={isHelarpedia ? "Definition / summary" : "Summary"}
                  minHeight={isHelarpedia ? 180 : 120}
                  maxHeight={isHelarpedia ? 420 : 320}
                  onChange={(value) => onChange("summary", value)}
                  placeholder={
                    isHelarpedia
                      ? "Write the concise definition or legal explanation for this issue. Use headings for subsections, bullet points, and links to structure the content professionally."
                      : "Write a concise formatted summary for this report. Use headings and bullet points to organise the summary."
                  }
                  value={draft.summary}
                />
                </div>

                <div>
                  <RichTextEditor
                  isDark={isDark}
                  label={isHelarpedia ? "Related cases" : "Body"}
                  minHeight={isHelarpedia ? 240 : 160}
                  maxHeight={isHelarpedia ? 600 : 520}
                  onChange={(value) => onChange("body", value)}
                  placeholder={
                    isHelarpedia
                      ? "List related case law citations, Helar-YYYY-NNN references, and supporting authorities here. Use headings, lists, and links to structure the content."
                      : "Write the full law report body here. Use headings, paragraphs, and lists to organise the content."
                  }
                  value={draft.body}
                />
                </div>

                <label
                  className={cn(
                    "flex items-center justify-between rounded-[20px] border px-3.5 py-2.5",
                    isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
                  )}
                >
                  <div>
                    <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>Enable sharing and deep links</p>
                    <p className={cn("mt-0.5 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                      {isHelarpedia
                        ? "Adds paragraph deep links and selection sharing tools so admins can cite and share specific Helarpedia paragraphs."
                        : "Adds paragraph deep links and selection sharing tools in the law report reader for admins and content admins."}
                    </p>
                  </div>
                  <input checked={draft.sharingEnabled} onChange={(event) => onChange("sharingEnabled", event.target.checked)} type="checkbox" />
                </label>
              </>
            ) : null}

            <label
              className={cn(
                "flex items-center justify-between rounded-[20px] border px-3.5 py-2.5",
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
              )}
            >
              <div>
                <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>Allow Download</p>
                <p className={cn("mt-0.5 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                  Keep this enabled when learners should be able to download the material file.
                </p>
              </div>
              <input checked={draft.downloadable} onChange={(event) => onChange("downloadable", event.target.checked)} type="checkbox" />
            </label>
          </div>
        </div>
        </div>

        <div className={cn("flex items-center justify-between gap-3 border-t px-4 py-3", isDark ? "border-slate-800" : "border-slate-200")}>
          <div className="flex items-center gap-2">
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:text-slate-950",
                !canScrollUp && "opacity-70"
              )}
              disabled={!canScrollUp}
              onClick={() => bodyRef.current?.scrollBy({ behavior: "smooth", top: -220 })}
              title="Scroll up"
              type="button"
            >
              <ChevronUp className="h-4 w-4" />
              <span>Scroll up</span>
            </button>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:text-slate-950",
                !canScrollDown && "opacity-70"
              )}
              disabled={!canScrollDown}
              onClick={() => bodyRef.current?.scrollBy({ behavior: "smooth", top: 220 })}
              title="Scroll down"
              type="button"
            >
              <span>Scroll down</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {saveProgress.kind === "uploading" ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {saveProgress.bodyTotal > 0 ? (
                    <span className={isDark ? "text-slate-300" : "text-slate-600"}>
                      Body&nbsp;
                      <span className="font-semibold tabular-nums">
                        {Math.min(saveProgress.bodyCompleted, saveProgress.bodyTotal)} / {saveProgress.bodyTotal}
                      </span>
                      &nbsp;chunks
                    </span>
                  ) : null}
                  {saveProgress.summaryTotal > 0 ? (
                    <span className={isDark ? "text-slate-300" : "text-slate-600"}>
                      Summary&nbsp;
                      <span className="font-semibold tabular-nums">
                        {Math.min(saveProgress.summaryCompleted, saveProgress.summaryTotal)} / {saveProgress.summaryTotal}
                      </span>
                      &nbsp;chunks
                    </span>
                  ) : null}
                  {saveProgress.bodyTotal === 0 && saveProgress.summaryTotal === 0 ? (
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>Preparing upload…</span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "h-2 w-full overflow-hidden rounded-full",
                    isDark ? "bg-slate-800" : "bg-slate-200"
                  )}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={(() => {
                    const totalWork = Math.max(1, saveProgress.bodyTotal + saveProgress.summaryTotal);
                    const done = Math.min(totalWork, saveProgress.bodyCompleted + saveProgress.summaryCompleted);
                    return Math.round((done / totalWork) * 100);
                  })()}
                >
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-200 ease-out"
                    style={{
                      width: `${(() => {
                        const totalWork = Math.max(1, saveProgress.bodyTotal + saveProgress.summaryTotal);
                        const done = Math.min(totalWork, saveProgress.bodyCompleted + saveProgress.summaryCompleted);
                        return Math.round((done / totalWork) * 100);
                      })()}%`
                    }}
                  />
                </div>
              </>
            ) : saveProgress.kind === "finalizing" ? (
              <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
                Finalizing save and storing overflow chunks… please keep this tab open for just a moment longer.
              </p>
            ) : isSaving ? (
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                Saving in progress — this should complete shortly.
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <button className="button-secondary !px-4 !py-3" onClick={onClose} type="button">
                Cancel
              </button>
              <button className="button-primary !px-5 !py-3" disabled={isSaving} onClick={onSubmit} type="button">
                {isSaving ? "Saving..." : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SummaryCard({
  isDark,
  label,
  value
}: {
  isDark: boolean;
  label: string;
  value: string;
}) {
  return (
    <article className={cn("rounded-[24px] border p-5 shadow-[0_24px_70px_rgba(15,23,42,0.06)]", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>{label}</p>
      <p className={cn("mt-3 text-3xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{value}</p>
    </article>
  );
}

function formatCompactHours(value: number) {
  if (value === 0) {
    return "0 hr";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} hr`;
}

function LawReportEngagementSection({
  isDark,
  onAddReport,
  reports,
  totalHoursSpent,
  totalVisits,
  variant = "law-reports"
}: {
  isDark: boolean;
  onAddReport: () => void;
  reports: Array<{
    id: string;
    reportNumber: string | null;
    title: string;
    totalHoursSpent: number;
    visits: number;
  }>;
  totalHoursSpent: number;
  totalVisits: number;
  variant?: "law-reports" | "helarpedia";
}) {
  const isHelarpedia = variant === "helarpedia";
  const topReports = useMemo(() => {
    if (reports.length <= 1) {
      return reports.slice(0, 5);
    }

    return [...reports]
      .sort((left, right) => right.visits - left.visits || right.totalHoursSpent - left.totalHoursSpent)
      .slice(0, 5);
  }, [reports]);
  const maxVisits = Math.max(...topReports.map((report) => report.visits), 1);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:p-7",
        isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>
            {isHelarpedia ? "Helarpedia engagement" : "Law report engagement"}
          </p>
          <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
            {isHelarpedia ? "See which Helarpedia entries are drawing attention." : "See which reports are drawing attention."}
          </h2>
          <p className={cn("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
            {isHelarpedia
              ? "This chart shows the most visited Helarpedia entries and the real hours spent across the full Helarpedia archive."
              : "This chart shows the most visited law reports and the real hours spent across the full law report archive."}
          </p>
        </div>
        <button className="button-primary !px-5 !py-3" onClick={onAddReport} type="button">
          <Plus className="h-4 w-4" />
          {isHelarpedia ? "Add Helarpedia entry" : "Add law report"}
        </button>
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
            <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>
              {isHelarpedia ? "Most visited entries" : "Most visited reports"}
            </p>
          </div>

          {reports.length ? (
            <div className="mt-5 space-y-4">
              {topReports.map((report) => (
                <div className="grid gap-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]" key={report.id}>
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-medium", isDark ? "text-white" : "text-slate-950")} title={report.title}>
                      {report.title}
                    </p>
                    <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                      {report.reportNumber ?? "Law report"}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <div className={cn("h-3 w-full overflow-hidden rounded-full", isDark ? "bg-slate-800" : "bg-slate-200")}>
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#ff6d4d_0%,#f59e0b_100%)]"
                        style={{ width: `${Math.max((report.visits / maxVisits) * 100, report.visits > 0 ? 10 : 0)}%` }}
                      />
                    </div>
                  </div>
                  <div className={cn("flex items-center justify-between gap-3 text-sm md:min-w-[110px] md:justify-end", isDark ? "text-slate-300" : "text-slate-700")}>
                    <span>{report.visits} visits</span>
                    <span>{formatCompactHours(report.totalHoursSpent)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "mt-5 rounded-[22px] border border-dashed px-4 py-8 text-sm",
                isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"
              )}
            >
              No visits have been recorded for {isHelarpedia ? "Helarpedia entries" : "law reports"} yet.
            </div>
          )}
        </div>

        <div className="grid gap-4">
          {[
            { icon: Eye, label: "Total visits", value: String(totalVisits) },
            { icon: Clock3, label: "Total hours spent", value: formatCompactHours(totalHoursSpent) }
          ].map((item) => {
            const Icon = item.icon;

            return (
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
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                    <p className={cn("mt-2 text-3xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AdminLibraryWorkspace({ section }: { section: AdminLibrarySection }) {
  const { isDark } = useTheme();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleCodes = useAuthStore((state) => state.session?.user.roleCodes ?? []);
  const queryClient = useQueryClient();
  const copy = sectionCopy[section];
  const isLawReports = isLawReportsSection(section);
  const isHelarpedia = isHelarpediaSection(section);
  // Both law reports (Helar-{year}-N) and Helarpedia (Helarpedia-1000+) use
  // auto-incrementing serial numbers, next-number preview badges, summary
  // engagement cards, and the same create/edit modal structure. Any
  // remaining `isLawReports` discriminator below is for court-specific UX
  // (Court enum, Suit number, Date-only fields); Helarpedia uses the generic
  // Serial no. / Updated / Cross-ref layout instead.
  const numberedSection = isLawReports || isHelarpedia;
  const isContentAdminWorkspace = isContentAdmin(roleCodes);
  const [filters, setFilters] = useState(defaultFilters);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<AdminLibraryMaterial | null>(null);
  const [draft, setDraft] = useState<AdminLibraryMaterialInput>(() => createDraft(section));
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([]);
  // Tracks the last N transport-upload steps during save so we can render a
  // live progress bar instead of leaving the user staring at a disabled
  // button wondering if the save is still running.
  const [saveProgress, setSaveProgress] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; bodyCompleted: number; bodyTotal: number; summaryCompleted: number; summaryTotal: number }
    | { kind: "finalizing" }
  >({ kind: "idle" });
  const recordsSectionRef = useRef<HTMLElement | null>(null);
  const incomingSearchState = location.state as
    | {
        librarySearchItemId?: string;
        librarySearchQuery?: string;
        librarySearchScope?: "body" | "reportNumber" | "storageUrl" | "summary" | "title";
      }
    | null;

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

  const materialsQuery = useQuery({
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    queryKey: queryKeys.adminLibrary(section, filters),
    queryFn: () => fetchAdminLibraryMaterials(section, filters),
    staleTime: 20_000
  });

  useEffect(() => {
    if (!numberedSection || editingMaterial || !isModalOpen) {
      return;
    }

    setDraft((current) => ({
      ...current,
      reportNumber:
        materialsQuery.data?.nextReportNumber ??
        current.reportNumber ??
        (isLawReports ? getDefaultReportNumber() : getDefaultHelarpediaNumber())
    }));
  }, [editingMaterial, isHelarpedia, isLawReports, isModalOpen, materialsQuery.data?.nextReportNumber, numberedSection]);

  useEffect(() => {
    const editMaterialId = searchParams.get("edit");

    if (!editMaterialId || isModalOpen || !materialsQuery.data?.materials.length) {
      return;
    }

    const match = materialsQuery.data.materials.find((material) => material.id === editMaterialId);

    if (!match) {
      return;
    }

    openEditModal(match);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("edit");
    setSearchParams(nextParams, { replace: true });
  }, [isModalOpen, materialsQuery.data?.materials, searchParams, setSearchParams]);

  function applySaveProgressStep(step: AdminLibraryTransportProgressStep) {
    if (step.kind === "finalize") {
      setSaveProgress({ kind: "finalizing" });
      return;
    }
    setSaveProgress((current) => {
      if (current.kind === "uploading") {
        if (step.kind === "body") {
          return {
            ...current,
            bodyCompleted: Math.max(current.bodyCompleted, step.completed),
            bodyTotal: Math.max(current.bodyTotal, step.total)
          };
        }
        return {
          ...current,
          summaryCompleted: Math.max(current.summaryCompleted, step.completed),
          summaryTotal: Math.max(current.summaryTotal, step.total)
        };
      }
      return {
        kind: "uploading",
        bodyCompleted: step.kind === "body" ? step.completed : 0,
        bodyTotal: step.kind === "body" ? step.total : 0,
        summaryCompleted: step.kind === "summary" ? step.completed : 0,
        summaryTotal: step.kind === "summary" ? step.total : 0
      };
    });
  }

  const createMutation = useMutation({
    mutationFn: async (payload: AdminLibraryMaterialInput) => {
      setSaveProgress({
        kind: "uploading",
        bodyCompleted: 0,
        bodyTotal: 0,
        summaryCompleted: 0,
        summaryTotal: 0
      });
      const transport = await prepareAdminLibraryTransport(
        section,
        payload.body,
        payload.summary,
        (step) => applySaveProgressStep(step)
      );
      try {
        setSaveProgress({ kind: "finalizing" });
        // Build final payload, dropping any undefined transport token. Strict
        // Zod would accept an explicit undefined value for optional keys, but
        // stripping undefined keys entirely removes any risk of strict-mode
        // confusion and keeps the envelope small. JSON.stringify already
        // strips undefined, but Axios keeps them as explicit keys on the
        // plain object before stringify, so delete to be 100% explicit.
        const finalPayload: AdminLibraryMaterialInput & { bodyChunkToken?: unknown; summaryChunkToken?: unknown } = {
          ...payload,
          body: transport.body,
          bodyChunkToken: transport.bodyChunkToken ?? undefined,
          summary: transport.summary,
          summaryChunkToken: transport.summaryChunkToken ?? undefined
        };
        if (finalPayload.bodyChunkToken === undefined) delete finalPayload.bodyChunkToken;
        if (finalPayload.summaryChunkToken === undefined) delete finalPayload.summaryChunkToken;
        const material = await createAdminLibraryMaterial(section, finalPayload);
        return material;
      } finally {
        await clearAdminLibraryTransportChunks(section, [transport.bodyChunkToken, transport.summaryChunkToken]);
      }
    },
    onSuccess: () => {
      showToast(
        isContentAdminWorkspace
          ? isLawReports
            ? "Law report submitted for super admin approval."
            : isHelarpedia
              ? "Helarpedia entry submitted for super admin approval."
              : "Library material submitted for super admin approval."
          : isLawReports
            ? "Law report created successfully."
            : isHelarpedia
              ? "Helarpedia entry created successfully."
              : "Library material created successfully.",
        "success"
      );
      setIsModalOpen(false);
      setSaveProgress({ kind: "idle" });
      void queryClient.invalidateQueries({ queryKey: ["admin-library", section] });
    },
    onError: (error) => {
      const serverMessage = extractServerErrorMessage(error);
      const fallback = isLawReports
        ? "Could not create the law report right now."
        : isHelarpedia
          ? "Could not create the Helarpedia entry right now."
          : "Could not create the library material right now.";
      showToast(serverMessage ?? fallback, "error");
      setSaveProgress({ kind: "idle" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ materialId, payload }: { materialId: string; payload: AdminLibraryMaterialInput }) => {
      setSaveProgress({
        kind: "uploading",
        bodyCompleted: 0,
        bodyTotal: 0,
        summaryCompleted: 0,
        summaryTotal: 0
      });
      const transport = await prepareAdminLibraryTransport(
        section,
        payload.body,
        payload.summary,
        (step) => applySaveProgressStep(step)
      );
      try {
        setSaveProgress({ kind: "finalizing" });
        const finalPayload: AdminLibraryMaterialInput & { bodyChunkToken?: unknown; summaryChunkToken?: unknown } = {
          ...payload,
          body: transport.body,
          bodyChunkToken: transport.bodyChunkToken ?? undefined,
          summary: transport.summary,
          summaryChunkToken: transport.summaryChunkToken ?? undefined
        };
        if (finalPayload.bodyChunkToken === undefined) delete finalPayload.bodyChunkToken;
        if (finalPayload.summaryChunkToken === undefined) delete finalPayload.summaryChunkToken;
        const material = await updateAdminLibraryMaterial(section, materialId, finalPayload);
        return material;
      } finally {
        await clearAdminLibraryTransportChunks(section, [transport.bodyChunkToken, transport.summaryChunkToken]);
      }
    },
    onSuccess: () => {
      showToast(
        isContentAdminWorkspace
          ? isLawReports
            ? "Law report changes sent for super admin approval."
            : isHelarpedia
              ? "Helarpedia entry changes sent for super admin approval."
              : "Library material changes sent for super admin approval."
          : isLawReports
            ? "Law report updated successfully."
            : isHelarpedia
              ? "Helarpedia entry updated successfully."
              : "Library material updated successfully.",
        "success"
      );
      setIsModalOpen(false);
      setSaveProgress({ kind: "idle" });
      void queryClient.invalidateQueries({ queryKey: ["admin-library", section] });
    },
    onError: (error) => {
      const serverMessage = extractServerErrorMessage(error);
      const fallback = isLawReports
        ? "Could not update the law report right now."
        : isHelarpedia
          ? "Could not update the Helarpedia entry right now."
          : "Could not update the library material right now.";
      showToast(serverMessage ?? fallback, "error");
      setSaveProgress({ kind: "idle" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (materialId: string) => deleteAdminLibraryMaterial(section, materialId),
    onSuccess: () => {
      showToast(
        isLawReports
          ? "Law report removed successfully."
          : isHelarpedia
            ? "Helarpedia entry removed successfully."
            : "Library material removed successfully.",
        "success"
      );
      void queryClient.invalidateQueries({ queryKey: ["admin-library", section] });
    },
    onError: (error) => {
      const serverMessage = extractServerErrorMessage(error);
      const fallback = isLawReports
        ? "Could not remove the law report right now."
        : isHelarpedia
          ? "Could not remove the Helarpedia entry right now."
          : "Could not remove the library material right now.";
      showToast(serverMessage ?? fallback, "error");
    }
  });

  const summaryCards = useMemo(() => {
    const summary = materialsQuery.data?.summary;

    const cards: Array<{ label: string; value: string }> = [
      {
        label: isLawReports ? "Total reports" : isHelarpedia ? "Total entries" : "Total materials",
        value: String(summary?.totalMaterials ?? 0)
      },
      {
        label: "Download enabled",
        value: String(summary?.downloadableCount ?? 0)
      },
      {
        label: "Recent uploads",
        value: String(summary?.recentUploadsCount ?? 0)
      },
      {
        label: "Avg read time",
        value: `${summary?.averageReadTimeMins ?? 0} min`
      }
    ];

    return cards;
  }, [isHelarpedia, isLawReports, materialsQuery.data]);

  const lawReportEngagement = materialsQuery.data?.summary.lawReportEngagement;

  function openCreateModal() {
    setEditingMaterial(null);
    setDraft(createDraft(section, materialsQuery.data?.nextReportNumber));
    setIsModalOpen(true);
  }

  function openEditModal(material: AdminLibraryMaterial) {
    setEditingMaterial(material);
    // Avoid carrying legacy materialType (e.g. PDF saved before REFERENCE_ENTRY
    // existed) into the draft — sections like Helarpedia or Law Reports have a
    // strict allowed-types list and reject anything else on submit.
    const sectionAllowedTypes = getMaterialTypeOptions(section);
    const sanitizedMaterialType = sectionAllowedTypes.includes(material.materialType as never)
      ? material.materialType
      : sectionAllowedTypes[0] ?? material.materialType;

    setDraft({
      body: material.body,
      downloadable: material.downloadable,
      estimatedMins: material.estimatedMins,
      materialType: sanitizedMaterialType,
      reportDate: material.reportDate ? material.reportDate.slice(0, 10) : "",
      reportNumber: material.reportNumber ?? "",
        sharingEnabled: material.sharingEnabled,
      storageUrl: material.storageUrl,
      summary: material.summary,
      title: material.title
    });
    setIsModalOpen(true);
  }

  function handleDraftChange(field: keyof AdminLibraryMaterialInput, value: string | boolean | number) {
    setDraft((current) => {
      const nextDraft = {
        ...current,
        [field]: value
      } as AdminLibraryMaterialInput;

      if (field === "body" && numberedSection) {
        nextDraft.estimatedMins = estimateMinutesFromBody(String(value));
      }

      if (field === "estimatedMins" && !numberedSection) {
        nextDraft.estimatedMins = Number(value);
      }

      return nextDraft;
    });
  }

  async function handleSubmit() {
    const requiresStorageUrl = !isHelarpedia;

    if (!draft.title.trim() || (requiresStorageUrl && !draft.storageUrl.trim())) {
      showToast(
        isLawReports
          ? "Add a title and suit number before saving."
          : isHelarpedia
            ? "Add the issue or term name before saving."
            : "Add a title and a valid storage URL before saving.",
        "error"
      );
      return;
    }

    if (numberedSection && !stripHtml(draft.body)) {
      showToast(
        isLawReports
          ? "Add the report body before saving this law report."
          : "Add at least one related case or supporting authority before saving this Helarpedia entry.",
        "error"
      );
      return;
    }

    if (editingMaterial) {
      await updateMutation.mutateAsync({
        materialId: editingMaterial.id,
        payload: draft
      });
      return;
    }

    await createMutation.mutateAsync(draft);
  }

  function handleDelete(material: AdminLibraryMaterial) {
    const isConfirmed = window.confirm(`Remove "${material.title}" from ${copy.title.toLowerCase()}?`);

    if (!isConfirmed) {
      return;
    }

    deleteMutation.mutate(material.id);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const typeOptions = materialsQuery.data?.availableMaterialTypes ?? getMaterialTypeOptions(section);

  useEffect(() => {
    if (!incomingSearchState?.librarySearchQuery || incomingSearchState.librarySearchScope === "body" || incomingSearchState.librarySearchScope === "summary") {
      return;
    }

    setFilters((current) => {
      if (current.search === incomingSearchState.librarySearchQuery) {
        return current;
      }

      return {
        ...current,
        page: 1,
        search: incomingSearchState.librarySearchQuery
      };
    });
  }, [incomingSearchState?.librarySearchQuery, incomingSearchState?.librarySearchScope]);

  useEffect(() => {
    if (!incomingSearchState?.librarySearchItemId) {
      return;
    }

    const rowElement = document.querySelector(`[data-library-material-id="${incomingSearchState.librarySearchItemId}"]`);

    if (rowElement instanceof HTMLElement) {
      rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    recordsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [incomingSearchState?.librarySearchItemId, materialsQuery.data?.materials]);

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />

      <div className="space-y-6">
        {numberedSection ? (
          <LawReportEngagementSection
            isDark={isDark}
            onAddReport={openCreateModal}
            reports={lawReportEngagement?.topReports ?? []}
            totalHoursSpent={lawReportEngagement?.totalHoursSpent ?? 0}
            totalVisits={lawReportEngagement?.totalVisits ?? 0}
            variant={isLawReports ? "law-reports" : "helarpedia"}
          />
        ) : (
          <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#25112b_0%,#0f1f4d_55%,#112a5b_100%)] p-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.24)] lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.24em] text-white/45">{copy.badge}</p>
                <h2 className="mt-4 max-w-3xl font-heading text-3xl leading-tight text-white lg:text-[2.75rem]">{copy.title}</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">{copy.description}</p>
              </div>
              <button className="button-primary !px-5 !py-3" onClick={openCreateModal} type="button">
                <Plus className="h-4 w-4" />
                Add material
              </button>
            </div>
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <SummaryCard isDark={isDark} key={card.label} label={card.label} value={card.value} />
          ))}
        </div>

        <section className={cn("rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")} ref={recordsSectionRef}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Library records</p>
              <h3 className={cn("mt-1 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>{materialsQuery.data?.category.name ?? "Library materials"}</h3>
            </div>
            <ToolbarButton isDark={isDark} onClick={() => void materialsQuery.refetch()}>
              <RefreshCw className={cn("h-4 w-4", materialsQuery.isFetching && "animate-spin")} />
              Refresh
            </ToolbarButton>
          </div>

          <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_220px_220px_220px]">
            <label className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
              <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
              <input
                className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
                onChange={(event) => setFilters((current) => ({ ...current, page: 1, search: event.target.value }))}
                placeholder={
                  isLawReports
                    ? "Search title, suit number, or case number"
                    : isHelarpedia
                      ? "Search issue name, serial number, or related-case citation"
                      : "Search title or URL"
                }
                value={filters.search}
              />
            </label>

            <select
              className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  materialType: event.target.value as Required<AdminLibraryFilters>["materialType"],
                  page: 1
                }))
              }
              value={filters.materialType}
            >
              <option value="all">
                {isLawReports ? "All courts" : isHelarpedia ? "All entry types" : "All material types"}
              </option>
              {typeOptions.map((materialType) => (
                <option key={materialType} value={materialType}>
                  {prettifyMaterialType(materialType)}
                </option>
              ))}
            </select>

            <select
              className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  sortBy: event.target.value as Required<AdminLibraryFilters>["sortBy"]
                }))
              }
              value={filters.sortBy}
            >
              <option value="updatedAt">Sort by updated date</option>
              <option value="createdAt">Sort by created date</option>
              <option value="title">Sort by title</option>
              <option value="estimatedMins">Sort by reading time</option>
            </select>

            <select
              className={cn("rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  sortOrder: event.target.value as Required<AdminLibraryFilters>["sortOrder"]
                }))
              }
              value={filters.sortOrder}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="mt-6 overflow-x-auto">
            {materialsQuery.isLoading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className={cn("h-20 animate-pulse rounded-[22px]", isDark ? "bg-slate-800" : "bg-slate-100")} key={index} />
                ))}
              </div>
            ) : materialsQuery.isError ? (
              <EmptyState
                action={
                  <button className="button-primary !px-4 !py-3" onClick={() => void materialsQuery.refetch()} type="button">
                    Try again
                  </button>
                }
                isDark={isDark}
                message="Could not load this library section right now. Please make sure the API server is running and try again."
              />
            ) : materialsQuery.data?.materials.length ? (
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr className={cn("text-left text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    <th className="px-4 py-2 font-medium">
                      {isLawReports ? "Law report" : isHelarpedia ? "Helarpedia entry" : "Material"}
                    </th>
                    <th className="px-4 py-2 font-medium">{isLawReports ? "Court" : "Type"}</th>
                    <th className="px-4 py-2 font-medium">Engagement</th>
                    <th className="px-4 py-2 font-medium">Updated</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {materialsQuery.data.materials.map((material) => (
                    <tr
                      className={cn(
                        "rounded-[22px] border shadow-[0_18px_50px_rgba(15,23,42,0.04)]",
                        isDark ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-700"
                      )}
                      data-library-material-id={material.id}
                      key={material.id}
                    >
                      <td className="rounded-l-[22px] px-4 py-4 align-top">
                        <div>
                          {numberedSection ? (
                            <>
                              <Link
                                className={cn(
                                  "text-sm font-semibold underline-offset-4 transition hover:underline",
                                  isDark ? "text-white" : "text-slate-950"
                                )}
                                onClick={(event) => event.stopPropagation()}
                                to={
                                  isLawReports
                                    ? `/app/admin/library/law-reports/${material.id}`
                                    : `/app/admin/library/helarpedia/${material.id}`
                                }
                              >
                                {material.title}
                              </Link>
                              <p className={cn("mt-2 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                                {isLawReports ? "Case Number" : "Serial no."}: {material.reportNumber ?? "Pending assignment (auto-assigns on next save)"}
                              </p>
                              <p className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                                {isLawReports ? "Suit Number" : "Cross-reference"}: {material.storageUrl?.trim() ? material.storageUrl : "—"}
                              </p>
                              {stripHtml(material.summary) ? (
                                // For Helarpedia, render formatted rich text preview
                                // with clamped height. For law reports, keep
                                // plain-text line-clamp for compact admin view.
                                isHelarpedia ? (
                                  <div
                                    className={cn(
                                      "mt-3 text-sm leading-6 rich-text-preview rich-text-content overflow-hidden",
                                      isDark ? "text-slate-300" : "text-slate-600"
                                    )}
                                    style={{
                                      display: "-webkit-box",
                                      WebkitLineClamp: 3,
                                      WebkitBoxOrient: "vertical",
                                      maxHeight: "5.5rem",
                                      overflow: "hidden"
                                    }}
                                    dangerouslySetInnerHTML={{ __html: material.summary }}
                                  />
                                ) : (
                                  <p className={cn("mt-3 line-clamp-2 text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>
                                    {stripHtml(material.summary)}
                                  </p>
                                )
                              ) : null}
                            </>
                          ) : (
                            <>
                              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{material.title}</p>
                              <p className={cn("mt-2 line-clamp-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{material.storageUrl}</p>
                            </>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className={cn("rounded-full border px-3 py-1 text-xs", isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-700")}>
                              {material.estimatedMins} min
                            </span>
                            <span
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs",
                                material.publicationStatus === "PUBLISHED"
                                  ? isDark
                                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : material.publicationStatus === "PENDING_APPROVAL"
                                    ? isDark
                                      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
                                      : "border-amber-200 bg-amber-50 text-amber-700"
                                    : isDark
                                      ? "border-slate-700 bg-slate-900 text-slate-300"
                                      : "border-slate-200 bg-white text-slate-700"
                              )}
                            >
                              {material.publicationStatus === "PENDING_APPROVAL" ? "Pending approval" : material.publicationStatus.split("_").join(" ")}
                            </span>
                            <span
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs",
                                material.downloadable
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : isDark
                                    ? "border-slate-700 bg-slate-900 text-slate-300"
                                    : "border-slate-200 bg-white text-slate-700"
                              )}
                            >
                              {material.downloadable ? "Download enabled" : "View only"}
                            </span>
                          </div>
                          {material.reviewFeedback ? (
                            <div
                              className={cn(
                                "mt-3 rounded-2xl border px-4 py-3 text-sm leading-6",
                                isDark
                                  ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                              )}
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Revision note</p>
                              <p className="mt-2">{material.reviewFeedback}</p>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className={cn("rounded-full border px-3 py-1 text-xs", isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-700")}>
                          {isHelarpedia
                            ? "Helarpedia entry"
                            : isLawReports
                              ? prettifyMaterialType(material.materialType)
                              : prettifyMaterialType(material.materialType)}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top text-sm">
                        <p>{material.readerCount} readers</p>
                        <p className={cn("mt-2", isDark ? "text-slate-400" : "text-slate-500")}>{material.bookmarkCount} bookmarks</p>
                      </td>
                      <td className="px-4 py-4 align-top text-sm">
                        <p>{formatDate(material.lastUpdatedAt)}</p>
                        <p className={cn("mt-2", isDark ? "text-slate-400" : "text-slate-500")}>Created {formatDate(material.createdAt)}</p>
                      </td>
                      <td className="rounded-r-[22px] px-4 py-4 align-top">
                        <div className="flex min-w-[170px] flex-wrap gap-2">
                          <IconActionButton isDark={isDark} onClick={() => openEditModal(material)} title="Edit record">
                            <Pencil className="h-4 w-4" />
                          </IconActionButton>
                          {!isLawReports ? (
                            <a
                              aria-label="Open material"
                              className={cn(
                                "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
                                isDark
                                  ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800"
                                  : "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50"
                              )}
                              href={material.storageUrl}
                              rel="noreferrer"
                              target="_blank"
                              title="Open material"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                          <IconActionButton className={isDark ? "text-rose-200" : "text-rose-600"} isDark={isDark} onClick={() => handleDelete(material)} title="Remove record">
                            <Trash2 className="h-4 w-4" />
                          </IconActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                action={
                  <button className="button-primary !px-4 !py-3" onClick={openCreateModal} type="button">
                    <Plus className="h-4 w-4" />
                    {isLawReports
                      ? "Add first law report"
                      : isHelarpedia
                        ? "Add first Helarpedia entry"
                        : "Add first material"}
                  </button>
                }
                isDark={isDark}
                message={
                  isLawReports
                    ? "No law reports exist yet. Add the first report to start building the archive."
                    : isHelarpedia
                      ? "No Helarpedia entries exist yet. Add the first issue/term entry to start the legal encyclopedia."
                      : "No materials match this library section yet. Add the first record to make the page useful for your admin team."
                }
              />
            )}
          </div>

          {materialsQuery.data ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                Showing page {materialsQuery.data.pagination.page} of {materialsQuery.data.pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className={cn(
                    "!px-4 !py-3 inline-flex items-center gap-2 rounded-2xl border text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0",
                    isDark
                      ? "border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500",
                  )}
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <button
                  className={cn(
                    "!px-4 !py-3 inline-flex items-center gap-2 rounded-2xl border text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0",
                    isDark
                      ? "border-slate-600 bg-slate-800 text-white hover:border-slate-500 hover:bg-slate-700 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500",
                  )}
                  disabled={filters.page >= materialsQuery.data.pagination.totalPages}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      page: Math.min(materialsQuery.data?.pagination.totalPages ?? current.page, current.page + 1)
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

      {isModalOpen ? (
        <LibraryMaterialModal
          draft={draft}
          isDark={isDark}
          isSaving={isSaving}
          onChange={handleDraftChange}
          onClose={() => setIsModalOpen(false)}
          onSubmit={() => void handleSubmit()}
          saveProgress={saveProgress}
          section={section}
          submitLabel={
            isContentAdminWorkspace
              ? editingMaterial
                ? "Send changes for approval"
                : "Submit for approval"
              : isLawReports
                ? "Save law report"
                : "Save material"
          }
          title={
            editingMaterial
              ? isLawReports
                ? "Edit law report"
                : "Edit material"
              : isLawReports
                ? "Law Report"
                : "Add new material"
          }
        />
      ) : null}
    </>
  );
}
