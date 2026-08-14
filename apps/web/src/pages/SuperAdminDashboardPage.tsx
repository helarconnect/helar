import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BellRing,
  BookCopy,
  BookOpenText,
  Bot,
  BriefcaseBusiness,
  ChevronRight,
  CircleAlert,
  Clock3,
  Crown,
  Download,
  FileBarChart2,
  FileSpreadsheet,
  GraduationCap,
  Landmark,
  LayoutGrid,
  LineChart,
  ListChecks,
  Lock,
  MessageSquareText,
  MessagesSquare,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserCog,
  Users2
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { downloadAdminUsersCsv, fetchAdminDashboardOverview } from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { canAccessPayments, cn, isContentAdmin } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/auth-store";

type DashboardTab = "community" | "learning" | "overview" | "security";
type ViewMode = "compact" | "expanded";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    weekday: "long",
    year: "numeric"
  }).format(typeof value === "string" ? new Date(value) : value);
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "No login yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function panelClass(isDark: boolean) {
  return isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white";
}

function mutedText(isDark: boolean) {
  return isDark ? "text-slate-400" : "text-slate-600";
}

function subtleText(isDark: boolean) {
  return isDark ? "text-slate-500" : "text-slate-400";
}

function iconForStat(icon: string) {
  const className = "h-5 w-5";
  switch (icon) {
    case "users":
      return <Users2 className={className} />;
    case "pulse":
      return <Activity className={className} />;
    case "shield":
      return <Shield className={className} />;
    case "subjects":
      return <BookOpenText className={className} />;
    case "cases":
      return <Landmark className={className} />;
    case "summaries":
      return <FileBarChart2 className={className} />;
    case "cbt":
      return <GraduationCap className={className} />;
    case "exam-attempts":
      return <Target className={className} />;
    case "community":
      return <MessagesSquare className={className} />;
    case "bookmarks":
      return <BookCopy className={className} />;
    case "notes":
      return <Sparkles className={className} />;
    case "storage":
      return <BriefcaseBusiness className={className} />;
    default:
      return <LayoutGrid className={className} />;
  }
}

function DashboardPanel({
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
        "rounded-[28px] border shadow-[0_24px_80px_rgba(15,23,42,0.08)]",
        panelClass(isDark),
        className
      )}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  description,
  icon,
  isDark,
  title
}: {
  description?: string;
  icon: React.ReactNode;
  isDark: boolean;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
          isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950"
        )}
      >
        {icon}
      </span>
      <div>
        <h3 className={cn("font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>{title}</h3>
        {description ? <p className={cn("mt-1 text-sm", mutedText(isDark))}>{description}</p> : null}
      </div>
    </div>
  );
}

