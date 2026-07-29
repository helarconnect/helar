import { useQuery } from "@tanstack/react-query";
import { BookOpenText, FileStack, FolderTree, LoaderCircle, Scale, Search, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { searchAdminPortal, searchLibrary, type AdminPortalSearchItem } from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function prettifyMaterialType(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function LibrarySearchControl({ audience = "admin" }: { audience?: "admin" | "student" }) {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const trimmedQuery = query.trim();
  const adminSearchQuery = useQuery({
    enabled: audience === "admin" && isOpen && trimmedQuery.length >= 2,
    queryFn: () => searchAdminPortal(trimmedQuery),
    queryKey: queryKeys.adminPortalSearch(trimmedQuery)
  });
  const studentSearchQuery = useQuery({
    enabled: audience === "student" && isOpen && trimmedQuery.length >= 2,
    queryFn: () => searchLibrary(trimmedQuery),
    queryKey: queryKeys.librarySearch(audience, trimmedQuery)
  });

  function handleClose() {
    setIsOpen(false);
    setQuery("");
  }

  function handleOpenPath(path: string, state?: { librarySearchItemId?: string; librarySearchQuery?: string; librarySearchScope?: "body" | "reportNumber" | "storageUrl" | "summary" | "title" }) {
    navigate(path, state ? { state } : undefined);
    handleClose();
  }

  function getAdminResultIcon(kind: AdminPortalSearchItem["kind"]) {
    switch (kind) {
      case "user":
        return UserRound;
      case "library_material":
        return BookOpenText;
      case "subject_summary_subject":
      case "subject_summary_topic":
        return FolderTree;
      case "subject_summary_case":
        return Scale;
      case "subject_summary_entry":
        return FileStack;
    }
  }

  return (
    <>
      <button
        aria-label={audience === "admin" ? "Search workspace" : "Search library"}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
          isDark
            ? "border-slate-700 bg-slate-900 text-white hover:border-slate-600"
            : "border-slate-200 bg-white text-slate-950 hover:border-slate-300"
        )}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Search className="h-4 w-4" />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[140] flex items-start justify-center bg-slate-950/60 p-4 pt-20 backdrop-blur-sm" onClick={handleClose}>
              <div
                className={cn(
                  "w-full max-w-3xl overflow-hidden rounded-[30px] border shadow-[0_40px_140px_rgba(15,23,42,0.26)]",
                  isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
                )}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={cn("flex items-center justify-between border-b px-5 py-4", isDark ? "border-slate-800" : "border-slate-200")}>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>
                      {audience === "admin" ? "Workspace search" : "Library search"}
                    </p>
                    <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>
                      {audience === "admin" ? "Search users and content" : "Search all library items"}
                    </h3>
                  </div>
                  <button
                    aria-label="Close library search"
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-full border transition",
                      isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
                    )}
                    onClick={handleClose}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-5">
                  <label
                    className={cn(
                      "flex items-center gap-3 rounded-[24px] border px-4 py-4",
                      isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"
                    )}
                  >
                    <Search className={cn("h-5 w-5", isDark ? "text-slate-500" : "text-slate-400")} />
                    <input
                      autoFocus
                      className={cn(
                        "w-full bg-transparent text-base outline-none",
                        isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400"
                      )}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={
                        audience === "admin"
                          ? "Search users, library items, subjects, topics, cases, and revision guides"
                          : "Search law reports, subject summaries, cases and ratios"
                      }
                      type="text"
                      value={query}
                    />
                  </label>

                  <div className="mt-5 max-h-[60vh] overflow-y-auto pr-1">
                    {trimmedQuery.length < 2 ? (
                      <div
                        className={cn(
                          "rounded-[24px] border px-5 py-6 text-sm leading-7",
                          isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                        )}
                      >
                        {audience === "admin"
                          ? "Type at least two characters to search users, library items, subjects, topics, cases, and revision guides."
                          : "Type at least two characters to search across all library items."}
                      </div>
                    ) : audience === "admin" && adminSearchQuery.isLoading ? (
                      <div className="flex items-center gap-3 px-2 py-6">
                        <LoaderCircle className={cn("h-5 w-5 animate-spin", isDark ? "text-slate-400" : "text-slate-500")} />
                        <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}>Searching the workspace...</p>
                      </div>
                    ) : audience === "student" && studentSearchQuery.isLoading ? (
                      <div className="flex items-center gap-3 px-2 py-6">
                        <LoaderCircle className={cn("h-5 w-5 animate-spin", isDark ? "text-slate-400" : "text-slate-500")} />
                        <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}>Searching the library...</p>
                      </div>
                    ) : audience === "admin" && adminSearchQuery.data?.groups.length ? (
                      <div className="space-y-5">
                        {adminSearchQuery.data.groups.map((group) => (
                          <section className="space-y-3" key={group.key}>
                            <div className="flex items-center justify-between gap-3 px-1">
                              <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{group.label}</p>
                              <span className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{group.items.length} result(s)</span>
                            </div>

                            <div className="space-y-3">
                              {group.items.map((result) => {
                                const ResultIcon = getAdminResultIcon(result.kind);

                                return (
                                  <button
                                    className={cn(
                                      "w-full rounded-[24px] border px-5 py-4 text-left transition",
                                      isDark
                                        ? "border-slate-800 bg-slate-900 hover:border-slate-700"
                                        : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                                    )}
                                    key={`${group.key}-${result.id}`}
                                    onClick={() => handleOpenPath(result.path)}
                                    type="button"
                                  >
                                    <div className="flex items-start gap-4">
                                      <span
                                        className={cn(
                                          "inline-flex h-11 w-11 flex-none items-center justify-center rounded-2xl border",
                                          isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-white text-slate-600"
                                        )}
                                      >
                                        <ResultIcon className="h-5 w-5" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className={cn("text-base font-semibold leading-7", isDark ? "text-white" : "text-slate-950")}>{result.title}</p>
                                          {result.badge ? (
                                            <span
                                              className={cn(
                                                "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
                                                isDark ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-200 bg-white text-slate-500"
                                              )}
                                            >
                                              {result.badge}
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{result.subtitle}</p>
                                        <p className={cn("mt-2 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>{result.snippet}</p>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : audience === "student" && studentSearchQuery.data?.length ? (
                      <div className="space-y-3">
                        {studentSearchQuery.data.map((result) => (
                          <button
                            className={cn(
                              "w-full rounded-[24px] border px-5 py-4 text-left transition",
                              isDark
                                ? "border-slate-800 bg-slate-900 hover:border-slate-700"
                                : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                            )}
                            key={`${result.section}-${result.id}`}
                            onClick={() =>
                              handleOpenPath(result.path, {
                                librarySearchItemId: result.id,
                                librarySearchQuery: trimmedQuery,
                                librarySearchScope: result.matchedIn
                              })
                            }
                            type="button"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={cn(
                                      "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
                                      isDark ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-200 bg-white text-slate-500"
                                    )}
                                  >
                                    {result.sectionLabel}
                                  </span>
                                  {result.reportNumber ? (
                                    <span
                                      className={cn(
                                        "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
                                        isDark ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-200 bg-white text-slate-500"
                                      )}
                                    >
                                      {result.reportNumber}
                                    </span>
                                  ) : null}
                                </div>
                                <p className={cn("mt-3 text-base font-semibold leading-7", isDark ? "text-white" : "text-slate-950")}>{result.title}</p>
                                <p className={cn("mt-2 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>{result.snippet}</p>
                              </div>
                              <div className={cn("flex items-center gap-2 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                                <BookOpenText className="h-4 w-4" />
                                <span>{prettifyMaterialType(result.materialType)}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : audience === "admin" && adminSearchQuery.isError ? (
                      <div
                        className={cn(
                          "rounded-[24px] border px-5 py-6 text-sm leading-7",
                          isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                        )}
                      >
                        The workspace search could not be completed right now. Please try again.
                      </div>
                    ) : audience === "student" && studentSearchQuery.isError ? (
                      <div
                        className={cn(
                          "rounded-[24px] border px-5 py-6 text-sm leading-7",
                          isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                        )}
                      >
                        The library search could not be completed right now. Please try again.
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "rounded-[24px] border px-5 py-6 text-sm leading-7",
                          isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                        )}
                      >
                        {audience === "admin" ? "No workspace records matched your search." : "No library items matched your search."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
