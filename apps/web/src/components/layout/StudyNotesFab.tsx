import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  FilePlus2,
  Highlighter,
  History,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  NotebookPen,
  Quote,
  Redo2,
  Search,
  Star,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  X
} from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  createStudentStudyNote,
  deleteStudentStudyNote,
  fetchPublishedSubjectSummaryHierarchy,
  fetchPublishedSubjectSummaryHierarchyTopics,
  fetchStudentStudyNotes,
  fetchSubjectSummarySubjects,
  fetchSubjectSummaryTopics,
  type StudentStudyNote,
  updateStudentStudyNote
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

type ToastTone = "error" | "success";
type HistoryFilter = "all" | "drafts" | "favorites" | "recentlyCreated" | "recentlyEdited";

type StudyNoteDraft = {
  attachmentUrls: string;
  contentHtml: string;
  path: string;
  referenceTitle: string;
  subjectId: string;
  subjectName: string;
  title: string;
  topicId: string;
  topicName: string;
};

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function createEmptyDraft(pathname: string): StudyNoteDraft {
  return {
    attachmentUrls: "",
    contentHtml: "",
    path: pathname,
    referenceTitle: "",
    subjectId: "",
    subjectName: "",
    title: "",
    topicId: "",
    topicName: ""
  };
}

function createDraftFromNote(note: StudentStudyNote): StudyNoteDraft {
  return {
    attachmentUrls: note.attachmentUrls.join("\n"),
    contentHtml: note.contentHtml,
    path: note.path ?? "",
    referenceTitle: note.referenceTitle ?? "",
    subjectId: "",
    subjectName: note.subjectName ?? "",
    title: note.title,
    topicId: "",
    topicName: note.topicName ?? ""
  };
}