function MetricCard({
  card,
  compact,
  isDark
}: {
  card: {
    comparisonLabel: string;
    direction: "down" | "neutral" | "up";
    formattedTotal?: string;
    icon: string;
    label: string;
    percentage: number;
    total: number;
  };
  compact: boolean;
  isDark: boolean;
}) {
  const trendColor =
    card.direction === "up"
      ? isDark
        ? "text-emerald-300"
        : "text-emerald-700"
      : card.direction === "down"
        ? isDark
          ? "text-rose-300"
          : "text-rose-700"
        : isDark
          ? "text-slate-300"
          : "text-slate-600";

  return (
    <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
            isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950"
          )}
        >
          {iconForStat(card.icon)}
        </span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", trendColor)}>
          {card.direction === "up" ? <TrendingUp className="h-4 w-4" /> : card.direction === "down" ? <TrendingDown className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
          {card.percentage === 0 ? "Stable" : `${card.percentage > 0 ? "+" : ""}${card.percentage}%`}
        </span>
      </div>
      <p className={cn("mt-4 text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{card.label}</p>
      <p className={cn(compact ? "mt-2 text-2xl" : "mt-3 text-3xl", "font-semibold", isDark ? "text-white" : "text-slate-950")}>
        {card.formattedTotal ?? formatNumber(card.total)}
      </p>
      <p className={cn("mt-3 text-sm", mutedText(isDark))}>{card.comparisonLabel}</p>
    </div>
  );
}

function MiniBarChart({
  data,
  isDark
}: {
  data: Array<{ label: string; value: number }>;
  isDark: boolean;
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="mt-6 grid grid-cols-7 gap-2">
      {data.map((item) => (
        <div className="flex flex-col items-center gap-2" key={item.label}>
          <div className={cn("flex h-32 w-full items-end rounded-[18px] px-1.5 py-1.5", isDark ? "bg-slate-800/70" : "bg-slate-100")}>
            <div
              className="w-full rounded-[14px] bg-[linear-gradient(180deg,#8b5cf6_0%,#2563eb_100%)]"
              style={{ height: `${Math.max(8, Math.round((item.value / maxValue) * 100))}%` }}
            />
          </div>
          <p className={cn("text-xs font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>{formatNumber(item.value)}</p>
          <p className={cn("text-[11px] uppercase tracking-[0.16em]", subtleText(isDark))}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function HorizontalMetricList({
  isDark,
  items
}: {
  isDark: boolean;
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between gap-3">
            <p className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")}>{item.label}</p>
            <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
          </div>
          <div className={cn("mt-2 h-2.5 rounded-full", isDark ? "bg-slate-800" : "bg-slate-100")}>
            <div
              className="h-2.5 rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#2563eb_60%,#14b8a6_100%)]"
              style={{ width: `${Math.max(6, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({
  isDark,
  status
}: {
  isDark: boolean;
  status: "healthy" | "warning" | "critical";
}) {
  const tone =
    status === "healthy"
      ? isDark
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "warning"
        ? isDark
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-700"
        : isDark
          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
          : "border-rose-200 bg-rose-50 text-rose-700";

  return <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]", tone)}>{status}</span>;
}

function LoadingState({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-6">
      <div className={cn("h-52 animate-pulse rounded-[32px]", isDark ? "bg-slate-800/70" : "bg-slate-200/70")} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className={cn("h-36 animate-pulse rounded-[24px]", isDark ? "bg-slate-800/70" : "bg-slate-200/70")} key={index} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className={cn("h-96 animate-pulse rounded-[28px]", isDark ? "bg-slate-800/70" : "bg-slate-200/70")} />
        <div className={cn("h-96 animate-pulse rounded-[28px]", isDark ? "bg-slate-800/70" : "bg-slate-200/70")} />
      </div>
    </div>
  );
}

export function SuperAdminDashboardPage() {
  const { isDark } = useTheme();
  const session = useAuthStore((state) => state.session);
  const navigate = useNavigate();
  const roleCodes = session?.user.roleCodes ?? [];
  const [now, setNow] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [viewMode, setViewMode] = useState<ViewMode>("expanded");
  const [searchTerm, setSearchTerm] = useState("");
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const isContentAdminWorkspace = isContentAdmin(roleCodes);
  const canViewPayments = canAccessPayments(roleCodes);
  const executiveUserName = session?.user.fullName ?? "Super Admin";

  // Keep dashboard data fresh for 5 minutes to avoid long round-trips every time
  // an admin navigates away and back. The refetchInterval still refreshes in-place
  // every 60 seconds if the page stays open.
  const dashboardQuery = useQuery({
    queryFn: fetchAdminDashboardOverview,
    queryKey: queryKeys.adminDashboardOverview,
    refetchInterval: 60_000,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const quickActions = useMemo(
    () => [
      { description: "Open the subjects manager in Cases and Ratios.", href: "/app/admin/library/subject-summaries/subjects", icon: <BookOpenText className="h-4 w-4" />, label: "Create Subject" },
      { description: "Open the case workspace for new case records.", href: "/app/admin/library/subject-summaries/cases", icon: <Landmark className="h-4 w-4" />, label: "Add Case" },
      { description: "Open the Q&A summary manager.", href: "/app/admin/library/cases-and-ratios", icon: <FileBarChart2 className="h-4 w-4" />, label: "Add Subject Summary" },
      { description: "Open the content workspace for exam-related content.", href: "/app/admin/content", icon: <GraduationCap className="h-4 w-4" />, label: "Create CBT Exam" },
      { description: "Manage users, roles, and access.", href: "/app/admin/users", icon: <UserCog className="h-4 w-4" />, label: "Manage Users" },
      { description: "Review payments and revenue performance.", href: "/app/admin/payments", icon: <FileSpreadsheet className="h-4 w-4" />, label: "View Reports" },
      { description: "Open settings to handle announcements and platform controls.", href: "/app/admin/settings", icon: <BellRing className="h-4 w-4" />, label: "Broadcast Announcement" },
      { description: "Open platform settings.", href: "/app/admin/settings", icon: <Settings2 className="h-4 w-4" />, label: "System Settings" }
    ].filter((item) => item.href !== "/app/admin/payments" || canViewPayments),
    [canViewPayments]
  );

  const searchResults = useMemo(() => {
    if (!dashboardQuery.data || searchTerm.trim().length < 2) {
      return [];
    }

    const query = searchTerm.trim().toLowerCase();
    const activityResults = dashboardQuery.data.recentActivity.map((item) => ({
      description: item.detail,
      label: item.title,
      meta: item.type,
      target: null as string | null
    }));
    const registrationResults = dashboardQuery.data.recentRegistrations.map((item) => ({
      description: `${item.role} · ${item.email}`,
      label: item.name,
      meta: "Recent registration",
      target: "/app/admin/users"
    }));
    const leaderboardResults = dashboardQuery.data.leaderboard.map((item) => ({
      description: `Exam ${item.averageExamScore}% · ${item.studyHours} study hours`,
      label: item.name,
      meta: "Leaderboard",
      target: "/app/admin/users"
    }));

    return [...quickActions.map((item) => ({ description: item.description, label: item.label, meta: "Quick action", target: item.href })), ...activityResults, ...registrationResults, ...leaderboardResults]
      .filter((item) => `${item.label} ${item.description} ${item.meta}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [dashboardQuery.data, quickActions, searchTerm]);

  if (dashboardQuery.isLoading || !dashboardQuery.data) {
    return <LoadingState isDark={isDark} />;
  }

  const dashboard = dashboardQuery.data;
  const compact = viewMode === "compact";

  async function handleExportUsersCsv() {
    await downloadAdminUsersCsv({ role: "all", search: "", sortBy: "createdAt", sortOrder: "desc", status: "all" });
  }

  return (
    <div className="space-y-6 pb-6">
      <DashboardPanel className="overflow-visible bg-[linear-gradient(135deg,#0f172a_0%,#172554_40%,#0f766e_100%)] p-6 text-white lg:p-8" isDark>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70">
              <Crown className="h-4 w-4" />
              {isContentAdminWorkspace ? "Content Admin Control Center" : "Super Admin Control Center"}
            </div>
            <h1 className="mt-4 font-heading text-[2rem] leading-tight lg:text-[2.8rem]">Good {now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening"}, {executiveUserName}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
              Monitor platform growth, learning performance, community health, security signals, and operational tasks from a single executive workspace.
            </p>
            <p className="mt-4 text-sm text-white/70">{formatDateTime(now)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {[
              { icon: <BellRing className="h-4 w-4" />, label: "Notifications", value: dashboard.header.notificationsCount },
              { icon: <MessageSquareText className="h-4 w-4" />, label: "Messages", value: dashboard.header.messagesCount },
              {
                icon: <Users2 className="h-4 w-4" />,
                label: "Profile",
                value: isContentAdminWorkspace ? "Content Admin" : roleCodes.includes("super_admin") ? "Super Admin" : "Admin"
              }
            ].map((item) => (
              <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/90" key={item.label}>
                <span className="inline-flex items-center gap-2">
                  {item.icon}
                  {item.label}
                  <strong className="font-semibold">{typeof item.value === "number" ? formatNumber(item.value) : item.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:border-white/25 focus:outline-none"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Global search across quick actions, recent registrations, activity, and leaderboard"
              value={searchTerm}
            />
            {searchResults.length ? (
              <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 rounded-[22px] border border-white/10 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur">
                {searchResults.map((item) => (
                  <button
                    className="flex w-full items-center justify-between gap-4 rounded-2xl px-3 py-3 text-left hover:bg-white/5"
                    key={`${item.meta}-${item.label}`}
                    onClick={() => {
                      if (item.target) {
                        navigate(item.target);
                      }
                    }}
                    type="button"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      <p className="mt-1 text-xs text-white/55">{item.description}</p>
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">{item.meta}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-1">
              {(["compact", "expanded"] as ViewMode[]).map((mode) => (
                <button
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm transition",
                    viewMode === mode ? "bg-white text-slate-950" : "text-white/70 hover:bg-white/10"
                  )}
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  type="button"
                >
                  {mode === "compact" ? "Compact" : "Expanded"}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-medium text-white"
                onClick={() => setIsQuickMenuOpen((value) => !value)}
                type="button"
              >
                <Sparkles className="h-4 w-4" />
                Quick Actions
              </button>
              {isQuickMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-20 w-80 rounded-[22px] border border-white/10 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur">
                  {quickActions.map((item) => (
                    <button
                      className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left hover:bg-white/5"
                      key={item.label}
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        navigate(item.href);
                      }}
                      type="button"
                    >
                      <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">{item.icon}</span>
                      <span>
                        <span className="block text-sm font-semibold text-white">{item.label}</span>
                        <span className="mt-1 block text-xs text-white/55">{item.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DashboardPanel>

      <div className={cn("grid gap-4", compact ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-6")}>
        {dashboard.executiveStats.map((card) => (
          <MetricCard card={card} compact={compact} isDark={isDark} key={card.label} />
        ))}
      </div>

      <div className={cn("rounded-[26px] border p-2", panelClass(isDark))}>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Overview", value: "overview" },
            { label: "Learning", value: "learning" },
            { label: "Community", value: "community" },
            { label: "Security", value: "security" }
          ].map((tab) => (
            <button
              className={cn(
                "rounded-2xl px-4 py-2.5 text-sm font-medium transition",
                activeTab === tab.value
                  ? isDark
                    ? "bg-white text-slate-950"
                    : "bg-slate-950 text-white"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800"
                    : "text-slate-600 hover:bg-slate-100"
              )}
              key={tab.value}
              onClick={() => setActiveTab(tab.value as DashboardTab)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-6">
            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Switch between daily, weekly, monthly, and yearly student growth views through one executive module." icon={<LineChart className="h-5 w-5" />} isDark={isDark} title="Student growth" />
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {([
                  { label: "Daily", items: dashboard.studentGrowth.daily },
                  { label: "Weekly", items: dashboard.studentGrowth.weekly },
                  { label: "Monthly", items: dashboard.studentGrowth.monthly },
                  { label: "Yearly", items: dashboard.studentGrowth.yearly }
                ] as const).map((group) => (
                  <div className={cn("rounded-[24px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={group.label}>
                    <div className="flex items-center justify-between gap-3">
                      <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{group.label}</p>
                      <p className={cn("text-xs uppercase tracking-[0.16em]", subtleText(isDark))}>{group.items.length} points</p>
                    </div>
                    <MiniBarChart data={group.items} isDark={isDark} />
                  </div>
                ))}
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Current activity, recent logins, and rolling active-user behavior across the platform." icon={<Activity className="h-5 w-5" />} isDark={isDark} title="Login and active-user analytics" />
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                {[
                  { label: "Currently online", value: dashboard.loginActivity.currentlyOnline },
                  { label: "Today's logins", value: dashboard.loginActivity.todayLogins },
                  { label: "Weekly active", value: dashboard.loginActivity.weeklyActiveUsers },
                  { label: "Monthly active", value: dashboard.loginActivity.monthlyActiveUsers }
                ].map((item) => (
                  <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-3 text-2xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-[24px] border p-4" style={{ borderColor: isDark ? "#1e293b" : "#e2e8f0", background: isDark ? "#0f172a" : "#f8fafc" }}>
                <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Login trend</p>
                <MiniBarChart data={dashboard.loginActivity.loginTrend.slice(-7)} isDark={isDark} />
              </div>
            </DashboardPanel>
          </div>

          <div className="space-y-6">
            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Content totals and publication health across the platform." icon={<BookCopy className="h-5 w-5" />} isDark={isDark} title="Content management overview" />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Subjects", value: dashboard.contentOverview.subjects },
                  { label: "Cases", value: dashboard.contentOverview.cases },
                  { label: "Ratios", value: dashboard.contentOverview.ratios },
                  { label: "Subject Summaries", value: dashboard.contentOverview.subjectSummaries },
                  { label: "Study Materials", value: dashboard.contentOverview.studyMaterials },
                  { label: "Videos", value: dashboard.contentOverview.videos },
                  { label: "Downloads", value: dashboard.contentOverview.downloads },
                  { label: "Statutes", value: dashboard.contentOverview.statutes }
                ].map((item) => (
                  <div className={cn("rounded-[20px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-3 text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {[
                  { label: "Published", value: dashboard.contentOverview.published.cases + dashboard.contentOverview.published.subjectSummaries + dashboard.contentOverview.published.announcements },
                  { label: "Draft", value: dashboard.contentOverview.draft.cases + dashboard.contentOverview.draft.subjectSummaries },
                  { label: "Archived", value: dashboard.contentOverview.archived.cases + dashboard.contentOverview.archived.subjectSummaries }
                ].map((item) => (
                  <div className={cn("rounded-[18px] border px-4 py-3", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-100")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Tasks and alerts requiring super-admin attention." icon={<ListChecks className="h-5 w-5" />} isDark={isDark} title="Pending tasks" />
              <div className="mt-6 space-y-3">
                {dashboard.pendingTasks.map((task) => (
                  <article className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={task.title}>
                    <div className="flex items-center justify-between gap-3">
                      <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{task.title}</p>
                      <StatusPill isDark={isDark} status={task.level} />
                    </div>
                    <p className={cn("mt-2 text-sm", mutedText(isDark))}>{task.detail}</p>
                  </article>
                ))}
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Latest platform movement across users, content, payments, and study activity." icon={<Clock3 className="h-5 w-5" />} isDark={isDark} title="Recent activity feed" />
              <div className="mt-6 space-y-4">
                {dashboard.recentActivity.slice(0, 6).map((item) => (
                  <div className="flex items-start justify-between gap-4" key={`${item.type}-${item.timestamp}-${item.title}`}>
                    <div>
                      <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.title}</p>
                      <p className={cn("mt-1 text-sm", mutedText(isDark))}>{item.detail}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-[11px] uppercase tracking-[0.16em]", subtleText(isDark))}>{item.type}</p>
                      <p className={cn("mt-1 text-xs", mutedText(isDark))}>{formatRelativeTime(item.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardPanel>
          </div>
        </div>
      ) : null}

      {activeTab === "learning" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-6">
            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="What students are reading most and where learning attention is concentrated." icon={<GraduationCap className="h-5 w-5" />} isDark={isDark} title="Learning analytics" />
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Most studied subjects</p>
                  <div className="mt-4">
                    <HorizontalMetricList isDark={isDark} items={dashboard.learningAnalytics.mostStudiedSubjects} />
                  </div>
                </div>
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Most viewed cases</p>
                  <div className="mt-4">
                    <HorizontalMetricList isDark={isDark} items={dashboard.learningAnalytics.mostViewedCases} />
                  </div>
                </div>
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Most read subject summaries</p>
                  <div className="mt-4">
                    <HorizontalMetricList isDark={isDark} items={dashboard.learningAnalytics.mostReadSubjectSummaries} />
                  </div>
                </div>
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Most bookmarked topics</p>
                  <div className="mt-4">
                    <HorizontalMetricList isDark={isDark} items={dashboard.learningAnalytics.mostBookmarkedTopics} />
                  </div>
                </div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>Average reading time</p>
                  <p className={cn("mt-3 text-2xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{dashboard.learningAnalytics.averageReadingTimeMinutes.toFixed(1)} mins</p>
                </div>
                <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>Average study duration</p>
                  <p className={cn("mt-3 text-2xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{dashboard.learningAnalytics.averageStudyDurationMinutes.toFixed(1)} mins</p>
                </div>
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="CBT performance, attempt volume, and outcomes across the platform." icon={<Target className="h-5 w-5" />} isDark={isDark} title="CBT analytics" />
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                {[
                  { label: "Exams created", value: dashboard.cbt.totalExamsCreated },
                  { label: "Exams today", value: dashboard.cbt.examsTakenToday },
                  { label: "Pending exams", value: dashboard.cbt.pendingExams },
                  { label: "Average score", value: dashboard.cbt.averageStudentScore }
                ].map((item) => (
                  <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-3 text-2xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{typeof item.value === "number" ? formatNumber(item.value) : item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Score distribution</p>
                  <MiniBarChart data={dashboard.cbt.scoreDistribution} isDark={isDark} />
                </div>
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Daily exam activity</p>
                  <MiniBarChart data={dashboard.cbt.dailyActivity} isDark={isDark} />
                </div>
              </div>
            </DashboardPanel>
          </div>

          <div className="space-y-6">
            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Top-performing students across study effort, exams, and community activity." icon={<Sparkles className="h-5 w-5" />} isDark={isDark} title="Student leaderboard" />
              <div className="mt-6 space-y-4">
                {dashboard.leaderboard.map((item, index) => (
                  <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={item.id}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>#{index + 1} {item.name}</p>
                        <p className={cn("mt-1 text-sm", mutedText(isDark))}>
                          Exam {item.averageExamScore}% • {item.studyHours} study hours • {item.communityContributions} community contributions
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-xs uppercase tracking-[0.16em]", subtleText(isDark))}>Composite score</p>
                        <p className={cn("mt-2 text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.compositeScore}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Subject-level performance signals across exam results." icon={<Bot className="h-5 w-5" />} isDark={isDark} title="Performance spread" />
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Highest performing subjects</p>
                  <div className="mt-4">
                    <HorizontalMetricList isDark={isDark} items={dashboard.learningAnalytics.highestPerformingSubjects} />
                  </div>
                </div>
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Lowest performing subjects</p>
                  <div className="mt-4">
                    <HorizontalMetricList isDark={isDark} items={dashboard.learningAnalytics.lowestPerformingSubjects} />
                  </div>
                </div>
              </div>
            </DashboardPanel>
          </div>
        </div>
      ) : null}

      {activeTab === "community" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Helar Connect participation and discussion health at a glance." icon={<MessagesSquare className="h-5 w-5" />} isDark={isDark} title="Community overview" />
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                {[
                  { label: "Total posts", value: dashboard.communityOverview.totalPosts },
                  { label: "Total comments", value: dashboard.communityOverview.totalComments },
                  { label: "Active discussions", value: dashboard.communityOverview.activeDiscussions },
                  { label: "Reported posts", value: dashboard.communityOverview.reportedPosts }
                ].map((item) => (
                  <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-3 text-2xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Most active members</p>
                  <div className="mt-4">
                    <HorizontalMetricList isDark={isDark} items={dashboard.communityOverview.mostActiveMembers} />
                  </div>
                </div>
                <div className={cn("rounded-[24px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Community health indicators</p>
                  <div className="mt-4 space-y-3">
                    {dashboard.communityOverview.health.map((item) => (
                      <div className="flex items-center justify-between gap-3" key={item.label}>
                        <div>
                          <p className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")}>{item.label}</p>
                          <p className={cn("mt-1 text-sm", mutedText(isDark))}>{item.value}</p>
                        </div>
                        <StatusPill isDark={isDark} status={item.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Latest registrations with direct visibility into role, status, and last login." icon={<Users2 className="h-5 w-5" />} isDark={isDark} title="Recent registrations" />
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className={cn("border-b", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500")}>
                      {["Name", "Email", "Role", "Registered", "Status", "Last Login"].map((header) => (
                        <th className="px-3 py-3 font-medium" key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentRegistrations.map((user) => (
                      <tr className={cn("border-b", isDark ? "border-slate-800/80" : "border-slate-100")} key={user.id}>
                        <td className="px-3 py-4 font-medium">{user.name}</td>
                        <td className="px-3 py-4">{user.email}</td>
                        <td className="px-3 py-4">{user.role}</td>
                        <td className="px-3 py-4">{formatShortDate(user.registeredAt)}</td>
                        <td className="px-3 py-4">{user.status}</td>
                        <td className="px-3 py-4">{formatShortDate(user.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>
          </div>

          <div className="space-y-6">
            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Exports and operational shortcuts for the super-admin desk." icon={<Download className="h-5 w-5" />} isDark={isDark} title="Reports and exports" />
              <div className="mt-6 space-y-3">
                <button className={cn("flex w-full items-center justify-between rounded-[22px] border px-4 py-3", isDark ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")} onClick={handleExportUsersCsv} type="button">
                  <span className="inline-flex items-center gap-3">
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Users CSV
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
                {[
                  { href: "/app/admin/payments", label: "Open payment reports" },
                  { href: "/app/admin/content", label: "Review content workflows" },
                  { href: "/app/admin/users", label: "Open user management" }
                ]
                  .filter((item) => item.href !== "/app/admin/payments" || canViewPayments)
                  .map((item) => (
                  <Link className={cn("flex items-center justify-between rounded-[22px] border px-4 py-3 text-sm", isDark ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")} key={item.label} to={item.href}>
                    {item.label}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                  ))}
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Overall platform condition across key operating surfaces." icon={<CircleAlert className="h-5 w-5" />} isDark={isDark} title="System health" />
              <div className="mt-6 space-y-4">
                {dashboard.systemHealth.map((item) => (
                  <div className="flex items-center justify-between gap-3" key={item.label}>
                    <div>
                      <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.label}</p>
                      <p className={cn("mt-1 text-sm", mutedText(isDark))}>{item.value}</p>
                    </div>
                    <StatusPill isDark={isDark} status={item.status} />
                  </div>
                ))}
              </div>
            </DashboardPanel>
          </div>
        </div>
      ) : null}

      {activeTab === "security" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Security posture and account-safety telemetry currently available in the platform." icon={<Lock className="h-5 w-5" />} isDark={isDark} title="Security dashboard" />
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                  { label: "Failed login attempts", value: dashboard.security.failedLoginAttempts },
                  { label: "Locked accounts", value: dashboard.security.lockedAccounts },
                  { label: "Suspicious activities", value: dashboard.security.suspiciousActivities },
                  { label: "Active sessions", value: dashboard.security.activeSessions },
                  { label: "Devices logged in", value: dashboard.security.devicesLoggedIn },
                  { label: "Password reset requests", value: dashboard.security.passwordResetRequests }
                ].map((item) => (
                  <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-3 text-2xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
            </DashboardPanel>

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Security quick actions routed into the existing admin controls." icon={<Shield className="h-5 w-5" />} isDark={isDark} title="Security actions" />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  { description: "Open user management to suspend or lock an account.", href: "/app/admin/users", label: "Lock User" },
                  { description: "Open users to manage active sessions and revoke access.", href: "/app/admin/users", label: "Force Logout" },
                  { description: "Open users to handle reset flows and support requests.", href: "/app/admin/users", label: "Reset Password" },
                  { description: "Open user management to disable an account.", href: "/app/admin/users", label: "Disable Account" }
                ].map((item) => (
                  <Link className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")} key={item.label} to={item.href}>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className={cn("mt-2 text-sm", mutedText(isDark))}>{item.description}</p>
                  </Link>
                ))}
              </div>
            </DashboardPanel>
          </div>

          <div className="space-y-6">
            {canViewPayments ? (
              <DashboardPanel className="p-6" isDark={isDark}>
                <SectionTitle description="Financial performance stays visible here for fast escalation." icon={<Landmark className="h-5 w-5" />} isDark={isDark} title="Financial overview" />
                <div className="mt-6 grid gap-3">
                  {[
                    { label: "Revenue collected", value: dashboard.modules.finance.revenueCollected },
                    { label: "Active subscriptions", value: formatNumber(dashboard.modules.finance.activeSubscriptions) },
                    { label: "Total subscriptions", value: formatNumber(dashboard.modules.finance.totalSubscriptions) },
                    { label: "Failed payments", value: formatNumber(dashboard.modules.finance.failedPayments) },
                    { label: "Pending payments", value: formatNumber(dashboard.modules.finance.pendingPayments) }
                  ].map((item) => (
                    <div className={cn("rounded-[20px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50")} key={item.label}>
                      <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                      <p className={cn("mt-2 text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </DashboardPanel>
            ) : null}

            <DashboardPanel className="p-6" isDark={isDark}>
              <SectionTitle description="Direct access to operations screens from the security workspace." icon={<Settings2 className="h-5 w-5" />} isDark={isDark} title="Operations shortcuts" />
              <div className="mt-6 space-y-3">
                {quickActions.slice(4).map((item) => (
                  <button
                    className={cn("flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left", isDark ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-950")}
                    key={item.label}
                    onClick={() => navigate(item.href)}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-3">
                      {item.icon}
                      {item.label}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </DashboardPanel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
