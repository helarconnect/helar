import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bookmark,
  BookOpen,
  Bold,
  ChevronDown,
  Clock3,
  ExternalLink,
  Filter,
  Italic,
  List,
  ListOrdered,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Underline,
  X
} from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  createStudentStudyBookmark,
  createStudentStudyNote,
  createSubjectSummaryModuleEntry,
  createSubjectSummaryModuleTopicEntries,
  deleteStudentStudyBookmark,
  deleteStudentStudyNote,
  deleteSubjectSummaryModuleEntry,
  fetchStudentStudyBookmarks,
  fetchStudentStudyNotes,
  fetchStudentSubjectSummaryModuleEntries,
  fetchStudentSubjectSummaryModuleSubjects,
  fetchStudentSubjectSummaryModuleTopics,
  fetchSubjectSummaryModuleAdminEntries,
  fetchSubjectSummaryModuleAdminTopics,
  fetchSubjectSummaryModuleFormOptions,
  saveStudentStudyProgress,
  type StudentStudyNote,
  type SubjectSummaryCaseStatus,
  type SubjectSummaryModuleAdminEntry,
  type SubjectSummaryModuleDifficulty,
  type SubjectSummaryModuleEntryInput,
  type SubjectSummaryModuleTopicBulkEntryInput,
  type SubjectSummaryModuleTopicBulkInput,
  type SubjectSummaryModuleType,
  type SubjectSummaryModuleStudentEntry,
  type SubjectSummaryModuleStudentSubject,
  type SubjectSummaryModuleStudentTopic,
  updateStudentStudyNote,
  updateSubjectSummaryModuleEntry
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type AdminFilters = {
  moduleType: SubjectSummaryModuleType;
  search: string;
  status: "all" | SubjectSummaryCaseStatus;
  subjectId: string;
  topic: string;
};

type StudentFilter = "all" | "bookmarked" | "difficult" | "easy" | "read" | "recentlyViewed" | "unread";

type TopicDraftEntry = SubjectSummaryModuleTopicBulkEntryInput & { clientId: string; orderNumber: number };
type TopicDraftState = Omit<SubjectSummaryModuleTopicBulkInput, "entries"> & { entries: TopicDraftEntry[] };

const difficultyMeta: Record<SubjectSummaryModuleDifficulty, { badge: string; tone: string }> = {
  ADVANCED: {
    badge: "Advanced",
    tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100"
  },
  EASY: {
    badge: "Easy",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100"
  },
  INTERMEDIATE: {
    badge: "Intermediate",
    tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
  }
};

const studentFilterOptions: Array<{ label: string; value: StudentFilter }> = [
  { label: "All", value: "all" },
  { label: "Read", value: "read" },
  { label: "Unread", value: "unread" },
  { label: "Bookmarked", value: "bookmarked" },
  { label: "Recently Viewed", value: "recentlyViewed" },
  { label: "Difficult", value: "difficult" },
  { label: "Easy", value: "easy" }
];

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 14);
}

function formatMinutes(totalMinutes: number) {
  if (!totalMinutes) {
    return "0 min";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes} min`;
  }

  if (!minutes) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} mins`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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

function toPlainTextLines(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function RichTextField({
  isDark,
  label,
  minHeight,
  onChange,
  placeholder,
  value
}: {
  isDark: boolean;
  label: string;
  minHeight: number;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (!editorRef.current || editorRef.current.innerHTML === value) {
      return;
    }

    editorRef.current.innerHTML = value;
  }, [value]);

  function saveSelection() {
    if (typeof window === "undefined") {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      return;
    }

    selectionRef.current = range.cloneRange();
  }

  function restoreSelection() {
    if (typeof window === "undefined") {
      return;
    }

    const range = selectionRef.current;
    if (!range) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function applyCommand(command: string, commandValue?: string) {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    restoreSelection();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current.innerHTML);
  }

  return (
    <div className="space-y-2">
      <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>{label}</span>
      <div className={cn("rounded-[24px] border", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
        <div className={cn("flex flex-wrap gap-2 border-b px-3 py-2.5", isDark ? "border-slate-700" : "border-slate-200")}>
          {[
            { command: "bold", icon: Bold, label: "Bold" },
            { command: "italic", icon: Italic, label: "Italic" },
            { command: "underline", icon: Underline, label: "Underline" },
            { command: "justifyLeft", icon: AlignLeft, label: "Align left" },
            { command: "justifyCenter", icon: AlignCenter, label: "Align center" },
            { command: "justifyRight", icon: AlignRight, label: "Align right" },
            { command: "insertUnorderedList", icon: List, label: "Bullet list" },
            { command: "insertOrderedList", icon: ListOrdered, label: "Numbered list" }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <button
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-2xl border transition",
                  isDark
                    ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
                )}
                key={item.command}
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyCommand(item.command);
                }}
                title={item.label}
                type="button"
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <button
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-2xl border text-xs font-semibold transition",
              isDark
                ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              saveSelection();
              colorInputRef.current?.click();
            }}
            title="Text color"
            type="button"
          >
            A
          </button>
          <input className="sr-only" onChange={(event) => applyCommand("foreColor", event.target.value)} ref={colorInputRef} type="color" />
        </div>
        <div
          className="relative cursor-text"
          onClick={() => editorRef.current?.focus()}
          style={{ minHeight }}
        >
          {!stripHtml(value) ? (
            <div className={cn("pointer-events-none absolute left-4 top-4 text-sm", isDark ? "text-slate-500" : "text-slate-400")}>
              {placeholder}
            </div>
          ) : null}
          <div
            aria-label={label}
            className={cn(
              "rich-text-content min-h-[240px] px-4 py-3 text-sm leading-7 outline-none",
              isDark ? "text-white" : "text-slate-950"
            )}
            contentEditable
            role="textbox"
            onInput={(event) => onChange(event.currentTarget.innerHTML)}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            ref={editorRef}
            suppressContentEditableWarning
            tabIndex={0}
          />
        </div>
      </div>
    </div>
  );
}