function downloadNoteForPdf(note: StudentStudyNote) {
  const printableWindow = window.open("", "_blank", "width=900,height=700");

  if (!printableWindow) {
    return;
  }

  printableWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${note.title}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #111827; }
          h1 { font-size: 28px; margin-bottom: 12px; }
          .meta { margin-bottom: 24px; color: #475569; font-size: 14px; }
          .meta p { margin: 4px 0; }
          .content { line-height: 1.75; }
          .content table { border-collapse: collapse; width: 100%; }
          .content th, .content td { border: 1px solid #cbd5e1; padding: 8px; }
          .content blockquote { border-left: 4px solid #f97316; margin: 16px 0; padding-left: 12px; color: #475569; }
        </style>
      </head>
      <body>
        <h1>${note.title}</h1>
        <div class="meta">
          <p><strong>Subject:</strong> ${note.subjectName ?? "Not set"}</p>
          <p><strong>Topic:</strong> ${note.topicName ?? "Not set"}</p>
          <p><strong>Created:</strong> ${formatDateTime(note.createdAt)}</p>
          <p><strong>Updated:</strong> ${formatDateTime(note.updatedAt)}</p>
        </div>
        <div class="content">${note.contentHtml}</div>
      </body>
    </html>
  `);
  printableWindow.document.close();
  printableWindow.focus();
  printableWindow.print();
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
    <div className="pointer-events-none fixed right-6 top-6 z-[150] flex w-full max-w-sm flex-col gap-3">
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
  isDark,
  onClick,
  title
}: {
  children: ReactNode;
  isDark: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-2xl border transition",
        isDark
          ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function NoteEditor({
  isDark,
  onChange,
  value
}: {
  isDark: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const highlightInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (!editorRef.current || editorRef.current.innerHTML === value) {
      return;
    }

    editorRef.current.innerHTML = value;
  }, [value]);

  function focusEditor() {
    editorRef.current?.focus();
  }

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

  function applyCommand(command: string, valueArg?: string) {
    if (!editorRef.current) {
      return;
    }

    focusEditor();
    restoreSelection();
    document.execCommand(command, false, valueArg);
    onChange(editorRef.current.innerHTML);
  }

  function insertTable() {
    applyCommand(
      "insertHTML",
      `<table><thead><tr><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p></p>`
    );
  }

  function insertChecklist() {
    applyCommand("insertHTML", `<ul><li><input type="checkbox" /> Checklist item</li></ul><p></p>`);
  }

  function insertLink() {
    saveSelection();
    const url = window.prompt("Enter the link URL");

    if (!url) {
      return;
    }

    applyCommand("createLink", url);
  }

  function insertImage() {
    saveSelection();
    const url = window.prompt("Enter the image URL");

    if (!url) {
      return;
    }

    applyCommand("insertImage", url);
  }

  return (
    <div className={cn("rounded-[24px] border", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
      <div className={cn("flex flex-wrap gap-2 border-b px-3 py-2.5", isDark ? "border-slate-700" : "border-slate-200")}>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("undo")} title="Undo">
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("redo")} title="Redo">
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("bold")} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("italic")} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("underline")} title="Underline">
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("strikeThrough")} title="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("formatBlock", "<h1>")} title="Heading 1">
          <span className="text-xs font-semibold">H1</span>
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("formatBlock", "<h2>")} title="Heading 2">
          <span className="text-xs font-semibold">H2</span>
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("fontSize", "4")} title="Larger text">
          <span className="text-xs font-semibold">A+</span>
        </ToolbarButton>
        <ToolbarButton
          isDark={isDark}
          onClick={() => {
            saveSelection();
            colorInputRef.current?.click();
          }}
          title="Font color"
        >
          <span className="text-xs font-semibold">A</span>
        </ToolbarButton>
        <input
          className="sr-only"
          onChange={(event) => applyCommand("foreColor", event.target.value)}
          ref={colorInputRef}
          type="color"
        />
        <ToolbarButton
          isDark={isDark}
          onClick={() => {
            saveSelection();
            highlightInputRef.current?.click();
          }}
          title="Highlight"
        >
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
        <input
          className="sr-only"
          onChange={(event) => applyCommand("hiliteColor", event.target.value)}
          ref={highlightInputRef}
          type="color"
          value="#fde68a"
        />
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("insertUnorderedList")} title="Bullet list">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("insertOrderedList")} title="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={insertChecklist} title="Checklist">
          <ListChecks className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("formatBlock", "<blockquote>")} title="Block quote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={insertTable} title="Insert table">
          <Table2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={insertLink} title="Insert link">
          <span className="text-xs font-semibold">Link</span>
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={insertImage} title="Insert image">
          <ImagePlus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("formatBlock", "<pre>")} title="Code block">
          <span className="text-xs font-semibold">&lt;/&gt;</span>
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("insertHorizontalRule")} title="Horizontal line">
          <span className="text-xs font-semibold">HR</span>
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("justifyLeft")} title="Align left">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("justifyCenter")} title="Align center">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton isDark={isDark} onClick={() => applyCommand("justifyRight")} title="Align right">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div
        className={cn(
          "rich-text-content min-h-[280px] px-4 py-3 text-sm leading-7 outline-none",
          isDark ? "text-white" : "text-slate-950"
        )}
        contentEditable
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        ref={editorRef}
        suppressContentEditableWarning
      />
    </div>
  );
}

function StudyNoteComposer({
  autoSaveStatus,
  draft,
  isDark,
  isOpen,
  isSaving,
  noteModeLabel,
  onChange,
  onClose,
  onSaveDraft,
  onSaveNote,
  subjects,
  subjectsLoading,
  topics,
  topicsLoading
}: {
  autoSaveStatus: string;
  draft: StudyNoteDraft;
  isDark: boolean;
  isOpen: boolean;
  isSaving: boolean;
  noteModeLabel: string;
  onChange: (field: keyof StudyNoteDraft, value: string) => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onSaveNote: () => void;
  subjects: Array<{ id: string; name: string }>;
  subjectsLoading: boolean;
  topics: Array<{ id: string; name: string }>;
  topicsLoading: boolean;
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn(
          "flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border shadow-[0_30px_100px_rgba(15,23,42,0.28)]",
          isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn("flex items-start justify-between border-b px-6 py-5", isDark ? "border-slate-800" : "border-slate-200")}>
          <div>
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Study notes</p>
            <h2 className={cn("mt-2 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>Create New Study Note</h2>
            <p className={cn("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
              {noteModeLabel} · {autoSaveStatus}
            </p>
          </div>
          <button
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition",
              isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900 shadow-sm"
            )}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Title</span>
              <input
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("title", event.target.value)}
                placeholder="Optional note title"
                value={draft.title}
              />
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
              <select
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("subjectId", event.target.value)}
                value={draft.subjectId}
              >
                <option value="">{subjectsLoading ? "Loading subjects..." : "Select subject"}</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Topic</span>
              <select
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("topicId", event.target.value)}
                value={draft.topicId}
              >
                <option value="">{topicsLoading ? "Loading topics..." : "Select topic"}</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Reference title</span>
              <input
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("referenceTitle", event.target.value)}
                placeholder="Optional linked material title"
                value={draft.referenceTitle}
              />
            </label>
            <label className="space-y-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Linked path</span>
              <input
                className={cn("w-full rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("path", event.target.value)}
                value={draft.path}
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Attachments</span>
              <textarea
                className={cn("min-h-[88px] w-full rounded-2xl border px-4 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                onChange={(event) => onChange("attachmentUrls", event.target.value)}
                placeholder="Optional attachment URLs, one per line"
                value={draft.attachmentUrls}
              />
            </label>
            <div className="space-y-2 md:col-span-2">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Note body</span>
              <NoteEditor isDark={isDark} onChange={(value) => onChange("contentHtml", value)} value={draft.contentHtml} />
            </div>
          </div>
        </div>

        <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
          <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-500")}>Ctrl/Cmd + S saves the note quickly.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-white text-slate-900")}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
              disabled={isSaving}
              onClick={onSaveDraft}
              type="button"
            >
              Save Draft
            </button>
            <button
              className="button-primary !px-5 !py-3"
              disabled={isSaving}
              onClick={onSaveNote}
              type="button"
            >
              {isSaving ? "Saving..." : "Save Note"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function StudyNotesFab({ isAdminWorkspace }: { isAdminWorkspace: boolean }) {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const location = useLocation();
  const isCompactAdminReviewFab = isAdminWorkspace && location.pathname.startsWith("/app/admin/content");
  const session = useAuthStore((state) => state.session);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<StudentStudyNote | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [notesSearch, setNotesSearch] = useState("");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState("");
  const [selectedTopicFilter, setSelectedTopicFilter] = useState("");
  const [draft, setDraft] = useState<StudyNoteDraft>(createEmptyDraft(location.pathname));
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState("Draft idle");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const deferredNotesSearch = useDeferredValue(notesSearch);
  const draftStorageKey = `helar-study-note-draft:${session?.user.id ?? "anonymous"}:${editingNote?.id ?? "new"}`;

  const notesQuery = useQuery({
    queryFn: () => fetchStudentStudyNotes(""),
    queryKey: queryKeys.studentStudyNotes("")
  });
  const subjectsQuery = useQuery({
    queryFn: async () => {
      if (isAdminWorkspace) {
        const response = await fetchSubjectSummarySubjects({
          page: 1,
          pageSize: 200,
          search: "",
          sortBy: "name",
          sortOrder: "asc",
          status: "all"
        });

        return response.items.map((item) => ({ id: item.id, name: item.name }));
      }

      const response = await fetchPublishedSubjectSummaryHierarchy("");
      return response.items.map((item) => ({ id: item.id, name: item.name }));
    },
    queryKey: ["study-notes-subjects", isAdminWorkspace]
  });
  const topicsQuery = useQuery({
    enabled: Boolean(draft.subjectId),
    queryFn: async () => {
      if (!draft.subjectId) {
        return [];
      }

      if (isAdminWorkspace) {
        const response = await fetchSubjectSummaryTopics({
          page: 1,
          pageSize: 200,
          search: "",
          sortBy: "name",
          sortOrder: "asc",
          status: "all",
          subjectId: draft.subjectId
        });

        return response.items.map((item) => ({ id: item.id, name: item.name }));
      }

      const response = await fetchPublishedSubjectSummaryHierarchyTopics(draft.subjectId, "");
      return response.items.map((item) => ({ id: item.id, name: item.name }));
    },
    queryKey: ["study-notes-topics", isAdminWorkspace, draft.subjectId]
  });

  function showToast(message: string, tone: ToastTone) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setDraft((current) => ({ ...current, path: current.path || location.pathname }));
  }, [location.pathname]);

  useEffect(() => {
    if (!subjectsQuery.data?.length || !draft.subjectName || draft.subjectId) {
      return;
    }

    const matchingSubject = subjectsQuery.data.find((item) => item.name === draft.subjectName);

    if (matchingSubject) {
      setDraft((current) => ({ ...current, subjectId: matchingSubject.id }));
    }
  }, [draft.subjectId, draft.subjectName, subjectsQuery.data]);

  useEffect(() => {
    if (!topicsQuery.data?.length || !draft.topicName || draft.topicId) {
      return;
    }

    const matchingTopic = topicsQuery.data.find((item) => item.name === draft.topicName);

    if (matchingTopic) {
      setDraft((current) => ({ ...current, topicId: matchingTopic.id }));
    }
  }, [draft.topicId, draft.topicName, topicsQuery.data]);

  useEffect(() => {
    if (!isComposerOpen) {
      return;
    }

    const savedDraft = window.localStorage.getItem(draftStorageKey);

    if (!savedDraft) {
      return;
    }

    try {
      const parsed = JSON.parse(savedDraft) as StudyNoteDraft;

      if (!editingNote && !stripHtml(draft.contentHtml) && !draft.title.trim()) {
        setDraft(parsed);
        setAutoSaveStatus("Recovered unsaved draft");
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draft.contentHtml, draft.title, draftStorageKey, editingNote, isComposerOpen]);

  useEffect(() => {
    if (!isComposerOpen) {
      return;
    }

    const interval = window.setInterval(() => {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setAutoSaveStatus(`Saved locally at ${new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(new Date())}`);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [draft, draftStorageKey, isComposerOpen]);

  useEffect(() => {
    if (!isComposerOpen) {
      return;
    }

    function handleKeyboardSave(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave(false);
      }
    }

    document.addEventListener("keydown", handleKeyboardSave);
    return () => document.removeEventListener("keydown", handleKeyboardSave);
  }, [draft, editingNote, isComposerOpen]);

  const saveNoteMutation = useMutation({
    mutationFn: async (mode: "draft" | "note") => {
      const selectedSubject = subjectsQuery.data?.find((item) => item.id === draft.subjectId) ?? null;
      const selectedTopic = topicsQuery.data?.find((item) => item.id === draft.topicId) ?? null;
      const payload = {
        attachmentUrls: draft.attachmentUrls
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        contentHtml: draft.contentHtml,
        contentPlainText: stripHtml(draft.contentHtml),
        isDraft: mode === "draft",
        isFavorite: editingNote?.isFavorite ?? false,
        path: draft.path.trim() || location.pathname,
        referenceTitle: draft.referenceTitle.trim() || undefined,
        subjectName: selectedSubject?.name ?? (draft.subjectName.trim() || undefined),
        title: draft.title.trim() || `Study note ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}`,
        topicName: selectedTopic?.name ?? (draft.topicName.trim() || undefined)
      };

      if (editingNote) {
        return updateStudentStudyNote(editingNote.id, payload);
      }

      return createStudentStudyNote(payload);
    },
    onSuccess: async (_, mode) => {
      window.localStorage.removeItem(draftStorageKey);
      setAutoSaveStatus("Saved");
      setIsComposerOpen(false);
      setEditingNote(null);
      setDraft(createEmptyDraft(location.pathname));
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyNotes("") });
      showToast(mode === "draft" ? "Draft saved." : "Study note saved.", "success");
      setIsHistoryOpen(true);
    },
    onError: () => showToast("Could not save the study note right now.", "error")
  });

  const deleteNoteMutation = useMutation({
    mutationFn: deleteStudentStudyNote,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyNotes("") });
      showToast("Study note deleted.", "success");
    },
    onError: () => showToast("Could not delete the study note.", "error")
  });

  const duplicateNoteMutation = useMutation({
    mutationFn: async (note: StudentStudyNote) =>
      createStudentStudyNote({
        attachmentUrls: note.attachmentUrls,
        contentHtml: note.contentHtml,
        contentPlainText: note.contentPlainText,
        isDraft: note.isDraft,
        isFavorite: false,
        path: note.path ?? location.pathname,
        referenceTitle: note.referenceTitle ?? undefined,
        subjectName: note.subjectName ?? undefined,
        title: `${note.title} (Copy)`,
        topicName: note.topicName ?? undefined
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyNotes("") });
      showToast("Study note duplicated.", "success");
    },
    onError: () => showToast("Could not duplicate the study note.", "error")
  });

  const favoriteNoteMutation = useMutation({
    mutationFn: async (note: StudentStudyNote) =>
      updateStudentStudyNote(note.id, {
        attachmentUrls: note.attachmentUrls,
        contentHtml: note.contentHtml,
        contentPlainText: note.contentPlainText,
        isDraft: note.isDraft,
        isFavorite: !note.isFavorite,
        path: note.path ?? undefined,
        referenceTitle: note.referenceTitle ?? undefined,
        subjectName: note.subjectName ?? undefined,
        title: note.title,
        topicName: note.topicName ?? undefined
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentStudyNotes("") });
    }
  });

  const filteredNotes = useMemo(() => {
    const searchText = deferredNotesSearch.trim().toLowerCase();
    const items = [...(notesQuery.data?.items ?? [])].filter((note) => {
      if (selectedSubjectFilter && note.subjectName !== selectedSubjectFilter) {
        return false;
      }

      if (selectedTopicFilter && note.topicName !== selectedTopicFilter) {
        return false;
      }

      if (historyFilter === "drafts" && !note.isDraft) {
        return false;
      }

      if (historyFilter === "favorites" && !note.isFavorite) {
        return false;
      }

      if (
        searchText &&
        ![
          note.title,
          note.subjectName ?? "",
          note.topicName ?? "",
          note.referenceTitle ?? "",
          note.contentPlainText
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchText)
      ) {
        return false;
      }

      return true;
    });

    const sorted = items.sort((left, right) => {
      if (historyFilter === "recentlyCreated") {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

    if (historyFilter === "favorites") {
      return sorted;
    }

    return sorted.sort((left, right) => Number(right.isFavorite) - Number(left.isFavorite));
  }, [deferredNotesSearch, historyFilter, notesQuery.data?.items, selectedSubjectFilter, selectedTopicFilter]);

  const selectedNote = filteredNotes.find((note) => note.id === selectedNoteId) ?? filteredNotes[0] ?? null;
  const uniqueSubjects = [...new Set((notesQuery.data?.items ?? []).map((note) => note.subjectName).filter(Boolean))] as string[];
  const uniqueTopics = [...new Set((notesQuery.data?.items ?? []).map((note) => note.topicName).filter(Boolean))] as string[];

  useEffect(() => {
    if (selectedNote?.id && selectedNote?.id !== selectedNoteId) {
      setSelectedNoteId(selectedNote.id);
    }
  }, [selectedNote?.id, selectedNoteId]);

  function updateDraftField(field: keyof StudyNoteDraft, value: string) {
    if (field === "subjectId") {
      const selectedSubject = subjectsQuery.data?.find((item) => item.id === value) ?? null;
      setDraft((current) => ({
        ...current,
        subjectId: value,
        subjectName: selectedSubject?.name ?? "",
        topicId: "",
        topicName: ""
      }));
      return;
    }

    if (field === "topicId") {
      const selectedTopic = topicsQuery.data?.find((item) => item.id === value) ?? null;
      setDraft((current) => ({
        ...current,
        topicId: value,
        topicName: selectedTopic?.name ?? ""
      }));
      return;
    }

    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(asDraft: boolean) {
    if (!asDraft && !stripHtml(draft.contentHtml)) {
      showToast("Add note content before saving.", "error");
      return;
    }

    await saveNoteMutation.mutateAsync(asDraft ? "draft" : "note");
  }

  function openNewNote() {
    setEditingNote(null);
    setDraft(createEmptyDraft(location.pathname));
    setAutoSaveStatus("Draft idle");
    setIsComposerOpen(true);
    setIsMenuOpen(false);
  }

  function openHistory() {
    setIsHistoryOpen(true);
    setIsMenuOpen(false);
  }

  function openEdit(note: StudentStudyNote) {
    setEditingNote(note);
    setDraft(createDraftFromNote(note));
    setAutoSaveStatus("Editing note");
    setIsComposerOpen(true);
  }

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} toasts={toasts} />

      <StudyNoteComposer
        autoSaveStatus={autoSaveStatus}
        draft={draft}
        isDark={isDark}
        isOpen={isComposerOpen}
        isSaving={saveNoteMutation.isPending}
        noteModeLabel={editingNote ? `Editing note · Last modified ${formatDateTime(editingNote.updatedAt)}` : "New personal note"}
        onChange={updateDraftField}
        onClose={() => setIsComposerOpen(false)}
        onSaveDraft={() => void handleSave(true)}
        onSaveNote={() => void handleSave(false)}
        subjects={subjectsQuery.data ?? []}
        subjectsLoading={subjectsQuery.isLoading}
        topics={topicsQuery.data ?? []}
        topicsLoading={topicsQuery.isLoading}
      />

      {isHistoryOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[145] bg-slate-950/35 backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)}>
              <div
                className={cn(
                  "absolute inset-y-0 right-0 flex w-full max-w-[1180px] flex-col border-l shadow-[0_28px_100px_rgba(15,23,42,0.22)] lg:w-[88%]",
                  isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
                )}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={cn("flex items-center justify-between border-b px-5 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
                  <div className="flex items-center gap-3">
                    <button
                      className={cn(
                        "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                        isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"
                      )}
                      onClick={() => setIsHistoryOpen(false)}
                      type="button"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Personal Study Notes</p>
                      <h2 className={cn("mt-1 font-heading text-3xl", isDark ? "text-white" : "text-slate-950")}>Note History</h2>
                    </div>
                  </div>
                  <button className="button-primary inline-flex items-center gap-2 !px-5 !py-3" onClick={openNewNote} type="button">
                    <FilePlus2 className="h-4 w-4" />
                    New Note
                  </button>
                </div>

                <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_minmax(0,1fr)]">
                  <aside className={cn("min-h-0 overflow-y-auto border-r p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                    <label className={cn("flex items-center gap-3 rounded-[24px] border px-4 py-3", isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-white")}>
                      <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
                      <input
                        className={cn("w-full bg-transparent text-sm outline-none", isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400")}
                        onChange={(event) => setNotesSearch(event.target.value)}
                        placeholder="Search notes..."
                        value={notesSearch}
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        { label: "All Notes", value: "all" },
                        { label: "Recently Edited", value: "recentlyEdited" },
                        { label: "Recently Created", value: "recentlyCreated" },
                        { label: "Favorites", value: "favorites" },
                        { label: "Drafts", value: "drafts" }
                      ].map((item) => (
                        <button
                          className={cn(
                            "rounded-full border px-3 py-2 text-xs font-medium transition",
                            historyFilter === item.value
                              ? "border-transparent bg-[linear-gradient(135deg,#ff6d4d_0%,#f97316_100%)] text-white"
                              : isDark
                                ? "border-slate-700 bg-slate-950 text-slate-300"
                                : "border-slate-200 bg-white text-slate-700"
                          )}
                          key={item.value}
                          onClick={() => setHistoryFilter(item.value as HistoryFilter)}
                          type="button"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-1">
                      <label className="space-y-2">
                        <span className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</span>
                        <select
                          className={cn("w-full rounded-2xl border px-3 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                          onChange={(event) => setSelectedSubjectFilter(event.target.value)}
                          value={selectedSubjectFilter}
                        >
                          <option value="">All subjects</option>
                          {uniqueSubjects.map((subject) => (
                            <option key={subject} value={subject}>
                              {subject}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Topic</span>
                        <select
                          className={cn("w-full rounded-2xl border px-3 py-3 text-sm outline-none", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                          onChange={(event) => setSelectedTopicFilter(event.target.value)}
                          value={selectedTopicFilter}
                        >
                          <option value="">All topics</option>
                          {uniqueTopics.map((topic) => (
                            <option key={topic} value={topic}>
                              {topic}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-5 space-y-3">
                      {filteredNotes.length ? (
                        filteredNotes.map((note) => (
                          <button
                            className={cn(
                              "w-full rounded-[24px] border px-4 py-4 text-left transition",
                              selectedNote?.id === note.id
                                ? isDark
                                  ? "border-orange-400/50 bg-slate-950 text-white"
                                  : "border-orange-300 bg-orange-50 text-slate-950"
                                : isDark
                                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            )}
                            key={note.id}
                            onClick={() => setSelectedNoteId(note.id)}
                            type="button"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{note.title}</p>
                                <p className={cn("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                                  {note.subjectName ?? "No subject"}
                                  {note.topicName ? ` · ${note.topicName}` : ""}
                                </p>
                              </div>
                              {note.isFavorite ? <Star className="h-4 w-4 fill-current text-amber-500" /> : null}
                            </div>
                            <div className={cn("mt-3 text-xs leading-6", isDark ? "text-slate-400" : "text-slate-500")}>
                              <p>Created: {formatDateTime(note.createdAt)}</p>
                              <p>Last Modified: {formatDateTime(note.updatedAt)}</p>
                              <p className="mt-2 line-clamp-2">{stripHtml(note.contentHtml) || "No preview available yet."}</p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className={cn("rounded-[24px] border px-4 py-6 text-sm", isDark ? "border-slate-800 bg-slate-950 text-slate-400" : "border-slate-200 bg-white text-slate-500")}>
                          No notes match the current search and filters.
                        </div>
                      )}
                    </div>
                  </aside>

                  <section className="min-h-0 overflow-y-auto p-6">
                    {selectedNote ? (
                      <div className="space-y-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Study note</p>
                            <h3 className={cn("mt-2 font-heading text-4xl", isDark ? "text-white" : "text-slate-950")}>{selectedNote.title}</h3>
                          </div>
                          <button
                            className={cn(
                              "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium",
                              selectedNote.isFavorite
                                ? isDark
                                  ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                                : isDark
                                  ? "border-slate-700 bg-slate-900 text-slate-200"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                            )}
                            onClick={() => favoriteNoteMutation.mutate(selectedNote)}
                            type="button"
                          >
                            <Star className={cn("h-4 w-4", selectedNote.isFavorite && "fill-current")} />
                            {selectedNote.isFavorite ? "Favorite" : "Add Favorite"}
                          </button>
                        </div>

                        <div className={cn("grid gap-4 rounded-[28px] border p-5 md:grid-cols-2 xl:grid-cols-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                          {[
                            { label: "Subject", value: selectedNote.subjectName ?? "Not set" },
                            { label: "Topic", value: selectedNote.topicName ?? "Not set" },
                            { label: "Created", value: formatDateTime(selectedNote.createdAt) },
                            { label: "Updated", value: formatDateTime(selectedNote.updatedAt) }
                          ].map((item) => (
                            <div key={item.label}>
                              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                              <p className={cn("mt-2 text-sm leading-7", isDark ? "text-slate-200" : "text-slate-700")}>{item.value}</p>
                            </div>
                          ))}
                        </div>

                        <div
                          className={cn("prose prose-sm max-w-none rounded-[28px] border p-6", isDark ? "prose-invert border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}
                          dangerouslySetInnerHTML={{ __html: selectedNote.contentHtml }}
                        />

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
                            onClick={() => openEdit(selectedNote)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-rose-500/20 bg-rose-500/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-700")}
                            onClick={() => deleteNoteMutation.mutate(selectedNote.id)}
                            type="button"
                          >
                            Delete
                          </button>
                          <button
                            className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
                            onClick={() => downloadNoteForPdf(selectedNote)}
                            type="button"
                          >
                            Print
                          </button>
                          <button
                            className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
                            onClick={() => downloadNoteForPdf(selectedNote)}
                            type="button"
                          >
                            Download PDF
                          </button>
                          <button
                            className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
                            onClick={() => duplicateNoteMutation.mutate(selectedNote)}
                            type="button"
                          >
                            Duplicate
                          </button>
                          <button
                            className={cn("rounded-2xl border px-4 py-3 text-sm font-medium opacity-60", isDark ? "border-slate-700 bg-slate-900 text-slate-400" : "border-slate-300 bg-white text-slate-500")}
                            disabled
                            type="button"
                          >
                            Share (future)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("rounded-[28px] border px-6 py-10 text-sm", isDark ? "border-slate-800 bg-slate-900 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500")}>
                        Select a note to view its full content.
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <div className={cn("fixed z-[135]", isCompactAdminReviewFab ? "bottom-5 right-5" : "bottom-6 right-6")} ref={menuRef}>
        {isMenuOpen ? (
          <div
            className={cn(
              "mb-3 w-[220px] rounded-[24px] border p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] transition",
              isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
            )}
          >
            <p className={cn("px-2 pb-2 text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Study Notes</p>
            <button
              className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm transition", isDark ? "text-slate-200 hover:bg-slate-900" : "text-slate-700 hover:bg-slate-50")}
              onClick={openNewNote}
              type="button"
            >
              <FilePlus2 className="h-4 w-4" />
              <span>New Note</span>
            </button>
            <button
              className={cn("mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm transition", isDark ? "text-slate-200 hover:bg-slate-900" : "text-slate-700 hover:bg-slate-50")}
              onClick={openHistory}
              type="button"
            >
              <History className="h-4 w-4" />
              <span>Note History</span>
            </button>
          </div>
        ) : null}

        <button
          aria-label="Open study notes"
          className={cn(
            "group inline-flex items-center rounded-full bg-[linear-gradient(135deg,#ff6d4d_0%,#f97316_100%)] text-sm font-semibold text-white shadow-[0_20px_50px_rgba(249,115,22,0.32)] transition hover:-translate-y-0.5 hover:brightness-105",
            isCompactAdminReviewFab ? "gap-0 px-3.5 py-3.5" : "gap-3 px-5 py-4"
          )}
          onClick={() => setIsMenuOpen((current) => !current)}
          type="button"
        >
          <NotebookPen className="h-5 w-5" />
          <span className={cn(isCompactAdminReviewFab ? "sr-only" : "")}>Study Notes</span>
        </button>
      </div>
    </>
  );
}
