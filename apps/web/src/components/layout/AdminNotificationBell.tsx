import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  approveAdminLibraryMaterial,
  approveAdminSubjectSummaryCase,
  approveAdminSubjectSummaryEntry,
  fetchAdminNotifications,
  markAdminNotificationsRead,
  type AdminNotificationItem
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

export function AdminNotificationBell({ isDark, isSuperAdminWorkspace }: { isDark: boolean; isSuperAdminWorkspace: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const notificationsQuery = useQuery({
    queryFn: fetchAdminNotifications,
    queryKey: queryKeys.adminNotifications,
    refetchInterval: 30_000
  });

  const markReadMutation = useMutation({
    mutationFn: markAdminNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications });
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (item: AdminNotificationItem) => {
      if (!item.resourceId) {
        throw new Error("Missing approval target.");
      }

      if (item.type === "library_material") {
        return approveAdminLibraryMaterial(item.resourceId);
      }

      if (item.type === "subject_summary_case") {
        return approveAdminSubjectSummaryCase(item.resourceId);
      }

      return approveAdminSubjectSummaryEntry(item.resourceId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminContentReview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications }),
        queryClient.invalidateQueries({ queryKey: ["admin-library"] }),
        queryClient.invalidateQueries({ queryKey: ["subject-summary-cases"] }),
        queryClient.invalidateQueries({ queryKey: ["subject-summary-module-admin-entries"] })
      ]);
    }
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!markReadMutation.isPending) {
      void markReadMutation.mutateAsync();
    }
  }, [isOpen, markReadMutation]);

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  function openNotification(item: AdminNotificationItem) {
    setIsOpen(false);
    navigate(item.actionPath);
  }

  async function handleApprove(item: AdminNotificationItem) {
    await approveMutation.mutateAsync(item);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        className={cn(
          "relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition",
          isDark ? "border-slate-700 bg-slate-900 text-white hover:border-slate-600" : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
        )}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#fe533d] px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+12px)] z-30 w-[380px] max-w-[80vw] rounded-[24px] border p-3 shadow-[0_24px_60px_rgba(15,23,42,0.16)]",
            isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <div>
              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Notifications</p>
              <p className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                {isSuperAdminWorkspace ? "Pending approvals and admin alerts" : "Approval updates and admin alerts"}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                isDark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
              )}
            >
              {unreadCount} new
            </span>
          </div>

          <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {notificationsQuery.isLoading ? (
              <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-slate-800 bg-slate-950 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500")}>
                Loading notifications...
              </div>
            ) : items.length ? (
              items.map((item) => (
                <div
                  className={cn(
                    "rounded-[20px] border p-4",
                    item.canApprove
                      ? isDark
                        ? "border-amber-500/20 bg-amber-500/10"
                        : "border-amber-200 bg-amber-50"
                      : isDark
                        ? "border-slate-800 bg-slate-950"
                        : "border-slate-200 bg-slate-50"
                  )}
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                      <p className={cn("mt-1 text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>{item.body}</p>
                    </div>
                    <span className={cn("text-[11px] uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>
                      {formatNotificationTime(item.createdAt)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        isDark ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      )}
                      onClick={() => openNotification(item)}
                      type="button"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </button>

                    {item.canApprove && isSuperAdminWorkspace ? (
                      <button
                        className="inline-flex items-center gap-2 rounded-full bg-[#fe533d] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                        disabled={approveMutation.isPending}
                        onClick={() => void handleApprove(item)}
                        type="button"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        {approveMutation.isPending && approveMutation.variables?.id === item.id ? "Approving..." : "Approve"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-slate-800 bg-slate-950 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500")}>
                No new notifications right now.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
