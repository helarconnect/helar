import { AxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Download,
  Eye,
  FileJson,
  Info,
  LockKeyhole,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  createAdminUser,
  type AdminCreateUserInput,
  type AdminMonthlyRegistrations,
  type AdminUserDeviceLimitInput,
  type AdminUserDetail,
  type AdminUserListFilters,
  type AdminUserPasswordInput,
  type AdminUserProfileInput,
  type AdminUserSummary,
  type AdminUserStatus,
  fetchAdminMonthlyRegistrations,
  fetchAdminUserDetail,
  fetchAdminUsersForExport,
  fetchAdminUsers,
  resetAdminUserDevices,
  updateAdminUserDeviceLimit,
  updateAdminUserPassword,
  updateAdminUserProfile,
  updateAdminUserRoles,
  updateAdminUserStatus
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const defaultFilters: Required<AdminUserListFilters> = {
  page: 1,
  pageSize: 12,
  registeredFrom: "",
  registeredTo: "",
  role: "all",
  search: "",
  sortBy: "createdAt",
  sortOrder: "desc",
  status: "all"
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function prettifyEnum(value?: string | null) {
  if (!value) {
    return "Not available";
  }

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

function downloadUserJson(user: AdminUserDetail) {
  const blob = new Blob([JSON.stringify(user, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  downloadBlob(blob, `${user.fullName.toLowerCase().replace(/\s+/g, "-")}-record.json`);
}

function CompactField({
  isDark,
  label,
  value
}: {
  isDark: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("rounded-[18px] border px-3 py-3", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
      <p className={cn("text-[11px] uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{label}</p>
      <p className={cn("mt-1 text-sm font-medium leading-5", isDark ? "text-white" : "text-slate-950")}>{value}</p>
    </div>
  );
}

function buildUserExportRows(users: AdminUserSummary[]) {
  return users.map((user) => ({
    fullName: user.fullName,
    email: user.email,
    role: user.roles.map((role) => role.name).join(", ") || user.primaryRole,
    status: prettifyEnum(user.status),
    phoneNumber: user.phoneNumber || "",
    registeredAt: formatDateOnly(user.createdAt),
    location: [user.city, user.state, user.country].filter(Boolean).join(", "),
    plan: user.subscriptionPlan || "No active plan"
  }));
}

function downloadUsersAsExcel(users: AdminUserSummary[]) {
  const rows = buildUserExportRows(users);
  const header = ["Full name", "Email", "Role", "Status", "Phone number", "Registered", "Location", "Plan"];
  const body = rows
    .map((row) => [row.fullName, row.email, row.role, row.status, row.phoneNumber, row.registeredAt, row.location, row.plan])
    .map((columns) => `<tr>${columns.map((value) => `<td>${value || ""}</td>`).join("")}</tr>`)
    .join("");
  const tableHtml = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table border="1">
          <thead><tr>${header.map((item) => `<th>${item}</th>`).join("")}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>
  `;
  const blob = new Blob([tableHtml], { type: "application/vnd.ms-excel;charset=utf-8" });

  downloadBlob(blob, `helar-users-${new Date().toISOString().slice(0, 10)}.xls`);
}

function saveUsersAsPdf(users: AdminUserSummary[]) {
  const exportRows = buildUserExportRows(users);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");

  if (!printWindow) {
    return false;
  }

  const tableRows = exportRows
    .map(
      (row) => `
        <tr>
          <td>${row.fullName}</td>
          <td>${row.email}</td>
          <td>${row.role}</td>
          <td>${row.status}</td>
          <td>${row.phoneNumber || "-"}</td>
          <td>${row.registeredAt}</td>
          <td>${row.location || "-"}</td>
          <td>${row.plan}</td>
        </tr>
      `
    )
    .join("");

  printWindow.document.write(`
    <html>
      <head>
        <title>Helar Users Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
          h1 { margin-bottom: 6px; }
          p { color: #475569; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 12px; }
          th { background: #e2e8f0; }
        </style>
      </head>
      <body>
        <h1>Helar Registered Users</h1>
        <p>Generated on ${formatDateTime(new Date().toISOString())}</p>
        <table>
          <thead>
            <tr>
              <th>Full name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Phone number</th>
              <th>Registered</th>
              <th>Location</th>
              <th>Plan</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}

function statusTone(status: string) {
  if (status === "ACTIVE") {
    return "green";
  }

  if (status === "PENDING") {
    return "amber";
  }

  if (status === "SUSPENDED") {
    return "red";
  }

  return "slate";
}

function StatusPill({
  children,
  isDark,
  tone
}: {
  children: ReactNode;
  isDark: boolean;
  tone: "amber" | "green" | "red" | "slate";
}) {
  const classes = {
    amber: isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-700",
    green: isDark ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: isDark ? "border-rose-500/25 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700",
    slate: isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-slate-100 text-slate-700"
  } as const;

  return <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", classes[tone])}>{children}</span>;
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
  if (!toasts.length) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

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
              <Info className="h-4 w-4" />
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
  if (typeof document === "undefined") {
    return null;
  }

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
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Full user info</p>
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
            className={cn(
              "border-t px-5 py-4 lg:px-6",
              isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
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

function CurrentYearMonthlyBarChart({
  data,
  isDark,
  onYearChange,
  yearOptions,
  year
}: {
  data?: AdminMonthlyRegistrations;
  isDark: boolean;
  onYearChange: (year: number) => void;
  yearOptions: number[];
  year: number;
}) {
  const monthlyData =
    data?.months ??
    Array.from({ length: 12 }, (_, monthIndex) => ({
      month: monthIndex + 1,
      count: 0,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, monthIndex, 1))
    }));
  const maxCount = Math.max(...monthlyData.map((item) => item.count), 1);
  const totalCount = data?.totalRegistrations ?? monthlyData.reduce((sum, item) => sum + item.count, 0);
  const hasYearOptions = yearOptions.length > 0;

  return (
    <div className="rounded-[28px] border border-white/12 bg-white/5 p-5 backdrop-blur-sm lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/45">Yearly registration view</p>
          <h3 className="mt-2 font-heading text-2xl text-white">Monthly user sign-ups in {year}</h3>
        </div>
        <div className="flex items-end gap-4">
          {hasYearOptions ? (
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-white/45">Year</span>
              <select
                className={cn(
                  "mt-2 min-w-[118px] rounded-2xl border px-4 py-3 text-sm outline-none transition",
                  isDark ? "border-white/12 bg-white/8 text-white" : "border-slate-200 bg-white text-slate-900"
                )}
                onChange={(event) => onYearChange(Number(event.target.value))}
                value={year}
              >
                {yearOptions.map((yearOption) => (
                  <option className="text-slate-950" key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Total registered</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {totalCount === 0 ? (
          <EmptyState isDark={isDark} message={`No users have been registered in ${year} yet.`} />
        ) : (
          <div className="grid grid-cols-12 items-end gap-3">
            {monthlyData.map((item) => (
              <div className="flex min-h-[220px] flex-col justify-end" key={item.label}>
                <div className="flex h-[180px] items-end justify-center">
                  <div className="flex w-full flex-col items-center gap-3">
                    <span className="text-xs font-medium text-white/72">{item.count}</span>
                    <div className="flex h-[144px] w-full items-end rounded-full bg-white/6 px-1.5 py-1">
                      <div
                        className="w-full rounded-full bg-[linear-gradient(180deg,rgba(255,122,89,1)_0%,rgba(255,92,69,0.88)_100%)] shadow-[0_10px_30px_rgba(255,92,69,0.28)]"
                        style={{
                          height: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
                <span className="mt-4 text-center text-xs uppercase tracking-[0.16em] text-white/50">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminUsersWorkspace() {
  const { isDark } = useTheme();
  const authSession = useAuthStore((state) => state.session);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentYear = new Date().getFullYear();
  const isSuperAdmin = authSession?.user.roleCodes.includes("super_admin") ?? false;
  const isContentAdmin = authSession?.user.roleCodes.includes("content_admin") ?? false;
  const canCreateUsers =
    isSuperAdmin || isContentAdmin;
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedChartYear, setSelectedChartYear] = useState(currentYear);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeExport, setActiveExport] = useState<"excel" | "pdf" | null>(null);
  const [editableRoleCodes, setEditableRoleCodes] = useState<string[]>([]);
  const [createUserDraft, setCreateUserDraft] = useState<AdminCreateUserInput>({
    fullName: "",
    email: "",
    password: "",
    roleCodes: ["student"],
    phoneNumber: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: ""
  });
  const [profileDraft, setProfileDraft] = useState<AdminUserProfileInput>({
    fullName: "",
    email: "",
    phoneNumber: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: ""
  });
  const [passwordDraft, setPasswordDraft] = useState({
    confirmPassword: "",
    password: ""
  });
  const [deviceLimitOverrideDraft, setDeviceLimitOverrideDraft] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: "success" | "error" }>>([]);

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

  const usersQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken),
    queryKey: queryKeys.adminUsers(filters),
    queryFn: () => fetchAdminUsers(filters),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true
  });

  const selectedUserQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken) && Boolean(selectedUserId) && isDrawerOpen,
    queryKey: queryKeys.adminUserDetail(selectedUserId || "none"),
    queryFn: () => fetchAdminUserDetail(selectedUserId)
  });

  const monthlyRegistrationsQuery = useQuery({
    enabled: hasHydrated && Boolean(authSession?.accessToken),
    queryKey: queryKeys.adminMonthlyRegistrations(selectedChartYear),
    queryFn: () => fetchAdminMonthlyRegistrations(selectedChartYear),
    staleTime: 1000 * 60 * 5
  });

  useEffect(() => {
    setEditableRoleCodes(selectedUserQuery.data?.roles.map((role) => role.code) ?? []);
  }, [selectedUserQuery.data]);

  useEffect(() => {
    if (!selectedUserQuery.data) {
      return;
    }

    setProfileDraft({
      fullName: selectedUserQuery.data.fullName,
      email: selectedUserQuery.data.email,
      phoneNumber: selectedUserQuery.data.phoneNumber ?? "",
      addressLine1: selectedUserQuery.data.address.addressLine1 ?? "",
      addressLine2: selectedUserQuery.data.address.addressLine2 ?? "",
      city: selectedUserQuery.data.address.city ?? "",
      state: selectedUserQuery.data.address.state ?? "",
      postalCode: selectedUserQuery.data.address.postalCode ?? "",
      country: selectedUserQuery.data.address.country ?? ""
    });
    setPasswordDraft({
      confirmPassword: "",
      password: ""
    });
    setDeviceLimitOverrideDraft(
      selectedUserQuery.data.deviceLimitOverride === null ? "" : String(selectedUserQuery.data.deviceLimitOverride)
    );
  }, [selectedUserQuery.data]);

  useEffect(() => {
    const incomingSearch = searchParams.get("search") ?? "";

    setFilters((current) => {
      if (current.search === incomingSearch) {
        return current;
      }

      return {
        ...current,
        page: 1,
        search: incomingSearch
      };
    });
  }, [searchParams]);

  useEffect(() => {
    const openUserId = searchParams.get("openUserId");

    if (!openUserId) {
      return;
    }

    setSelectedUserId(openUserId);
    setIsDrawerOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("openUserId");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: AdminUserStatus }) => updateAdminUserStatus(userId, status),
    onSuccess: (updatedUser) => {
      showToast(`Updated ${updatedUser.fullName}'s status to ${prettifyEnum(updatedUser.status)}.`, "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers(filters) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(updatedUser.id) });
    },
    onError: () => {
      showToast("Could not update the user status right now.", "error");
    }
  });

  const rolesMutation = useMutation({
    mutationFn: ({ userId, roleCodes }: { userId: string; roleCodes: string[] }) => updateAdminUserRoles(userId, roleCodes),
    onSuccess: (updatedUser) => {
      setEditableRoleCodes(updatedUser.roles.map((role) => role.code));
      showToast(`Updated roles for ${updatedUser.fullName}.`, "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers(filters) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(updatedUser.id) });
    },
    onError: () => {
      showToast("Could not update the user roles right now.", "error");
    }
  });

  const profileMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: AdminUserProfileInput }) => updateAdminUserProfile(userId, payload),
    onSuccess: (updatedUser) => {
      showToast(`Updated ${updatedUser.fullName}'s profile.`, "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers(filters) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(updatedUser.id) });
    },
    onError: () => {
      showToast("Could not update the user profile right now.", "error");
    }
  });

  const passwordMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: AdminUserPasswordInput }) => updateAdminUserPassword(userId, payload),
    onSuccess: (updatedUser) => {
      setPasswordDraft({
        confirmPassword: "",
        password: ""
      });
      showToast(`Updated ${updatedUser.fullName}'s password successfully.`, "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(updatedUser.id) });
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not update the user password right now."
          : "Could not update the user password right now.";

      showToast(errorMessage, "error");
    }
  });

  const deviceLimitMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: AdminUserDeviceLimitInput }) =>
      updateAdminUserDeviceLimit(userId, payload),
    onSuccess: (updatedUser) => {
      setDeviceLimitOverrideDraft(updatedUser.deviceLimitOverride === null ? "" : String(updatedUser.deviceLimitOverride));
      showToast(`Updated ${updatedUser.fullName}'s device limit to ${updatedUser.deviceLimit}.`, "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(updatedUser.id) });
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not update the device limit right now."
          : "Could not update the device limit right now.";
      showToast(errorMessage, "error");
    }
  });

  const resetDevicesMutation = useMutation({
    mutationFn: (userId: string) => resetAdminUserDevices(userId),
    onSuccess: (updatedUser) => {
      showToast(`Reset devices and signed out ${updatedUser.fullName}.`, "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(updatedUser.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers(filters) });
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not reset the user devices right now."
          : "Could not reset the user devices right now.";
      showToast(errorMessage, "error");
    }
  });

  const createUserMutation = useMutation({
    mutationFn: (payload: AdminCreateUserInput) => createAdminUser(payload),
    onSuccess: async (createdUser) => {
      showToast(`Created ${createdUser.fullName} with login details successfully.`, "success", { durationMs: 6500 });
      setIsCreateModalOpen(false);
      setCreateUserDraft({
        fullName: "",
        email: "",
        password: "",
        roleCodes: ["student"],
        phoneNumber: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        country: ""
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers(filters) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminMonthlyRegistrations(selectedChartYear) })
      ]);
      setSelectedUserId(createdUser.id);
      setIsDrawerOpen(true);
    },
    onError: (error) => {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not create the user right now. Check the email, password, and selected roles."
          : "Could not create the user right now. Check the email, password, and selected roles.";

      window.setTimeout(() => {
        showToast(errorMessage, "error", { durationMs: 8000 });
      }, 40);
    }
  });

  useEffect(() => {
    if (!monthlyRegistrationsQuery.data) {
      return;
    }

    if (selectedChartYear !== monthlyRegistrationsQuery.data.year) {
      setSelectedChartYear(monthlyRegistrationsQuery.data.year);
    }
  }, [monthlyRegistrationsQuery.data, selectedChartYear]);
  useEffect(() => {
    if (!isDrawerOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerOpen]);

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({
      ...current,
      ...patch,
      page:
        patch.page ??
        (patch.pageSize ||
        patch.registeredFrom !== undefined ||
        patch.registeredTo !== undefined ||
        patch.role ||
        patch.search !== undefined ||
        patch.sortBy ||
        patch.sortOrder ||
        patch.status
          ? 1
          : current.page)
    }));
  }

  function handleQuickStatusChange(userId: string, status: AdminUserStatus) {
    statusMutation.mutate({ userId, status });
  }

  function handleOpenDrawer(userId: string) {
    setSelectedUserId(userId);
    setIsDrawerOpen(true);
  }

  function toggleEditableRole(roleCode: string) {
    setEditableRoleCodes((current) =>
      current.includes(roleCode) ? current.filter((item) => item !== roleCode) : [...current, roleCode]
    );
  }

  function handleProfileDraftChange(field: keyof AdminUserProfileInput, value: string) {
    setProfileDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateCreateUserDraft(field: keyof AdminCreateUserInput, value: string) {
    setCreateUserDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  function toggleCreateRole(roleCode: string) {
    setCreateUserDraft((current) => ({
      ...current,
      roleCodes: isSuperAdmin
        ? current.roleCodes.includes(roleCode)
          ? current.roleCodes.filter((item) => item !== roleCode)
          : [...current.roleCodes, roleCode]
        : [roleCode]
    }));
  }

  function handlePasswordDraftChange(field: "password" | "confirmPassword", value: string) {
    setPasswordDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  function buildDeviceLimitPayload(): AdminUserDeviceLimitInput | null {
    const trimmedValue = deviceLimitOverrideDraft.trim();

    if (!trimmedValue) {
      return {
        deviceLimitOverride: null
      };
    }

    const parsedValue = Number(trimmedValue);

    if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue)) {
      showToast("Enter a whole number for the device limit override.", "error");
      return null;
    }

    if (parsedValue < 1 || parsedValue > 20) {
      showToast("Device limit override must be between 1 and 20.", "error");
      return null;
    }

    return {
      deviceLimitOverride: parsedValue
    };
  }

  function handleSaveDeviceLimit() {
    if (!selectedUserQuery.data) {
      return;
    }

    const payload = buildDeviceLimitPayload();
    if (!payload) {
      return;
    }

    deviceLimitMutation.mutate({
      userId: selectedUserQuery.data.id,
      payload
    });
  }

  function handleClearDeviceLimitOverride() {
    setDeviceLimitOverrideDraft("");
    if (!selectedUserQuery.data) {
      return;
    }

    deviceLimitMutation.mutate({
      userId: selectedUserQuery.data.id,
      payload: { deviceLimitOverride: null }
    });
  }

  function handleResetDevices() {
    if (!selectedUserQuery.data) {
      return;
    }

    const confirmed = window.confirm(`Reset devices for ${selectedUserQuery.data.fullName}? This will sign them out everywhere.`);
    if (!confirmed) {
      return;
    }

    resetDevicesMutation.mutate(selectedUserQuery.data.id);
  }

  async function handleCreateUser() {
    if (!canCreateUsers) {
      showToast("Only super admins and content admins can create users from this workspace.", "error");
      return;
    }

    if (createUserDraft.roleCodes.length === 0) {
      showToast("Select at least one role before creating a user.", "error");
      return;
    }

    try {
      await createUserMutation.mutateAsync({
        ...createUserDraft,
        fullName: createUserDraft.fullName.trim(),
        email: createUserDraft.email.trim().toLowerCase(),
        password: createUserDraft.password,
        roleCodes: createUserDraft.roleCodes,
        phoneNumber: createUserDraft.phoneNumber?.trim(),
        addressLine1: createUserDraft.addressLine1?.trim(),
        addressLine2: createUserDraft.addressLine2?.trim(),
        city: createUserDraft.city?.trim(),
        state: createUserDraft.state?.trim(),
        postalCode: createUserDraft.postalCode?.trim(),
        country: createUserDraft.country?.trim()
      });
    } catch {
      return;
    }
  }

  async function handleSaveModalChanges() {
    if (!selectedUserId) {
      return;
    }

    if (!isSuperAdmin) {
      return;
    }

    if (editableRoleCodes.length === 0) {
      showToast("Select at least one role before saving.", "error");
      return;
    }

    try {
      if (isSuperAdmin) {
        await profileMutation.mutateAsync({
          userId: selectedUserId,
          payload: profileDraft
        });
      }

      await rolesMutation.mutateAsync({
        userId: selectedUserId,
        roleCodes: editableRoleCodes
      });

      showToast("Saved user changes successfully.", "success");
    } catch {
      showToast("Could not save the user changes right now.", "error");
    }
  }

  async function handlePasswordUpdate() {
    if (!selectedUserId || !selectedUserQuery.data) {
      return;
    }

    if (passwordDraft.password.trim().length < 8) {
      showToast("Enter a password with at least 8 characters.", "error");
      return;
    }

    if (passwordDraft.password !== passwordDraft.confirmPassword) {
      showToast("The password confirmation does not match.", "error");
      return;
    }

    try {
      await passwordMutation.mutateAsync({
        userId: selectedUserId,
        payload: {
          password: passwordDraft.password
        }
      });
    } catch {
      return;
    }
  }

  async function handleExportUsers(format: "excel" | "pdf") {
    try {
      setActiveExport(format);
      const exportUsers = await fetchAdminUsersForExport(filters);

      if (!exportUsers.length) {
        showToast("There are no users in the current result set to export.", "error");
        return;
      }

      if (format === "excel") {
        downloadUsersAsExcel(exportUsers);
        showToast("Saved the filtered user list as an Excel file.", "success");
        return;
      }

      if (saveUsersAsPdf(exportUsers)) {
        showToast("Opened the filtered users report. Choose Save as PDF in the print dialog.", "success");
        return;
      }

      showToast("The PDF window was blocked by the browser. Allow pop-ups and try again.", "error");
    } catch {
      showToast("Could not export the filtered user list right now.", "error");
    } finally {
      setActiveExport(null);
    }
  }

  const totalRegisteredUsersValue = usersQuery.data?.globalSummary.totalUsers.toLocaleString() ?? "0";
  const totalUsersValue = usersQuery.data?.summary.totalUsers.toLocaleString() ?? "0";
  const activeUsersValue = usersQuery.data?.summary.activeUsers.toLocaleString() ?? "0";
  const verifiedUsersValue = usersQuery.data?.summary.verifiedUsers.toLocaleString() ?? "0";
  const registrationWindowValue = usersQuery.data?.summary.registrationsInWindow.toLocaleString() ?? "0";
  const selectedUserRoleCodes = selectedUserQuery.data?.roles.map((role) => role.code) ?? [];
  const canUpdateSelectedUserPassword =
    Boolean(selectedUserQuery.data) &&
    (isSuperAdmin || (isContentAdmin && selectedUserRoleCodes.length > 0 && selectedUserRoleCodes.every((roleCode) => roleCode === "student")));
  const visibleCreateRoles = isSuperAdmin
    ? usersQuery.data?.availableRoles ?? []
    : (usersQuery.data?.availableRoles ?? []).filter((role) => role.code === "student");

  return (
    <>
      <ToastViewport isDark={isDark} onDismiss={dismissToast} toasts={toasts} />
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#25112b_0%,#0f1f4d_55%,#112a5b_100%)] p-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.24)] lg:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Admin users</p>
          <div className="mt-6">
            {!hasHydrated || (!authSession?.accessToken && !monthlyRegistrationsQuery.data) ? (
              <div className="rounded-[28px] border border-white/12 bg-white/5 p-5 lg:p-6">
                <div className="grid gap-3">
                  <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
                  <div className="h-40 animate-pulse rounded-[24px] bg-white/6" />
                </div>
              </div>
            ) : monthlyRegistrationsQuery.isError ? (
              <div className="rounded-[28px] border border-white/12 bg-white/5 p-5 lg:p-6">
                <EmptyState isDark={isDark} message={`Could not load the registration chart for ${selectedChartYear} right now.`} />
              </div>
            ) : (
              <CurrentYearMonthlyBarChart
                data={monthlyRegistrationsQuery.data}
                isDark={isDark}
                onYearChange={setSelectedChartYear}
                year={selectedChartYear}
                yearOptions={monthlyRegistrationsQuery.data?.availableYears ?? []}
              />
            )}
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric isDark={isDark} label="Total registered users" value={totalRegisteredUsersValue} />
          <MiniMetric isDark={isDark} label="Active accounts" value={activeUsersValue} />
          <MiniMetric isDark={isDark} label="Verified email" value={verifiedUsersValue} />
          <MiniMetric isDark={isDark} label="Registrations" value={registrationWindowValue} />
        </div>

        <Surface className="p-5 lg:p-6" isDark={isDark}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Quick search</p>
              <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>User management table</h3>
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
                  placeholder="Search by name, email, phone, address, status..."
                  type="text"
                  value={filters.search}
                />
              </div>

              <StatusPill isDark={isDark} tone="slate">
                {prettifyEnum(filters.status === "all" ? "all statuses" : filters.status)}
              </StatusPill>

              <ToolbarButton isDark={isDark} onClick={() => void usersQuery.refetch()}>
                <RefreshCw className={cn("h-4 w-4", usersQuery.isFetching && "animate-spin")} />
                Refresh
              </ToolbarButton>

              <ToolbarButton
                disabled={!usersQuery.data?.pagination.totalItems || activeExport !== null}
                isDark={isDark}
                onClick={() => void handleExportUsers("excel")}
              >
                <Download className="h-4 w-4" />
                {activeExport === "excel" ? "Preparing..." : "Save Excel"}
              </ToolbarButton>

              <ToolbarButton
                disabled={!usersQuery.data?.pagination.totalItems || activeExport !== null}
                isDark={isDark}
                onClick={() => void handleExportUsers("pdf")}
              >
                <Download className="h-4 w-4" />
                {activeExport === "pdf" ? "Preparing..." : "Save PDF"}
              </ToolbarButton>

              {canCreateUsers ? (
                <button className="button-primary !px-4 !py-3" onClick={() => setIsCreateModalOpen(true)} type="button">
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create user
                  </span>
                </button>
              ) : null}
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
              <EmptyState isDark={isDark} message="Sign in as an administrator to load the user management table." />
            ) : usersQuery.isLoading ? (
              <div className="grid gap-3">
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
                <div className={cn("h-16 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              </div>
            ) : usersQuery.isError ? (
              <EmptyState isDark={isDark} message="Could not load the admin users workspace. Refresh the page or sign in again to restore the admin session." />
            ) : usersQuery.data?.users.length ? (
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr className={cn("text-left text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    <th className="pb-4 pr-4 font-medium">User</th>
                    <th className="pb-4 pr-4 font-medium">Role</th>
                    <th className="pb-4 pr-4 font-medium">Status</th>
                    <th className="pb-4 pr-4 font-medium">Registered</th>
                    <th className="pb-4 pr-4 font-medium">Location</th>
                    <th className="pb-4 pr-4 font-medium">Plan</th>
                    <th className="pb-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {usersQuery.data.users.map((user) => (
                    <tr
                      className={cn(
                        "cursor-pointer transition",
                        isDark ? "hover:bg-slate-900/70" : "hover:bg-slate-50"
                      )}
                      key={user.id}
                      onClick={() => handleOpenDrawer(user.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenDrawer(user.id);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="py-4 pr-4 align-top">
                        <div>
                          <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{user.fullName}</p>
                          <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{user.email}</p>
                          <p className={cn("mt-1 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                            {user.phoneNumber || "No phone number"}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          {(user.roles.length ? user.roles : [{ code: "unassigned", name: user.primaryRole }]).slice(0, 2).map((role) => (
                            <StatusPill isDark={isDark} key={role.code} tone="slate">
                              {role.name}
                            </StatusPill>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <div className="space-y-2">
                          <StatusPill isDark={isDark} tone={statusTone(user.status)}>
                            {prettifyEnum(user.status)}
                          </StatusPill>
                          <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                            {user.emailVerifiedAt ? "Verified email" : "Unverified email"}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{formatDateOnly(user.createdAt)}</p>
                        <p className={cn("mt-1 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>Last active {formatDateOnly(user.lastActiveAt)}</p>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>
                          {[user.city, user.state, user.country].filter(Boolean).join(", ") || "Not available"}
                        </p>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className={cn("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{user.subscriptionPlan || "No active plan"}</p>
                        <p className={cn("mt-1 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{prettifyEnum(user.subscriptionStatus)}</p>
                      </td>
                      <td className="py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          <IconActionButton
                            isDark={isDark}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenDrawer(user.id);
                            }}
                            title="View user info"
                          >
                            <Eye className="h-4 w-4" />
                          </IconActionButton>
                          {user.status === "SUSPENDED" ? (
                            <IconActionButton
                              disabled={statusMutation.isPending}
                              isDark={isDark}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleQuickStatusChange(user.id, "ACTIVE");
                              }}
                              title="Activate user"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </IconActionButton>
                          ) : (
                            <IconActionButton
                              className={isDark ? "text-rose-200" : "text-rose-600"}
                              disabled={statusMutation.isPending}
                              isDark={isDark}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleQuickStatusChange(user.id, "SUSPENDED");
                              }}
                              title="Suspend user"
                            >
                              <Ban className="h-4 w-4" />
                            </IconActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState isDark={isDark} message="No users matched the current filters. Try widening the date range or clearing the search." />
            )}
          </div>

          {usersQuery.data?.users.length ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className={cn("space-y-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                <p>
                  Page {usersQuery.data.pagination.page} of {usersQuery.data.pagination.totalPages}
                </p>
                <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-500")}>
                  {(() => {
                    const page = usersQuery.data.pagination.page;
                    const pageSize = usersQuery.data.pagination.pageSize;
                    const matchedTotal = usersQuery.data.pagination.totalItems;
                    const currentCount = usersQuery.data.users.length;
                    const start = matchedTotal === 0 ? 0 : (page - 1) * pageSize + 1;
                    const end = matchedTotal === 0 ? 0 : (page - 1) * pageSize + currentCount;
                    return `Showing ${start}-${end} of ${matchedTotal.toLocaleString()} matched users • ${totalRegisteredUsersValue} total registered`;
                  })()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {filters.page > 1 ? (
                  <button
                    className="button-secondary !px-4 !py-3"
                    onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
                    type="button"
                  >
                    Previous
                  </button>
                ) : null}
                {filters.page < (usersQuery.data?.pagination.totalPages ?? 1) ? (
                  <button
                    className="button-primary !px-4 !py-3"
                    onClick={() =>
                      updateFilters({ page: Math.min(usersQuery.data?.pagination.totalPages ?? 1, filters.page + 1) })
                    }
                    type="button"
                  >
                    Next
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Surface>

      </div>

      {isDrawerOpen ? (
        <RightAlignedDrawer
          footer={
            selectedUserQuery.data && isSuperAdmin ? (
              <div className="flex items-center justify-between gap-4">
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                  User changes are ready to save.
                </p>
                <button
                  className="button-primary min-w-[180px] !px-5 !py-3"
                  disabled={rolesMutation.isPending || profileMutation.isPending}
                  onClick={() => void handleSaveModalChanges()}
                  type="button"
                >
                  {rolesMutation.isPending || profileMutation.isPending ? "Saving..." : "Save changes"}
                </button>
              </div>
            ) : null
          }
          isDark={isDark}
          onClose={() => setIsDrawerOpen(false)}
          title={selectedUserQuery.data?.fullName ?? "User details"}
        >
          {!selectedUserId ? (
            <EmptyState isDark={isDark} message="Choose a user from the table to inspect the full registration and activity record." />
          ) : selectedUserQuery.isLoading ? (
            <div className="grid gap-3">
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
              <div className={cn("h-24 animate-pulse rounded-2xl", isDark ? "bg-slate-800" : "bg-slate-100")} />
            </div>
          ) : selectedUserQuery.isError || !selectedUserQuery.data ? (
            <EmptyState isDark={isDark} message="Could not load the full user record. Try selecting the user again." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-3">
              <Surface className="p-4 xl:col-span-3" isDark={isDark}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{selectedUserQuery.data.fullName}</h4>
                    <div className={cn("mt-2 space-y-1.5 text-sm", isDark ? "text-slate-300" : "text-slate-700")}>
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {selectedUserQuery.data.email}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {[selectedUserQuery.data.address.city, selectedUserQuery.data.address.state, selectedUserQuery.data.address.country].filter(Boolean).join(", ") || "Address not complete"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        {selectedUserQuery.data.phoneNumber || "No phone number on file"}
                      </p>
                    </div>
                  </div>
                  <StatusPill isDark={isDark} tone={statusTone(selectedUserQuery.data.status)}>
                    {prettifyEnum(selectedUserQuery.data.status)}
                  </StatusPill>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedUserQuery.data.roles.map((role) => (
                    <StatusPill isDark={isDark} key={role.code} tone="slate">
                      {role.name}
                    </StatusPill>
                  ))}
                  {selectedUserQuery.data.twoFactorEnabled ? (
                    <StatusPill isDark={isDark} tone="green">
                      2FA enabled
                    </StatusPill>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="button-primary !px-4 !py-3" onClick={() => downloadUserJson(selectedUserQuery.data)} type="button">
                    <FileJson className="h-4 w-4" />
                    Download JSON
                  </button>
                  {selectedUserQuery.data.status !== "ACTIVE" ? (
                    <button
                      className="button-secondary !px-4 !py-3"
                      disabled={statusMutation.isPending}
                      onClick={() => handleQuickStatusChange(selectedUserQuery.data.id, "ACTIVE")}
                      type="button"
                    >
                      Activate
                    </button>
                  ) : null}
                  {selectedUserQuery.data.status !== "PENDING" ? (
                    <button
                      className="button-secondary !px-4 !py-3"
                      disabled={statusMutation.isPending}
                      onClick={() => handleQuickStatusChange(selectedUserQuery.data.id, "PENDING")}
                      type="button"
                    >
                      Mark pending
                    </button>
                  ) : null}
                  {selectedUserQuery.data.status !== "SUSPENDED" ? (
                    <button
                      className="button-secondary !px-4 !py-3"
                      disabled={statusMutation.isPending}
                      onClick={() => handleQuickStatusChange(selectedUserQuery.data.id, "SUSPENDED")}
                      type="button"
                    >
                      Suspend
                    </button>
                  ) : null}
                </div>
              </Surface>

              <Surface className="p-4" isDark={isDark}>
                <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Account overview</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {[
                    { label: "Registered", value: formatDateTime(selectedUserQuery.data.createdAt) },
                    { label: "Last active", value: formatDateTime(selectedUserQuery.data.lastActiveAt) },
                    { label: "Email verified", value: formatDateTime(selectedUserQuery.data.emailVerifiedAt) },
                    { label: "Profile type", value: prettifyEnum(selectedUserQuery.data.profileType) }
                  ].map((item) => (
                    <CompactField isDark={isDark} key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>

                <div
                  className={cn(
                    "mt-3 rounded-[18px] border px-3 py-3 text-sm leading-6",
                    isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"
                  )}
                >
                  <p className={cn("text-[11px] uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Address</p>
                  <p className="mt-1">
                    {[selectedUserQuery.data.address.addressLine1, selectedUserQuery.data.address.addressLine2].filter(Boolean).join(", ") || "Address line not provided"}
                  </p>
                  <p className="mt-1">
                    {[selectedUserQuery.data.address.city, selectedUserQuery.data.address.state, selectedUserQuery.data.address.postalCode, selectedUserQuery.data.address.country].filter(Boolean).join(", ") || "Location not provided"}
                  </p>
                </div>
              </Surface>

              {isSuperAdmin ? (
                <Surface className="p-4" isDark={isDark}>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Role management</p>
                    <h4 className={cn("mt-1 font-heading text-lg", isDark ? "text-white" : "text-slate-950")}>Assign roles</h4>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {(usersQuery.data?.availableRoles ?? []).map((role) => {
                      const checked = editableRoleCodes.includes(role.code);

                      return (
                        <label
                          className={cn(
                            "flex items-start justify-between gap-4 rounded-[18px] border px-4 py-3",
                            isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"
                          )}
                          key={role.code}
                        >
                          <div>
                            <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{role.name}</p>
                            <p className={cn("mt-1 text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>{role.code}</p>
                          </div>
                          <input checked={checked} className="mt-1 h-4 w-4" onChange={() => toggleEditableRole(role.code)} type="checkbox" />
                        </label>
                      );
                    })}
                  </div>
                </Surface>
              ) : null}

              <Surface className="p-4" isDark={isDark}>
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Password update</p>
                  <h4 className={cn("mt-1 font-heading text-lg", isDark ? "text-white" : "text-slate-950")}>Set a new password</h4>
                </div>

                <p className={cn("mt-2 text-sm leading-7", isDark ? "text-slate-400" : "text-slate-600")}>
                  {canUpdateSelectedUserPassword
                    ? isSuperAdmin
                      ? "Super admins can update the password for any user."
                      : "Content admins can only update passwords for student accounts."
                    : "You do not have permission to update the password for this user."}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    { key: "password", label: "New password" },
                    { key: "confirmPassword", label: "Confirm password" }
                  ].map((field) => (
                    <label key={field.key}>
                      <span className={cn("text-[11px] uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                        {field.label}
                      </span>
                      <input
                        className={cn(
                          "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                          isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"
                        )}
                        disabled={!canUpdateSelectedUserPassword || passwordMutation.isPending}
                        onChange={(event) => handlePasswordDraftChange(field.key as "password" | "confirmPassword", event.target.value)}
                        type="password"
                        value={passwordDraft[field.key as "password" | "confirmPassword"]}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                    Updating a password signs the user out of active sessions.
                  </p>
                  <button
                    className="button-primary min-w-[180px] !px-5 !py-3"
                    disabled={!canUpdateSelectedUserPassword || passwordMutation.isPending}
                    onClick={() => void handlePasswordUpdate()}
                    type="button"
                  >
                    {passwordMutation.isPending ? "Updating..." : "Update password"}
                  </button>
                </div>
              </Surface>

              <Surface className="p-4" isDark={isDark}>
                <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Counts</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {Object.entries(selectedUserQuery.data.counts).map(([key, value]) => (
                    <div
                      className={cn("rounded-[16px] border px-3 py-3", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}
                      key={key}
                    >
                      <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>{prettifyEnum(key)}</p>
                      <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{value}</p>
                    </div>
                  ))}
                </div>
              </Surface>

              <Surface className="p-4 xl:col-span-2" isDark={isDark}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Devices</p>
                    <h4 className={cn("mt-1 font-heading text-lg", isDark ? "text-white" : "text-slate-950")}>Login devices</h4>
                  </div>
                  {isSuperAdmin ? (
                    <button
                      className="button-primary !px-4 !py-3"
                      disabled={resetDevicesMutation.isPending || !selectedUserQuery.data.devices.length}
                      onClick={handleResetDevices}
                      type="button"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reset devices
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <CompactField
                    isDark={isDark}
                    label="Allowed devices"
                    value={`${selectedUserQuery.data.deviceLimit} ${selectedUserQuery.data.deviceLimit === 1 ? "device" : "devices"}`}
                  />
                  <CompactField
                    isDark={isDark}
                    label="Override"
                    value={
                      selectedUserQuery.data.deviceLimitOverride === null
                        ? "Not set"
                        : `${selectedUserQuery.data.deviceLimitOverride} ${selectedUserQuery.data.deviceLimitOverride === 1 ? "device" : "devices"}`
                    }
                  />
                </div>

                {isSuperAdmin ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <label>
                      <span className={cn("text-[11px] uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                        Device limit override (1-20)
                      </span>
                      <input
                        className={cn(
                          "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                          isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"
                        )}
                        disabled={deviceLimitMutation.isPending}
                        inputMode="numeric"
                        onChange={(event) => setDeviceLimitOverrideDraft(event.target.value)}
                        placeholder="Leave blank for default"
                        value={deviceLimitOverrideDraft}
                      />
                    </label>

                    <button
                      className="button-primary !px-4 !py-3"
                      disabled={deviceLimitMutation.isPending}
                      onClick={handleSaveDeviceLimit}
                      type="button"
                    >
                      {deviceLimitMutation.isPending ? "Saving..." : "Save"}
                    </button>

                    <button
                      className="button-secondary !px-4 !py-3"
                      disabled={deviceLimitMutation.isPending}
                      onClick={handleClearDeviceLimitOverride}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}

                <div className="mt-5 space-y-2">
                  {selectedUserQuery.data.devices.length ? (
                    selectedUserQuery.data.devices.map((device) => (
                      <div
                        className={cn(
                          "rounded-[18px] border px-4 py-3",
                          isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"
                        )}
                        key={device.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={cn("flex items-center gap-2 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>
                              <Smartphone className="h-4 w-4" />
                              <span className="truncate">{device.name}</span>
                            </p>
                            <p className={cn("mt-1 text-xs", isDark ? "text-slate-500" : "text-slate-500")}>
                              Last seen: {formatDateTime(device.lastSeenAt)}
                            </p>
                          </div>
                          <p className={cn("text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>
                            Added {formatDateOnly(device.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState isDark={isDark} message="No login devices have been recorded for this user yet." />
                  )}
                </div>
              </Surface>

              {isSuperAdmin ? (
                <Surface className="p-4 xl:col-span-2" isDark={isDark}>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Super admin controls</p>
                    <h4 className={cn("mt-1 font-heading text-lg", isDark ? "text-white" : "text-slate-950")}>Update user information</h4>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "fullName", label: "Full name", type: "text" },
                      { key: "email", label: "Email", type: "email" },
                      { key: "phoneNumber", label: "Phone", type: "text" },
                      { key: "country", label: "Country", type: "text" },
                      { key: "state", label: "State", type: "text" },
                      { key: "city", label: "City", type: "text" },
                      { key: "postalCode", label: "Postal code", type: "text" },
                      { key: "addressLine1", label: "Address line 1", type: "text" },
                      { key: "addressLine2", label: "Address line 2", type: "text" }
                    ].map((field) => (
                      <label className={field.key === "addressLine1" || field.key === "addressLine2" ? "sm:col-span-2" : ""} key={field.key}>
                        <span className={cn("text-[11px] uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                          {field.label}
                        </span>
                        <input
                          className={cn(
                            "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                            isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"
                          )}
                          onChange={(event) => handleProfileDraftChange(field.key as keyof AdminUserProfileInput, event.target.value)}
                          type={field.type}
                          value={profileDraft[field.key as keyof AdminUserProfileInput] ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                </Surface>
              ) : null}

              <Surface className={cn("p-4", isSuperAdmin ? "" : "xl:col-span-2")} isDark={isDark}>
                <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Subscriptions and payments</p>
                <div className="mt-3 space-y-3">
                  {selectedUserQuery.data.subscriptions.length ? (
                    selectedUserQuery.data.subscriptions.map((subscription) => (
                      <div
                        className={cn("rounded-[18px] border p-3", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}
                        key={subscription.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{subscription.plan.name}</p>
                            <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                              {subscription.plan.price} • {prettifyEnum(subscription.plan.interval)}
                            </p>
                          </div>
                          <StatusPill isDark={isDark} tone={subscription.status === "ACTIVE" ? "green" : subscription.status === "PAST_DUE" ? "amber" : "slate"}>
                            {prettifyEnum(subscription.status)}
                          </StatusPill>
                        </div>
                        <p className={cn("mt-3 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                          {formatDateOnly(subscription.startsAt)} to {subscription.endsAt ? formatDateOnly(subscription.endsAt) : "Open-ended"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <EmptyState isDark={isDark} message="No subscriptions have been recorded for this user yet." />
                  )}
                </div>
              </Surface>

              <Surface className="p-4 xl:col-span-3" isDark={isDark}>
                <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Recent activity</p>
                <div className="mt-3 space-y-2">
                  {selectedUserQuery.data.recentActivity.length ? (
                    selectedUserQuery.data.recentActivity.map((item) => (
                      <div
                        className={cn("rounded-[18px] border px-3 py-3", isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}
                        key={`${item.kind}-${item.id}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.action}</p>
                          <StatusPill isDark={isDark} tone={item.kind === "audit" ? "amber" : "slate"}>
                            {prettifyEnum(item.kind)}
                          </StatusPill>
                        </div>
                        <p className={cn("mt-2 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{formatDateTime(item.createdAt)}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState isDark={isDark} message="No activity or audit records have been captured for this user yet." />
                  )}
                </div>
              </Surface>
            </div>
          )}
        </RightAlignedDrawer>
      ) : null}

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className={cn("w-full max-w-4xl rounded-[28px] border p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Create user</p>
                <h3 className={cn("mt-2 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>Create a user with login details</h3>
                <p className={cn("mt-3 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
                  {isSuperAdmin
                    ? "Super admins can create users here and assign their initial managed roles immediately."
                    : "Content admins can create student accounts here with login details."}
                </p>
              </div>
              <button
                className={cn("rounded-full border px-3 py-1 text-sm", isDark ? "border-slate-700 text-slate-300" : "border-slate-200 text-slate-600")}
                onClick={() => setIsCreateModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {[
                { key: "fullName", label: "Full name", type: "text" },
                { key: "email", label: "Email", type: "email" },
                { key: "password", label: "Temporary password", type: "password" },
                { key: "phoneNumber", label: "Phone", type: "text" },
                { key: "country", label: "Country", type: "text" },
                { key: "state", label: "State", type: "text" },
                { key: "city", label: "City", type: "text" },
                { key: "postalCode", label: "Postal code", type: "text" },
                { key: "addressLine1", label: "Address line 1", type: "text" },
                { key: "addressLine2", label: "Address line 2", type: "text" }
              ].map((field) => (
                <label className={field.key === "addressLine1" || field.key === "addressLine2" ? "lg:col-span-2" : ""} key={field.key}>
                  <span className={cn("text-[11px] uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    {field.label}
                  </span>
                  <input
                    className={cn(
                      "mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
                      isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"
                    )}
                    onChange={(event) => updateCreateUserDraft(field.key as keyof AdminCreateUserInput, event.target.value)}
                    type={field.type}
                    value={(createUserDraft[field.key as keyof AdminCreateUserInput] as string | undefined) ?? ""}
                  />
                </label>
              ))}
            </div>

            <div className="mt-6">
              <div className="flex items-center gap-2">
                <LockKeyhole className={cn("h-4 w-4", isDark ? "text-slate-400" : "text-slate-500")} />
                <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Initial roles</p>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {visibleCreateRoles.map((role) => {
                  const checked = createUserDraft.roleCodes.includes(role.code);

                  return (
                    <label
                      className={cn(
                        "flex items-start justify-between gap-4 rounded-[18px] border px-4 py-3",
                        isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50"
                      )}
                      key={role.code}
                    >
                      <div>
                        <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{role.name}</p>
                        <p className={cn("mt-1 text-xs uppercase tracking-[0.16em]", isDark ? "text-slate-500" : "text-slate-400")}>{role.code}</p>
                      </div>
                      <input checked={checked} className="mt-1 h-4 w-4" onChange={() => toggleCreateRole(role.code)} type="checkbox" />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                {isSuperAdmin
                  ? "New accounts are created active with the supplied email and password."
                  : "New student accounts are created active with the supplied email and password."}
              </p>
              <button
                className="button-primary min-w-[180px] !px-5 !py-3"
                disabled={createUserMutation.isPending}
                onClick={() => void handleCreateUser()}
                type="button"
              >
                {createUserMutation.isPending ? "Creating..." : "Create user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