function ModalFrame({
  children,
  isDark,
  onClose,
  title
}: {
  children: ReactNode;
  isDark: boolean;
  onClose: () => void;
  title: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm">
      <div className={cn("flex h-[88vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[28px] border", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
        <div className={cn("flex items-center justify-between border-b px-5 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          <div>
            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Subject summary</p>
            <h3 className={cn("mt-1 font-heading text-[1.5rem]", isDark ? "text-white" : "text-slate-950")}>{title}</h3>
          </div>
          <button
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border",
              isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
            )}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function createDraft(subjectId = "", moduleType: SubjectSummaryModuleType = "FACULTY"): SubjectSummaryModuleEntryInput {
  return {
    answer: "",
    difficulty: "EASY",
    displayOrder: 0,
    estimatedReadingTime: 2,
    examTip: "",
    keyPrinciple: "",
    moduleType,
    topic: "",
    question: "",
    relatedCaseIds: [],
    relatedStatutes: [],
    status: "DRAFT",
    subjectId,
    tags: []
  };
}

function AdminEntryModal({
  draft,
  isDark,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  onSubmitAndAddQuestions,
  relatedCases,
  subjects,
  title
}: {
  draft: SubjectSummaryModuleEntryInput;
  isDark: boolean;
  isSaving: boolean;
  onChange: <K extends keyof SubjectSummaryModuleEntryInput>(field: K, value: SubjectSummaryModuleEntryInput[K]) => void;
  onClose: () => void;
  onSubmit: () => void;
  onSubmitAndAddQuestions: () => void;
  relatedCases: Array<{
    citation: string;
    id: string;
    subjectId: string;
    title: string;
    topic: {
      id: string;
      name: string;
    };
  }>;
  subjects: Array<{
    id: string;
    name: string;
  }>;
  title: string;
}) {
  return (
    <ModalFrame isDark={isDark} onClose={onClose} title={title}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
            <select
              className={cn("w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("subjectId", event.target.value)}
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

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Summary type</span>
              <div className={cn("rounded-2xl border px-3.5 py-3 text-sm", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}>
                {draft.moduleType === "NLS" ? "NLS summary" : "Faculty summary"}
              </div>
            </div>

            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Topic</span>
              <input
                className={cn("w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("topic", event.target.value)}
                placeholder="Optional topic"
                value={draft.topic}
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Question</span>
            <input
              className={cn("w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("question", event.target.value)}
              placeholder="Enter the revision question"
              value={draft.question}
            />
          </label>

          <RichTextField
            isDark={isDark}
            label="Answer"
            minHeight={240}
            onChange={(value) => onChange("answer", value)}
            placeholder="Write the full answer with rich formatting"
            value={draft.answer}
          />

          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Key principle</span>
            <textarea
              className={cn("min-h-[110px] w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("keyPrinciple", event.target.value)}
              placeholder="Capture the legal principle students must remember"
              value={draft.keyPrinciple}
            />
          </label>

          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Exam tip</span>
            <textarea
              className={cn("min-h-[96px] w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("examTip", event.target.value)}
              placeholder="Add a revision or exam technique tip"
              value={draft.examTip}
            />
          </label>
        </div>

        <div className="space-y-4">
          <div className={cn("rounded-[24px] border p-4", isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-slate-50")}>
            <p className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Publishing</p>
            <div className="mt-3 space-y-3">
              <label className="space-y-2">
                <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Difficulty</span>
                <select
                  className={cn("w-full rounded-2xl border px-3 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                  onChange={(event) => onChange("difficulty", event.target.value as SubjectSummaryModuleDifficulty)}
                  value={draft.difficulty}
                >
                  <option value="EASY">Easy</option>
                  <option value="INTERMEDIATE">Intermediate</option>
                  <option value="ADVANCED">Advanced</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Status</span>
                <select
                  className={cn("w-full rounded-2xl border px-3 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                  onChange={(event) => onChange("status", event.target.value as SubjectSummaryCaseStatus)}
                  value={draft.status}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Estimated reading time</span>
                <input
                  className={cn("w-full rounded-2xl border px-3 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                  min={1}
                  onChange={(event) => onChange("estimatedReadingTime", Number(event.target.value) || 1)}
                  type="number"
                  value={draft.estimatedReadingTime}
                />
              </label>

              <label className="space-y-2">
                <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Display order</span>
                <input
                  className={cn("w-full rounded-2xl border px-3 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                  min={0}
                  onChange={(event) => onChange("displayOrder", Number(event.target.value) || 0)}
                  type="number"
                  value={draft.displayOrder}
                />
              </label>
            </div>
          </div>

          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Related statutes</span>
            <textarea
              className={cn("min-h-[110px] w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("relatedStatutes", toPlainTextLines(event.target.value))}
              placeholder="One statute or section per line"
              value={draft.relatedStatutes.join("\n")}
            />
          </label>

          <label className="space-y-2">
            <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Tags</span>
            <textarea
              className={cn("min-h-[90px] w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
              onChange={(event) => onChange("tags", toPlainTextLines(event.target.value))}
              placeholder="One tag per line or comma separated"
              value={draft.tags.join("\n")}
            />
          </label>

          <div className={cn("rounded-[24px] border p-4", isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-slate-50")}>
            <div className="flex items-center justify-between gap-3">
              <p className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Related cases</p>
              <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{draft.relatedCaseIds.length} selected</span>
            </div>
            <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {relatedCases.length ? (
                relatedCases.map((item) => {
                  const checked = draft.relatedCaseIds.includes(item.id);

                  return (
                    <label
                      className={cn("flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm", isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-700")}
                      key={item.id}
                    >
                      <input
                        checked={checked}
                        onChange={(event) =>
                          onChange(
                            "relatedCaseIds",
                            event.target.checked ? [...draft.relatedCaseIds, item.id] : draft.relatedCaseIds.filter((caseId) => caseId !== item.id)
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="block font-medium">{item.title}</span>
                        <span className={cn("mt-1 block text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                          {item.topic.name}
                          {item.citation ? ` • ${item.citation}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className={cn("rounded-2xl border px-3 py-4 text-sm", isDark ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-200 bg-white text-slate-500")}>
                  Select a subject to load related cases from Cases and Ratios.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700")}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-medium",
                isSaving || draft.topic.trim().length < 2
                  ? isDark
                    ? "cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                    : "cursor-not-allowed border-slate-200 bg-white text-slate-400"
                  : isDark
                    ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
              )}
              disabled={isSaving || draft.topic.trim().length < 2}
              onClick={onSubmitAndAddQuestions}
              type="button"
            >
              Save + add questions
            </button>
            <button className="button-primary !px-5 !py-3" disabled={isSaving} onClick={onSubmit} type="button">
              {isSaving ? "Saving..." : "Save subject summary"}
            </button>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function StudentSummaryCard({
  bookmarkId,
  entry,
  isDark,
  note,
  noteFeedback,
  noteDraft,
  saveNoteLabel,
  onDeleteNote,
  onMarkAsRead,
  onSaveNote,
  onToggle,
  onToggleBookmark,
  onUpdateNoteDraft,
  open,
  previewWordLimit,
  previewMode,
  readOverride
}: {
  bookmarkId: string | null;
  entry: SubjectSummaryModuleStudentEntry;
  isDark: boolean;
  note: StudentStudyNote | null;
  noteFeedback: null | { message: string; tone: "green" | "red" };
  noteDraft: string;
  saveNoteLabel: string;
  onDeleteNote: () => void;
  onMarkAsRead: () => void;
  onSaveNote: () => void;
  onToggle: () => void;
  onToggleBookmark: () => void;
  onUpdateNoteDraft: (value: string) => void;
  open: boolean;
  previewWordLimit: number;
  previewMode: boolean;
  readOverride: boolean;
}) {
  const difficulty = difficultyMeta[entry.difficulty];
  const isRead = readOverride || entry.progress.completed;

  return (
    <article
      className={cn(
        "rounded-[28px] border transition",
        isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
      )}
      id={`summary-entry-${entry.id}`}
    >
      <button className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left" onClick={onToggle} type="button">
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>
            {entry.serialNumber ? `Serial ${entry.serialNumber}` : `Question ${entry.orderLabel}`}
          </p>
          <h3 className={cn("mt-3 font-heading text-2xl leading-tight", isDark ? "text-white" : "text-slate-950")}>{entry.question}</h3>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className={cn("rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em]", difficulty.tone)}>
              {difficulty.badge}
            </span>
            <span className={cn("inline-flex items-center gap-2 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
              <Clock3 className="h-4 w-4" />
              {entry.estimatedReadingTime} mins
            </span>
            {isRead ? (
              <span className={cn("rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em]", isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                Read
              </span>
            ) : null}
          </div>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition", open && "rotate-180", isDark ? "text-slate-400" : "text-slate-500")} />
      </button>

      {open ? (
        <div className={cn("space-y-5 border-t px-5 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <section className="space-y-2">
            <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Answer</p>
            {previewMode ? (
              <p className={cn("text-sm leading-7", isDark ? "text-amber-200" : "text-amber-700")}>
                Preview mode is active. Only the first {previewWordLimit} words are available until the subscription is renewed.
              </p>
            ) : null}
            <div
              className={cn("prose prose-sm max-w-none leading-7", isDark ? "prose-invert text-slate-200" : "text-slate-700")}
              dangerouslySetInnerHTML={{ __html: entry.answer }}
            />
          </section>

          {entry.relatedCases.length ? (
            <section className="space-y-3">
              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Related cases</p>
              <div className="grid gap-3 md:grid-cols-2">
                {entry.relatedCases.map((item) => (
                  <Link
                    className={cn("rounded-[22px] border px-4 py-3 transition", isDark ? "border-slate-700 bg-slate-950 text-slate-100 hover:border-slate-600" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300")}
                    key={item.id}
                    to={item.path}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                          {item.topic.name}
                          {item.citation ? ` • ${item.citation}` : ""}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {entry.keyPrinciple ? (
            <section className={cn("rounded-[24px] border px-4 py-4", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Key principle</p>
              <p className={cn("mt-2 text-sm leading-7", isDark ? "text-slate-200" : "text-slate-700")}>{entry.keyPrinciple}</p>
            </section>
          ) : null}

          {entry.examTip ? (
            <section className={cn("rounded-[24px] border px-4 py-4", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Exam tip</p>
              <p className={cn("mt-2 text-sm leading-7", isDark ? "text-slate-200" : "text-slate-700")}>{entry.examTip}</p>
            </section>
          ) : null}

          {entry.relatedStatutes.length ? (
            <section className="space-y-2">
              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Related statutes</p>
              <div className="flex flex-wrap gap-2">
                {entry.relatedStatutes.map((item) => (
                  <span
                    className={cn("rounded-full border px-3 py-1.5 text-xs", isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {entry.tags.length ? (
            <section className="space-y-2">
              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Tags</p>
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span
                    className={cn("rounded-full border px-3 py-1.5 text-xs", isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className={cn("rounded-[24px] border px-4 py-4", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
            <div className="flex items-center justify-between gap-3">
              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>My notes</p>
              {note ? (
                <button
                  className={cn("text-xs font-medium", isDark ? "text-rose-200" : "text-rose-600")}
                  onClick={onDeleteNote}
                  type="button"
                >
                  Delete note
                </button>
              ) : null}
            </div>
            <textarea
              className={cn("mt-3 min-h-[120px] w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-950")}
              onChange={(event) => onUpdateNoteDraft(event.target.value)}
              placeholder="Write a private note for this question"
              value={noteDraft}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p
                className={cn(
                  "text-xs",
                  noteFeedback
                    ? noteFeedback.tone === "green"
                      ? isDark
                        ? "text-emerald-300"
                        : "text-emerald-700"
                      : isDark
                        ? "text-rose-300"
                        : "text-rose-600"
                    : isDark
                      ? "text-slate-500"
                      : "text-slate-500"
                )}
              >
                {noteFeedback?.message ?? (note ? "Saved note attached to this question." : "Notes remain private to your account.")}
              </p>
              <button className="button-primary !px-4 !py-2.5" onClick={onSaveNote} type="button">
                {saveNoteLabel}
              </button>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className={cn("inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium", entry.bookmarked ? (isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-700") : isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700")}
              onClick={onToggleBookmark}
              type="button"
            >
              <Bookmark className="h-4 w-4" />
              {bookmarkId ? "Bookmarked" : "Bookmark"}
            </button>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-100",
                isRead
                  ? isDark
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isDark
                    ? "border-slate-700 bg-slate-950 text-slate-200"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              )}
              disabled={isRead}
              onClick={onMarkAsRead}
              type="button"
            >
              <BookOpen className="h-4 w-4" />
              {isRead ? "Marked as read" : "Mark as read"}
            </button>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium opacity-60",
                isDark ? "border-slate-800 bg-slate-950 text-slate-500" : "border-slate-200 bg-slate-50 text-slate-400"
              )}
              disabled
              type="button"
            >
              Sharing unavailable
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function AdminTopicModal({
  draft,
  isDark,
  isSaving,
  onAddQuestion,
  onClose,
  onSubmit,
  onUpdate,
  subjects,
  title
}: {
  draft: TopicDraftState;
  isDark: boolean;
  isSaving: boolean;
  onAddQuestion: () => void;
  onClose: () => void;
  onSubmit: () => void;
  onUpdate: (nextDraft: TopicDraftState) => void;
  subjects: Array<{ id: string; name: string }>;
  title: string;
}) {
  const entries = draft.entries.length ? draft.entries : [];
  const hasValidTopic = draft.topic.trim().length >= 2;
  const hasValidSubject = Boolean(draft.subjectId);
  const hasInvalidEntry = entries.some((entry) => entry.question.trim().length < 2 || entry.answer.trim().length < 2);
  const canSubmit = hasValidSubject && hasValidTopic && entries.length > 0 && !hasInvalidEntry;

  return (
    <ModalFrame isDark={isDark} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
              <select
                className={cn("w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onUpdate({ ...draft, subjectId: event.target.value })}
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
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Topic</span>
              <input
                className={cn("w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onUpdate({ ...draft, topic: event.target.value })}
                placeholder="Enter a topic name (e.g. Offer and Acceptance)"
                value={draft.topic}
              />
            </label>
          </div>

          <div className="space-y-4">
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Status</span>
              <select
                className={cn("w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onUpdate({ ...draft, status: event.target.value as SubjectSummaryCaseStatus })}
                value={draft.status}
              >
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>

            <div className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Summary type</span>
              <div className={cn("rounded-2xl border px-3.5 py-3 text-sm", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}>
                {draft.moduleType === "NLS" ? "NLS summary" : "Faculty summary"}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Questions</p>
              <p className={cn("mt-1 text-sm", isDark ? "text-slate-300" : "text-slate-600")}>Add as many questions and answers as you need.</p>
            </div>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium",
                isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-700"
              )}
              onClick={onAddQuestion}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Add question
            </button>
          </div>

          <div className="space-y-4">
            {entries.map((entry, index) => (
              <section
                className={cn("rounded-[26px] border p-4", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}
                key={entry.clientId}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>Question {entry.orderNumber}</p>
                  <button
                    className={cn("inline-flex h-10 w-10 items-center justify-center rounded-2xl border", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700")}
                    onClick={() => onUpdate({ ...draft, entries: entries.filter((item) => item.clientId !== entry.clientId) })}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <label className="space-y-2">
                    <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Question</span>
                    <input
                      className={cn("w-full rounded-2xl border px-3.5 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-950")}
                      onChange={(event) =>
                        onUpdate({
                          ...draft,
                          entries: entries.map((currentEntry) =>
                            currentEntry.clientId === entry.clientId ? { ...currentEntry, question: event.target.value } : currentEntry
                          )
                        })
                      }
                      placeholder="Enter the revision question"
                      value={entry.question}
                    />
                  </label>

                  <RichTextField
                    isDark={isDark}
                    label="Answer"
                    minHeight={200}
                    onChange={(value) =>
                      onUpdate({
                        ...draft,
                        entries: entries.map((currentEntry) =>
                          currentEntry.clientId === entry.clientId ? { ...currentEntry, answer: value } : currentEntry
                        )
                      })
                    }
                    placeholder="Write the full answer with rich formatting"
                    value={entry.answer}
                  />
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          <button
            className={cn("rounded-2xl border px-5 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-700")}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button className="button-primary !px-5 !py-3" disabled={isSaving || !canSubmit} onClick={onSubmit} type="button">
            {isSaving ? "Saving..." : "Save topic"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

export function AdminSubjectSummaryModulePage() {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const incomingSearch = searchParams.get("search") ?? "";
  const incomingSubjectId = searchParams.get("subjectId") ?? "";
  const incomingTopic = searchParams.get("topic") ?? "";
  const incomingModuleType: SubjectSummaryModuleType = searchParams.get("moduleType") === "NLS" ? "NLS" : "FACULTY";
  const [filters, setFilters] = useState<AdminFilters>({
    moduleType: incomingModuleType,
    search: incomingSearch,
    status: "all",
    subjectId: incomingSubjectId,
    topic: incomingTopic
  });
  const [editingEntry, setEditingEntry] = useState<SubjectSummaryModuleAdminEntry | null>(null);
  const [draft, setDraft] = useState<SubjectSummaryModuleEntryInput>(createDraft("", incomingModuleType));
  const [topicDraft, setTopicDraft] = useState<TopicDraftState>(() => ({
    entries: [
      {
        clientId: createClientId(),
        orderNumber: 1,
        answer: "",
        difficulty: "EASY",
        estimatedReadingTime: 2,
        examTip: "",
        keyPrinciple: "",
        question: "",
        relatedCaseIds: [],
        relatedStatutes: [],
        tags: []
      }
    ],
    moduleType: incomingModuleType,
    status: "DRAFT",
    subjectId: incomingSubjectId,
    topic: ""
  }));
  const [savedTopicEntryClientIds, setSavedTopicEntryClientIds] = useState(() => new Set<string>());
  const [modalMode, setModalMode] = useState<"entry" | "topic" | null>(null);
  const [topicSaveError, setTopicSaveError] = useState<string | null>(null);

  const entriesQuery = useQuery({
    queryFn: () => fetchSubjectSummaryModuleAdminEntries({ ...filters, page: 1, pageSize: 50 }),
    queryKey: queryKeys.subjectSummaryModuleAdminEntries(filters)
  });
  const formOptionsQuery = useQuery({
    queryFn: () => fetchSubjectSummaryModuleFormOptions(draft.subjectId),
    queryKey: queryKeys.subjectSummaryModuleAdminFormOptions(draft.subjectId),
    staleTime: 30_000
  });
  const topicsQuery = useQuery({
    enabled: Boolean(filters.subjectId),
    placeholderData: (previous) => previous,
    queryFn: () => fetchSubjectSummaryModuleAdminTopics({ moduleType: filters.moduleType, status: filters.status, subjectId: filters.subjectId }),
    queryKey: queryKeys.subjectSummaryModuleAdminTopics({ moduleType: filters.moduleType, status: filters.status, subjectId: filters.subjectId })
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingEntry) {
        return updateSubjectSummaryModuleEntry(editingEntry.id, draft);
      }

      return createSubjectSummaryModuleEntry(draft);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.subjectSummaryModuleAdminEntries(filters) });
      setModalMode(null);
      setEditingEntry(null);
      setDraft(createDraft("", filters.moduleType));
    }
  });
  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const sanitizedEntries = topicDraft.entries
        .filter((entry) => !savedTopicEntryClientIds.has(entry.clientId))
        .map(({ clientId: _clientId, orderNumber: _orderNumber, ...entry }) => entry);
      const chunkSize = 20;

      if (sanitizedEntries.length === 0) {
        return { createdCount: 0 };
      }

      for (let offset = 0; offset < sanitizedEntries.length; offset += chunkSize) {
        await createSubjectSummaryModuleTopicEntries({
          ...topicDraft,
          entries: sanitizedEntries.slice(offset, offset + chunkSize)
        });
      }

      return { createdCount: sanitizedEntries.length };
    },
    onSuccess: async () => {
      setTopicSaveError(null);
      setSavedTopicEntryClientIds(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.subjectSummaryModuleAdminEntries(filters) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.subjectSummaryModuleAdminTopics({ moduleType: filters.moduleType, status: filters.status, subjectId: filters.subjectId })
        })
      ]);
      setModalMode(null);
      setEditingEntry(null);
      setTopicDraft({
        entries: [
          {
            clientId: createClientId(),
            orderNumber: 1,
            answer: "",
            difficulty: "EASY",
            estimatedReadingTime: 2,
            examTip: "",
            keyPrinciple: "",
            question: "",
            relatedCaseIds: [],
            relatedStatutes: [],
            tags: []
          }
        ],
        moduleType: filters.moduleType,
        status: "DRAFT",
        subjectId: filters.subjectId,
        topic: filters.topic
      });
    },
    onError: (error: any) => {
      setTopicSaveError(error?.response?.data?.error?.message || error?.message || "Could not save this topic right now.");
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSubjectSummaryModuleEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.subjectSummaryModuleAdminEntries(filters) });
    }
  });

  function openCreateModal() {
    setEditingEntry(null);
    setModalMode("topic");
    setTopicSaveError(null);
    setSavedTopicEntryClientIds(new Set());
    setTopicDraft({
      entries: [
        {
          clientId: createClientId(),
          orderNumber: 1,
          answer: "",
          difficulty: "EASY",
          estimatedReadingTime: 2,
          examTip: "",
          keyPrinciple: "",
          question: "",
          relatedCaseIds: [],
          relatedStatutes: [],
          tags: []
        }
      ],
      moduleType: filters.moduleType,
      status: "DRAFT",
      subjectId: filters.subjectId,
      topic: filters.topic
    });
  }

  function buildNextTopicEntryOrderNumber(currentEntries: TopicDraftState["entries"]) {
    return currentEntries.reduce((max, item) => Math.max(max, item.orderNumber), 0) + 1;
  }

  function hasTopicEntryContent(entry: TopicDraftState["entries"][number]) {
    return stripHtml(entry.question).length >= 2 || stripHtml(entry.answer).length >= 2;
  }

  function isTopicEntryValid(entry: TopicDraftState["entries"][number]) {
    return stripHtml(entry.question).length >= 2 && stripHtml(entry.answer).length >= 2;
  }

  async function autoSaveTopicEntries() {
    const trimmedTopic = topicDraft.topic.trim();

    if (!topicDraft.subjectId || trimmedTopic.length < 2) {
      return { savedCount: 0, didSave: false };
    }

    const unsavedEntries = topicDraft.entries.filter((entry) => !savedTopicEntryClientIds.has(entry.clientId));
    const unsavedWithContent = unsavedEntries.filter(hasTopicEntryContent);

    if (unsavedWithContent.length === 0) {
      return { savedCount: 0, didSave: false };
    }

    if (unsavedWithContent.some((entry) => !isTopicEntryValid(entry))) {
      setTopicSaveError("Please complete the current question and answer before adding another one.");
      return { savedCount: 0, didSave: false };
    }

    const sanitizedEntries = unsavedWithContent.map(({ clientId: _clientId, orderNumber: _orderNumber, ...entry }) => entry);
    const chunkSize = 20;

    for (let offset = 0; offset < sanitizedEntries.length; offset += chunkSize) {
      await createSubjectSummaryModuleTopicEntries({
        ...topicDraft,
        topic: trimmedTopic,
        entries: sanitizedEntries.slice(offset, offset + chunkSize)
      });
    }

    setSavedTopicEntryClientIds((current) => {
      const next = new Set(current);
      for (const entry of unsavedWithContent) {
        next.add(entry.clientId);
      }
      return next;
    });

    return { savedCount: sanitizedEntries.length, didSave: true };
  }

  async function handleTopicAddQuestion() {
    setTopicSaveError(null);

    try {
      await autoSaveTopicEntries();
    } catch (error: any) {
      setTopicSaveError(error?.response?.data?.error?.message || error?.message || "Could not save the current questions right now.");
      return;
    }

    setTopicDraft((current) => {
      const nextOrderNumber = buildNextTopicEntryOrderNumber(current.entries);
      return {
        ...current,
        entries: [
          {
            clientId: createClientId(),
            orderNumber: nextOrderNumber,
            answer: "",
            difficulty: "EASY",
            estimatedReadingTime: 2,
            examTip: "",
            keyPrinciple: "",
            question: "",
            relatedCaseIds: [],
            relatedStatutes: [],
            tags: []
          },
          ...(current.entries ?? [])
        ]
      };
    });
  }

  async function handleSaveAndAddQuestions() {
    const trimmedTopic = draft.topic.trim();

    if (trimmedTopic.length < 2) {
      setTopicSaveError("Please set a topic name before adding more questions.");
      return;
    }

    try {
      await saveMutation.mutateAsync();
    } catch {
      return;
    }

    setEditingEntry(null);
    setSavedTopicEntryClientIds(new Set());
    setTopicSaveError(null);
    setTopicDraft({
      entries: [
        {
          clientId: createClientId(),
          orderNumber: 1,
          answer: "",
          difficulty: "EASY",
          estimatedReadingTime: 2,
          examTip: "",
          keyPrinciple: "",
          question: "",
          relatedCaseIds: [],
          relatedStatutes: [],
          tags: []
        }
      ],
      moduleType: draft.moduleType,
      status: draft.status,
      subjectId: draft.subjectId,
      topic: trimmedTopic
    });
    setModalMode("topic");
    setDraft(createDraft("", filters.moduleType));
  }

  function openEditModal(entry: SubjectSummaryModuleAdminEntry) {
    setEditingEntry(entry);
    setModalMode("entry");
    setDraft({
      answer: entry.answer,
      difficulty: entry.difficulty,
      displayOrder: entry.displayOrder,
      estimatedReadingTime: entry.estimatedReadingTime,
      examTip: entry.examTip,
      keyPrinciple: entry.keyPrinciple,
      moduleType: entry.moduleType,
      topic: entry.topic,
      question: entry.question,
      relatedCaseIds: entry.relatedCases.map((item) => item.id),
      relatedStatutes: entry.relatedStatutes,
      status: entry.status,
      subjectId: entry.subjectId,
      tags: entry.tags
    });
  }

  useEffect(() => {
    setFilters((current) => {
      if (
        current.search === incomingSearch &&
        current.subjectId === incomingSubjectId &&
        current.moduleType === incomingModuleType &&
        current.topic === incomingTopic
      ) {
        return current;
      }

      return {
        ...current,
        moduleType: incomingModuleType,
        search: incomingSearch,
        subjectId: incomingSubjectId,
        topic: incomingTopic
      };
    });

    if (modalMode !== null) {
      return;
    }

    setDraft((current) => ({ ...current, moduleType: incomingModuleType }));
    setTopicDraft((current) => ({ ...current, moduleType: incomingModuleType }));
  }, [incomingModuleType, incomingSearch, incomingSubjectId, incomingTopic, modalMode]);

  useEffect(() => {
    const editEntryId = searchParams.get("editEntry");

    if (!editEntryId || modalMode !== null || !entriesQuery.data?.items.length) {
      return;
    }

    const match = entriesQuery.data.items.find((entry) => entry.id === editEntryId);

    if (!match) {
      return;
    }

    openEditModal(match);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("editEntry");
    setSearchParams(nextParams, { replace: true });
  }, [entriesQuery.data?.items, modalMode, searchParams, setSearchParams]);

  return (
    <div className="space-y-6">
      <section className={cn("rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)]", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Subject summary</p>
            <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
              Build premium Q&amp;A revision guides from your Cases and Ratios subjects.
            </h2>
            <p className={cn("mt-3 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
              Each summary belongs to one existing subject and can link directly to related cases, statutes, exam tips, and student study actions.
            </p>
          </div>
          <button className="button-primary inline-flex items-center gap-2 !px-5 !py-3" onClick={openCreateModal} type="button">
            <Plus className="h-4 w-4" />
            {filters.topic ? "Add questions" : "Create topic summary"}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
          <label className={cn("flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
            <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
            <input
              className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search questions, answers, principles, or linked cases"
              value={filters.search}
            />
          </label>

          <select
            className={cn("rounded-[24px] border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
            onChange={(event) => {
              const nextSubjectId = event.target.value;
              setFilters((current) => ({ ...current, subjectId: nextSubjectId, topic: "" }));
              setTopicDraft((current) => ({ ...current, subjectId: nextSubjectId, topic: "" }));
              setDraft((current) => ({ ...current, subjectId: nextSubjectId, topic: "" }));

              const nextParams = new URLSearchParams(searchParams);
              if (nextSubjectId) {
                nextParams.set("subjectId", nextSubjectId);
              } else {
                nextParams.delete("subjectId");
              }
              nextParams.delete("topic");
              setSearchParams(nextParams, { replace: true });
            }}
            value={filters.subjectId}
          >
            <option value="">All subjects</option>
            {entriesQuery.data?.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>

          <select
            className={cn("rounded-[24px] border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
            disabled={!filters.subjectId}
            onChange={(event) => {
              const nextTopic = event.target.value;
              setFilters((current) => ({ ...current, topic: nextTopic }));
              setTopicDraft((current) => ({ ...current, topic: nextTopic }));
              setDraft((current) => ({ ...current, topic: nextTopic }));

              const nextParams = new URLSearchParams(searchParams);
              if (nextTopic) {
                nextParams.set("topic", nextTopic);
              } else {
                nextParams.delete("topic");
              }
              setSearchParams(nextParams, { replace: true });
            }}
            value={filters.topic}
          >
            <option value="">{filters.subjectId ? "All topics" : "Select subject first"}</option>
            {topicsQuery.data?.items.map((topic) => (
              <option key={topic.topic} value={topic.topic}>
                {topic.topic}
              </option>
            ))}
          </select>

          <select
            className={cn("rounded-[24px] border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as AdminFilters["status"] }))}
            value={filters.status}
          >
            <option value="all">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total questions", value: entriesQuery.data?.summary.totalEntries ?? 0 },
          { label: "Published", value: entriesQuery.data?.summary.publishedCount ?? 0 },
          { label: "Drafts", value: entriesQuery.data?.summary.draftCount ?? 0 },
          { label: "Archived", value: entriesQuery.data?.summary.archivedCount ?? 0 }
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Question bank</p>
            <h3 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>Manage revision cards</h3>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {entriesQuery.isLoading ? (
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading subject summaries...</p>
          ) : entriesQuery.data?.items.length ? (
            entriesQuery.data.items.map((entry) => (
              <article
                className={cn("rounded-[26px] border px-5 py-5", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}
                key={entry.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={cn("rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em]", difficultyMeta[entry.difficulty].tone)}>
                        {difficultyMeta[entry.difficulty].badge}
                      </span>
                      {entry.serialNumber ? (
                        <span className={cn("rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em]", isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600")}>
                          {entry.serialNumber}
                        </span>
                      ) : null}
                      <span className={cn("rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em]", isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600")}>
                        {entry.status}
                      </span>
                      <span className={cn("rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em]", isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600")}>
                        {entry.moduleType === "NLS" ? "NLS" : "Faculty"}
                      </span>
                      <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{entry.subject.name}</span>
                      {entry.topic ? (
                        <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>• {entry.topic}</span>
                      ) : null}
                    </div>
                    <h4 className={cn("mt-3 font-heading text-2xl leading-tight", isDark ? "text-white" : "text-slate-950")}>{entry.question}</h4>
                    <p className={cn("mt-3 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
                      {stripHtml(entry.answer).slice(0, 260)}
                      {stripHtml(entry.answer).length > 260 ? "..." : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                      <span className={cn("inline-flex items-center gap-2", isDark ? "text-slate-400" : "text-slate-500")}>
                        <Clock3 className="h-4 w-4" />
                        {entry.estimatedReadingTime} mins
                      </span>
                      <span className={cn("inline-flex items-center gap-2", isDark ? "text-slate-400" : "text-slate-500")}>
                        <Sparkles className="h-4 w-4" />
                        {entry.relatedCases.length} related cases
                      </span>
                    </div>
                    {entry.reviewFeedback ? (
                      <div
                        className={cn(
                          "mt-4 rounded-[22px] border px-4 py-4 text-sm leading-7",
                          isDark
                            ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                        )}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em]">Revision note</p>
                        <p className="mt-2">{entry.reviewFeedback}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl border", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700")}
                      onClick={() => openEditModal(entry)}
                      type="button"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl border", isDark ? "border-rose-500/20 bg-rose-500/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-700")}
                      onClick={() => deleteMutation.mutate(entry.id)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className={cn("rounded-[24px] border px-6 py-12 text-center", isDark ? "border-slate-800 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
              No subject summaries match the current filters yet.
            </div>
          )}
        </div>
      </section>

      {modalMode === "entry" ? (
        <AdminEntryModal
          draft={draft}
          isDark={isDark}
          isSaving={saveMutation.isPending}
          onChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
          onClose={() => {
            setModalMode(null);
            setEditingEntry(null);
            setDraft(createDraft("", filters.moduleType));
          }}
          onSubmit={() => saveMutation.mutate()}
          onSubmitAndAddQuestions={handleSaveAndAddQuestions}
          relatedCases={formOptionsQuery.data?.relatedCases ?? []}
          subjects={formOptionsQuery.data?.subjects ?? []}
          title="Edit subject summary"
        />
      ) : null}

      {modalMode === "topic" ? (
        <AdminTopicModal
          draft={topicDraft}
          isDark={isDark}
          isSaving={bulkCreateMutation.isPending}
          onAddQuestion={handleTopicAddQuestion}
          onClose={() => {
            setModalMode(null);
            setTopicSaveError(null);
            setSavedTopicEntryClientIds(new Set());
          }}
          onSubmit={() => bulkCreateMutation.mutate()}
          onUpdate={(nextDraft) => setTopicDraft(nextDraft)}
          subjects={formOptionsQuery.data?.subjects ?? []}
          title={filters.topic ? "Add questions" : "Create topic summary"}
        />
      ) : null}

      {topicSaveError ? (
        <div className="fixed right-6 top-6 z-[90] max-w-[380px] rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-[0_18px_65px_rgba(15,23,42,0.18)]">
          {topicSaveError}
        </div>
      ) : null}
    </div>
  );
}

export function StudentSubjectSummaryModulePage() {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const moduleType: SubjectSummaryModuleType = searchParams.get("moduleType") === "NLS" ? "NLS" : "FACULTY";
  const incomingSubjectId = searchParams.get("subjectId") ?? "";
  const incomingTopic = searchParams.get("topic") ?? "";
  const [selectedSubjectId, setSelectedSubjectId] = useState(incomingSubjectId);
  const [selectedTopic, setSelectedTopic] = useState(incomingTopic);

  const modulePath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("moduleType", moduleType);
    if (selectedSubjectId) {
      params.set("subjectId", selectedSubjectId);
    }
    if (selectedTopic) {
      params.set("topic", selectedTopic);
    }
    return `/app/library/cases-and-ratios?${params.toString()}`;
  }, [moduleType, selectedSubjectId, selectedTopic]);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [entrySearch, setEntrySearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");
  const [openEntryIds, setOpenEntryIds] = useState<string[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [optimisticReadIds, setOptimisticReadIds] = useState<string[]>([]);
  const [continueReadingTargetId, setContinueReadingTargetId] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<null | { entryId: string; message: string; tone: "green" | "red" }>(null);
  const deferredSubjectSearch = useDeferredValue(subjectSearch);
  const deferredEntrySearch = useDeferredValue(entrySearch);

  const subjectsQuery = useQuery({
    placeholderData: (previous) => previous,
    queryFn: () => fetchStudentSubjectSummaryModuleSubjects(deferredSubjectSearch, moduleType),
    queryKey: queryKeys.subjectSummaryModuleStudentSubjects({ moduleType, search: deferredSubjectSearch })
  });
  const topicsQuery = useQuery({
    enabled: Boolean(selectedSubjectId),
    placeholderData: (previous) => previous,
    queryFn: () => fetchStudentSubjectSummaryModuleTopics({ moduleType, subjectId: selectedSubjectId }),
    queryKey: queryKeys.subjectSummaryModuleStudentTopics({ moduleType, subjectId: selectedSubjectId })
  });
  const entriesQuery = useQuery({
    enabled: Boolean(selectedSubjectId && selectedTopic),
    placeholderData: (previous) => previous,
    queryFn: () =>
      fetchStudentSubjectSummaryModuleEntries({
        filter,
        moduleType,
        query: deferredEntrySearch,
        subjectId: selectedSubjectId,
        topic: selectedTopic
      }),
    queryKey: queryKeys.subjectSummaryModuleStudentEntries({
      filter,
      moduleType,
      query: deferredEntrySearch,
      subjectId: selectedSubjectId,
      topic: selectedTopic
    })
  });
  const bookmarksQuery = useQuery({
    queryFn: () => fetchStudentStudyBookmarks({ contentType: "SUBJECT_SUMMARY_ENTRY" }),
    queryKey: queryKeys.studentStudyBookmarks({ contentType: "SUBJECT_SUMMARY_ENTRY" })
  });
  const notesQuery = useQuery({
    queryFn: () => fetchStudentStudyNotes(""),
    queryKey: queryKeys.studentStudyNotes("")
  });

  useEffect(() => {
    if (!selectedSubjectId && subjectsQuery.data?.items.length) {
      setSelectedSubjectId(subjectsQuery.data.items[0].id);
    }
  }, [selectedSubjectId, subjectsQuery.data?.items]);

  useEffect(() => {
    setSelectedSubjectId("");
    setOpenEntryIds([]);
  }, [moduleType]);

  useEffect(() => {
    if (!selectedSubjectId) {
      return;
    }

    const nextParams = new URLSearchParams();
    nextParams.set("moduleType", moduleType);
    nextParams.set("subjectId", selectedSubjectId);
    if (selectedTopic) {
      nextParams.set("topic", selectedTopic);
    } else {
      nextParams.delete("topic");
    }

    if (nextParams.toString() === searchParams.toString()) {
      return;
    }
    setSearchParams(nextParams, { replace: true });
  }, [moduleType, searchParams, selectedSubjectId, selectedTopic, setSearchParams]);

  useEffect(() => {
    setSelectedTopic("");
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubjectId) {
      return;
    }

    if (selectedTopic) {
      const topics = topicsQuery.data?.items ?? [];
      if (topics.length && !topics.some((item) => item.topic === selectedTopic)) {
        setSelectedTopic("");
      }
      return;
    }

    if (topicsQuery.data?.items.length) {
      setSelectedTopic(topicsQuery.data.items[0].topic);
    }
  }, [selectedSubjectId, selectedTopic, topicsQuery.data?.items]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};

    for (const note of notesQuery.data?.items ?? []) {
      if (note.contentKey?.startsWith("SUBJECT_SUMMARY_ENTRY:")) {
        nextDrafts[note.contentKey.replace("SUBJECT_SUMMARY_ENTRY:", "")] = note.contentPlainText;
      }
    }

    setNoteDrafts((current) => ({ ...nextDrafts, ...current }));
  }, [notesQuery.data?.items]);

  const saveNoteMutation = useMutation({
    mutationFn: async (entry: SubjectSummaryModuleStudentEntry) => {
      const contentKey = `SUBJECT_SUMMARY_ENTRY:${entry.id}`;
      const existingNote = (notesQuery.data?.items ?? []).find((item) => item.contentKey === contentKey) ?? null;
      const contentPlainText = (noteDrafts[entry.id] ?? "").trim();
      const trimmedQuestion = entry.question.trim();
      const payload = {
        attachmentUrls: [],
        contentHtml: `<p>${contentPlainText.replace(/\n/g, "<br/>")}</p>`,
        contentKey,
        contentPlainText,
        contentType: "SUBJECT_SUMMARY_ENTRY" as const,
        path: modulePath,
        referenceTitle: truncateText(trimmedQuestion, 220),
        subjectName: entry.subject.name,
        title: truncateText(`Note: ${trimmedQuestion}`, 220),
        topicName: undefined
      };

      if (existingNote) {
        return updateStudentStudyNote(existingNote.id, payload);
      }

      return createStudentStudyNote(payload);
    },
    onSuccess: async (_, entry) => {
      setNoteStatus({
        entryId: entry.id,
        message: "Your note was saved.",
        tone: "green"
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyNotes("") });
    },
    onError: (error: any, entry) => {
      setNoteStatus({
        entryId: entry.id,
        message:
          error?.response?.data?.error?.message ||
          error?.message ||
          "Could not save your note right now.",
        tone: "red"
      });
    }
  });
  const deleteNoteMutation = useMutation({
    mutationFn: deleteStudentStudyNote,
    onSuccess: async (_, noteId) => {
      const deletedNote = (notesQuery.data?.items ?? []).find((item) => item.id === noteId) ?? null;

      if (deletedNote?.contentKey?.startsWith("SUBJECT_SUMMARY_ENTRY:")) {
        setNoteStatus({
          entryId: deletedNote.contentKey.replace("SUBJECT_SUMMARY_ENTRY:", ""),
          message: "Your note was deleted.",
          tone: "green"
        });
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyNotes("") });
    },
    onError: (error: any) => {
      setNoteStatus({
        entryId: "",
        message:
          error?.response?.data?.error?.message ||
          error?.message ||
          "Could not delete your note right now.",
        tone: "red"
      });
    }
  });
  const bookmarkMutation = useMutation({
    mutationFn: async (entry: SubjectSummaryModuleStudentEntry) => {
      const existingBookmark = (bookmarksQuery.data?.items ?? []).find((item) => item.contentKey === `SUBJECT_SUMMARY_ENTRY:${entry.id}`) ?? null;

      if (existingBookmark) {
        await deleteStudentStudyBookmark(existingBookmark.id);
        return;
      }

      await createStudentStudyBookmark({
        contentKey: `SUBJECT_SUMMARY_ENTRY:${entry.id}`,
        contentType: "SUBJECT_SUMMARY_ENTRY",
        path: modulePath,
        subjectName: entry.subject.name,
        title: entry.question
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyBookmarks({ contentType: "SUBJECT_SUMMARY_ENTRY" }) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.subjectSummaryModuleStudentEntries({
            filter,
            moduleType,
            query: entrySearch,
            subjectId: selectedSubjectId,
            topic: selectedTopic
          })
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyCenter })
      ]);
    }
  });
  const progressMutation = useMutation({
    mutationFn: (entry: SubjectSummaryModuleStudentEntry) =>
      saveStudentStudyProgress({
        completed: true,
        contentKey: `SUBJECT_SUMMARY_ENTRY:${entry.id}`,
        contentType: "SUBJECT_SUMMARY_ENTRY",
        lastPositionLabel: "Revision card opened",
        path: modulePath,
        readingProgressPct: 100,
        subjectName: entry.subject.name,
        timeSpentSeconds: entry.estimatedReadingTime * 60,
        title: entry.question
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.subjectSummaryModuleStudentEntries({
            filter,
            moduleType,
            query: deferredEntrySearch,
            subjectId: selectedSubjectId,
            topic: selectedTopic
          })
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyCenter })
      ]);
    }
  });

  const bookmarksByKey = useMemo(
    () => new Map((bookmarksQuery.data?.items ?? []).map((item) => [item.contentKey, item])),
    [bookmarksQuery.data?.items]
  );
  const contentAccess = entriesQuery.data?.contentAccess ?? null;
  const notesByKey = useMemo(
    () => new Map((notesQuery.data?.items ?? []).filter((item) => item.contentKey).map((item) => [item.contentKey!, item])),
    [notesQuery.data?.items]
  );

  useEffect(() => {
    if (!continueReadingTargetId || !entriesQuery.data?.entries.length) {
      return;
    }

    const matchingEntry = entriesQuery.data.entries.find((entry) => entry.id === continueReadingTargetId);

    if (!matchingEntry) {
      return;
    }

    setOpenEntryIds((current) => (current.includes(continueReadingTargetId) ? current : [...current, continueReadingTargetId]));

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(`summary-entry-${continueReadingTargetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setContinueReadingTargetId(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [continueReadingTargetId, entriesQuery.data?.entries]);

  function toggleEntry(entry: SubjectSummaryModuleStudentEntry) {
    setOpenEntryIds((current) => (current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id]));

    void saveStudentStudyProgress({
      contentKey: `SUBJECT_SUMMARY_ENTRY:${entry.id}`,
      contentType: "SUBJECT_SUMMARY_ENTRY",
      lastPositionLabel: "Revision card opened",
      path: modulePath,
      readingProgressPct: Math.max(entry.progress.readingProgressPct, 20),
      subjectName: entry.subject.name,
      timeSpentSeconds: 20,
      title: entry.question
    }).then(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.subjectSummaryModuleStudentEntries({
          filter,
          moduleType,
          query: deferredEntrySearch,
          subjectId: selectedSubjectId,
          topic: selectedTopic
        })
      });
    });
  }

  function continueReading() {
    const entryId = entriesQuery.data?.stats.continueReadingEntryId;

    if (!entryId) {
      return;
    }

    setFilter("all");
    setEntrySearch("");
    setContinueReadingTargetId(entryId);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className={cn("h-fit rounded-[28px] border p-5 xl:sticky xl:top-6", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
        <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>
          {moduleType === "NLS" ? "NLS summaries" : "Faculty summaries"}
        </p>
        <h2 className={cn("mt-3 font-heading text-3xl leading-tight", isDark ? "text-white" : "text-slate-950")}>Study by subject.</h2>
        <label className={cn("mt-5 flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
          <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
          <input
            className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
            onChange={(event) => setSubjectSearch(event.target.value)}
            placeholder="Search subject..."
            value={subjectSearch}
          />
        </label>

        <div className="mt-5 space-y-3">
          {subjectsQuery.data?.items.map((subject: SubjectSummaryModuleStudentSubject) => (
            <button
              className={cn(
                "w-full rounded-[24px] border px-4 py-4 text-left transition",
                selectedSubjectId === subject.id
                  ? isDark
                    ? "border-orange-400/60 bg-slate-950 text-white"
                    : "border-orange-300 bg-orange-50 text-slate-950"
                  : isDark
                    ? "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
              )}
              key={subject.id}
              onClick={() => {
                setSelectedSubjectId(subject.id);
                setOpenEntryIds([]);
              }}
              type="button"
            >
              <p className="font-medium">{subject.name}</p>
              <div className={cn("mt-2 flex flex-wrap items-center gap-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                <span>{subject.questionCount} questions</span>
                <span>{subject.completionPct}% complete</span>
              </div>
            </button>
          ))}
        </div>

        {selectedSubjectId ? (
          <div className="mt-6 border-t pt-5">
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Topics</p>
            <div className="mt-4 space-y-2">
              {topicsQuery.isLoading ? (
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading topics...</p>
              ) : topicsQuery.data?.items.length ? (
                topicsQuery.data.items.map((topic: SubjectSummaryModuleStudentTopic) => (
                  <button
                    className={cn(
                      "w-full rounded-[22px] border px-4 py-3 text-left text-sm transition",
                      selectedTopic === topic.topic
                        ? isDark
                          ? "border-emerald-400/60 bg-slate-950 text-white"
                          : "border-emerald-300 bg-emerald-50 text-slate-950"
                        : isDark
                          ? "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                    )}
                    key={topic.topic}
                    onClick={() => {
                      setSelectedTopic(topic.topic);
                      setOpenEntryIds([]);
                      setEntrySearch("");
                      setFilter("all");
                    }}
                    type="button"
                  >
                    <p className="font-medium">{topic.topic}</p>
                    <p className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{topic.questionCount} questions</p>
                  </button>
                ))
              ) : (
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>No topics published yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </aside>

      <div className="space-y-6">
        {entriesQuery.data ? (
          <>
            <section className={cn("rounded-[30px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)]", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    {moduleType === "NLS" ? "NLS summary" : "Faculty summary"}
                  </p>
                  <h1 className={cn("mt-3 font-heading text-4xl", isDark ? "text-white" : "text-slate-950")}>{selectedTopic}</h1>
                  <p className={cn("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{entriesQuery.data.subject.name}</p>
                </div>
                <button className="button-primary !px-5 !py-3" onClick={continueReading} type="button">
                  Continue reading
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: "Total Questions", value: entriesQuery.data.stats.questionsTotal },
                  { label: "Completed", value: entriesQuery.data.stats.completed },
                  { label: "Remaining", value: entriesQuery.data.stats.questionsRemaining },
                  { label: "Study Progress", value: `${entriesQuery.data.stats.completionPct}%` },
                  { label: "Reading Time", value: formatMinutes(entriesQuery.data.subject.estimatedReadingTime) },
                  { label: "Last Updated", value: formatDate(entriesQuery.data.subject.lastUpdated) }
                ].map((item) => (
                  <div
                    className={cn("rounded-[24px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-slate-50")}
                    key={item.label}
                  >
                    <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                    <p className={cn("mt-3 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            {contentAccess?.isPreview ? (
              <section
                className={cn(
                  "rounded-[28px] border px-6 py-5",
                  isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800"
                )}
              >
                <p className="text-xs uppercase tracking-[0.2em]">Preview only</p>
                <h2 className="mt-3 text-lg font-semibold">Your full revision access is locked right now.</h2>
                <p className="mt-2 text-sm leading-7">
                  {contentAccess.upgradeMessage} You can read up to {contentAccess.previewWordLimit} words from each published answer until your subscription becomes active again.
                </p>
                <Link className="mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-medium" to="/app/subscription">
                  Renew subscription
                </Link>
              </section>
            ) : null}

            <section className={cn("sticky top-0 z-20 rounded-[28px] border p-5", isDark ? "border-slate-800 bg-slate-900/95" : "border-slate-200 bg-white/95")}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                <label className={cn("flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                  <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
                  <input
                    className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
                    onChange={(event) => setEntrySearch(event.target.value)}
                    placeholder="Search questions, keywords, principles, cases, or ratios"
                    value={entrySearch}
                  />
                </label>
                <label className={cn("flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                  <Filter className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
                  <select
                    className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white" : "text-slate-950")}
                    onChange={(event) => setFilter(event.target.value as StudentFilter)}
                    value={filter}
                  >
                    {studentFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {entriesQuery.isFetching ? (
                <p className={cn("mt-3 text-xs", isDark ? "text-slate-500" : "text-slate-500")}>Updating search results...</p>
              ) : null}
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              {[
                { label: "Bookmarks", value: entriesQuery.data.stats.bookmarks },
                { label: "Notes Created", value: entriesQuery.data.stats.notesCreated },
                { label: "Study Streak", value: `${entriesQuery.data.stats.studyStreak} days` },
                { label: "Weekly Progress", value: `${entriesQuery.data.stats.weeklyProgressPct}%` }
              ].map((item) => (
                <div className={cn("rounded-[24px] border px-5 py-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")} key={item.label}>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                  <p className={cn("mt-3 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                </div>
              ))}
            </section>

            <section className="space-y-4">
              {entriesQuery.data.entries.map((entry) => {
                const contentKey = `SUBJECT_SUMMARY_ENTRY:${entry.id}`;
                const note = notesByKey.get(contentKey) ?? null;
                const bookmark = bookmarksByKey.get(contentKey) ?? null;

                return (
                  <StudentSummaryCard
                    bookmarkId={bookmark?.id ?? null}
                    entry={entry}
                    isDark={isDark}
                    key={entry.id}
                    note={note}
                    noteFeedback={noteStatus?.entryId === entry.id || (!noteStatus?.entryId && noteStatus?.tone === "red") ? noteStatus : null}
                    noteDraft={noteDrafts[entry.id] ?? note?.contentPlainText ?? ""}
                    saveNoteLabel={saveNoteMutation.isPending && saveNoteMutation.variables?.id === entry.id ? "Saving..." : "Save note"}
                    onDeleteNote={() => {
                      setNoteStatus(null);
                      setNoteDrafts((current) => ({ ...current, [entry.id]: "" }));
                      if (note) {
                        deleteNoteMutation.mutate(note.id);
                      }
                    }}
                    onMarkAsRead={() => {
                      setOptimisticReadIds((current) => (current.includes(entry.id) ? current : [...current, entry.id]));
                      progressMutation.mutate(entry, {
                        onError: () => {
                          setOptimisticReadIds((current) => current.filter((id) => id !== entry.id));
                        }
                      });
                    }}
                    onSaveNote={() => {
                      setNoteStatus(null);
                      saveNoteMutation.mutate(entry);
                    }}
                    onToggle={() => toggleEntry(entry)}
                    onToggleBookmark={() => bookmarkMutation.mutate(entry)}
                    onUpdateNoteDraft={(value) => {
                      setNoteStatus((current) => (current?.entryId === entry.id ? null : current));
                      setNoteDrafts((current) => ({ ...current, [entry.id]: value }));
                    }}
                    open={openEntryIds.includes(entry.id)}
                    previewMode={Boolean(contentAccess?.isPreview)}
                    previewWordLimit={contentAccess?.previewWordLimit ?? 150}
                    readOverride={optimisticReadIds.includes(entry.id)}
                  />
                );
              })}
            </section>
          </>
        ) : selectedSubjectId ? (
          <section className={cn("rounded-[30px] border px-6 py-10", isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600")}>
            Select a topic to view the questions and answers.
          </section>
        ) : (
          <section className={cn("rounded-[30px] border px-6 py-10", isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600")}>
            Select a subject to see its published topics.
          </section>
        )}
      </div>
    </div>
  );
}
