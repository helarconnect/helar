import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  BellRing,
  BookOpenText,
  ChartNoAxesCombined,
  CircleHelp,
  FileStack,
  GraduationCap,
  MessagesSquare,
  ShieldCheck,
  Users2
} from "lucide-react";
import type { ReactNode } from "react";

import { fetchAdminDashboardOverview } from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/auth-store";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(amountMinor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amountMinor / 100);
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
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short"
  }).format(date);
}

function panelTone(isDark: boolean) {
  return isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white";
}

function mutedText(isDark: boolean) {
  return isDark ? "text-slate-400" : "text-slate-600";
}

function subtleText(isDark: boolean) {
  return isDark ? "text-slate-500" : "text-slate-400";
}

function AdminPanel({
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
        "rounded-[30px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]",
        panelTone(isDark),
        className
      )}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  isDark,
  kicker,
  title
}: {
  icon: ReactNode;
  isDark: boolean;
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
          isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950"
        )}
      >
        {icon}
      </span>
      <div>
        <p className={cn("text-xs uppercase tracking-[0.22em]", subtleText(isDark))}>{kicker}</p>
        <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>{title}</h3>
      </div>
    </div>
  );
}

function AlertTone({
  tone,
  isDark
}: {
  tone: "amber" | "blue" | "green" | "red";
  isDark: boolean;
}) {
  const palette = {
    amber: isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-700",
    blue: isDark ? "border-sky-500/25 bg-sky-500/10 text-sky-200" : "border-sky-200 bg-sky-50 text-sky-700",
    green: isDark ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: isDark ? "border-rose-500/25 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"
  } as const;

  return palette[tone];
}

function VerticalBarChart({
  data,
  formatter,
  isDark,
  valueKey
}: {
  data: Array<Record<string, number | string>>;
  formatter?: (value: number) => string;
  isDark: boolean;
  valueKey: string;
}) {
  const maxValue = Math.max(...data.map((item) => Number(item[valueKey])), 1);

  return (
    <div className="mt-6 grid grid-cols-6 gap-3">
      {data.map((item) => {
        const value = Number(item[valueKey]);
        const heightPct = Math.max(10, Math.round((value / maxValue) * 100));

        return (
          <div className="flex flex-col items-center gap-3" key={String(item.label)}>
            <div className={cn("flex h-44 w-full items-end rounded-[22px] px-2 py-2", isDark ? "bg-slate-800/80" : "bg-slate-100")}>
              <div
                className="w-full rounded-[16px] bg-[linear-gradient(180deg,#7c3aed_0%,#2563eb_100%)]"
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <div className="text-center">
              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatter ? formatter(value) : value}</p>
              <p className={cn("mt-1 text-xs uppercase tracking-[0.16em]", subtleText(isDark))}>{String(item.label)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBars({
  data,
  isDark
}: {
  data: Array<{ label: string; value: number; percent?: number }>;
  isDark: boolean;
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="mt-6 space-y-4">
      {data.map((item) => {
        const widthPct = item.percent ?? Math.round((item.value / maxValue) * 100);

        return (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3">
              <p className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")}>{item.label}</p>
              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
            </div>
            <div className={cn("mt-2 h-2.5 rounded-full", isDark ? "bg-slate-800" : "bg-slate-100")}>
              <div
                className="h-2.5 rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#3b82f6_55%,#14b8a6_100%)]"
                style={{ width: `${Math.max(6, widthPct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModuleCard({
  body,
  children,
  icon,
  isDark,
  title
}: {
  body: string;
  children: ReactNode;
  icon: ReactNode;
  isDark: boolean;
  title: string;
}) {
  return (
    <div className={cn("rounded-[26px] border p-5", isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950")}>{icon}</span>
        <div>
          <p className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{title}</p>
          <p className={cn("mt-1 text-sm", mutedText(isDark))}>{body}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function LoadingState({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-6">
      <div className={cn("h-[280px] animate-pulse rounded-[30px]", isDark ? "bg-slate-800/70" : "bg-slate-200/70")} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className={cn("h-[140px] animate-pulse rounded-[28px]", isDark ? "bg-slate-800/70" : "bg-slate-200/70")} key={index} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className={cn("h-[360px] animate-pulse rounded-[28px]", isDark ? "bg-slate-800/70" : "bg-slate-200/70")} key={index} />
        ))}
      </div>
    </div>
  );
}

export function AdminDashboardPage() {
  const { isDark } = useTheme();
  const session = useAuthStore((state) => state.session);
  const adminName = session?.user.fullName ?? "Helar Administrator";
  // 5-minute stale window: navigating back to the admin dashboard reuses cached
  // data instantly (no loading skeleton) instead of re-running the full overview
  // query on every mount.
  const adminQuery = useQuery({
    queryKey: queryKeys.adminDashboardOverview,
    queryFn: fetchAdminDashboardOverview,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  if (adminQuery.isLoading || !adminQuery.data) {
    return <LoadingState isDark={isDark} />;
  }

  const data = adminQuery.data;
  const financePeak = Math.max(...data.charts.financeTrend.map((item) => item.collectedAmountMinor), 1);
  const primaryAlerts = data.alerts.slice(0, 3);
  const recentActivity = data.recentActivity.slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#18112b_0%,#172554_48%,#0f766e_100%)] p-7 text-white shadow-[0_35px_100px_rgba(15,23,42,0.26)] lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">Admin intelligence center</p>
            <h2 className="mt-4 font-heading text-[2rem] leading-tight lg:text-[2.45rem]">
              Welcome back, {adminName}. Here is the live operating picture across users, content, study activity, finance, and Helar Connect.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">
              This dashboard now reflects the actual modules running across Helar, so you can track growth, publishing health,
              learner engagement, revenue signals, and community participation from one place.
            </p>
          </div>

          <div className="w-full xl:w-[360px]">
            <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">Platform snapshot</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                {[
                  { label: "Total users", value: data.hero.totalUsers },
                  { label: "Active last 30 days", value: data.hero.activeUsers },
                  { label: "Tracked study hours", value: data.hero.studyHours }
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/45">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {data.summaryCards.map((card) => (
          <AdminPanel isDark={isDark} key={card.label}>
            <p className={cn("text-xs uppercase tracking-[0.2em]", subtleText(isDark))}>{card.label}</p>
            <p className={cn("mt-4 text-3xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{card.value}</p>
            <p className={cn("mt-3 text-sm", mutedText(isDark))}>{card.changeLabel}</p>
          </AdminPanel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
        <AdminPanel isDark={isDark}>
          <SectionHeader icon={<ChartNoAxesCombined className="h-5 w-5" />} isDark={isDark} kicker="Growth" title="User registrations over the last 6 months" />
          <VerticalBarChart data={data.charts.userGrowth} isDark={isDark} valueKey="registrations" />
        </AdminPanel>

        <AdminPanel isDark={isDark}>
          <SectionHeader icon={<BellRing className="h-5 w-5" />} isDark={isDark} kicker="Signals" title="Live platform alerts" />
          <div className="mt-6 space-y-3">
            {primaryAlerts.map((alert) => (
              <article className={cn("rounded-[22px] border px-4 py-4", AlertTone({ tone: alert.tone, isDark }))} key={alert.title}>
                <p className="text-sm font-semibold">{alert.title}</p>
                <p className="mt-2 text-sm leading-6 opacity-90">{alert.body}</p>
              </article>
            ))}
          </div>
        </AdminPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel isDark={isDark}>
          <SectionHeader icon={<FileStack className="h-5 w-5" />} isDark={isDark} kicker="Content footprint" title="How Helar content is distributed" />
          <HorizontalBars data={data.charts.contentDistribution} isDark={isDark} />
        </AdminPanel>

        <AdminPanel isDark={isDark}>
          <SectionHeader icon={<BadgeDollarSign className="h-5 w-5" />} isDark={isDark} kicker="Finance" title="Collections and failed payments trend" />
          <div className="mt-6 grid grid-cols-6 gap-3">
            {data.charts.financeTrend.map((item) => {
              const heightPct = Math.max(10, Math.round((item.collectedAmountMinor / financePeak) * 100));

              return (
                <div className="flex flex-col items-center gap-3" key={item.label}>
                  <div className={cn("flex h-40 w-full items-end rounded-[20px] px-2 py-2", isDark ? "bg-slate-800/80" : "bg-slate-100")}>
                    <div className="w-full rounded-[14px] bg-[linear-gradient(180deg,#22c55e_0%,#2563eb_100%)]" style={{ height: `${heightPct}%` }} />
                  </div>
                  <div className="text-center">
                    <p className={cn("text-xs font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatCurrency(item.collectedAmountMinor)}</p>
                    <p className={cn("mt-1 text-[11px] uppercase tracking-[0.16em]", subtleText(isDark))}>{item.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <AdminPanel isDark={isDark}>
          <SectionHeader icon={<MessagesSquare className="h-5 w-5" />} isDark={isDark} kicker="Module overview" title="Core sections at a glance" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ModuleCard body="Registration and account health." icon={<Users2 className="h-5 w-5" />} isDark={isDark} title="Users">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Total", value: data.modules.users.total },
                  { label: "Pending", value: data.modules.users.pending },
                  { label: "Active 30 days", value: data.modules.users.activeLast30Days }
                ].map((item) => (
                  <div className={cn("rounded-[18px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
            </ModuleCard>

            <ModuleCard body="Publishing and library coverage." icon={<BookOpenText className="h-5 w-5" />} isDark={isDark} title="Content">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Law Reports", value: data.modules.content.libraryLawReports },
                  { label: "Published Cases", value: data.modules.content.casesPublished },
                  { label: "Published Q&A", value: data.modules.content.summaryEntriesPublished }
                ].map((item) => (
                  <div className={cn("rounded-[18px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
            </ModuleCard>

            <ModuleCard body="Learner engagement and saved work." icon={<GraduationCap className="h-5 w-5" />} isDark={isDark} title="Study Center">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Progress", value: data.modules.studyCenter.trackedProgressItems },
                  { label: "Notes", value: data.modules.studyCenter.notes },
                  { label: "Reading Hours", value: data.modules.studyCenter.readingHours }
                ].map((item) => (
                  <div className={cn("rounded-[18px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
            </ModuleCard>

            <ModuleCard body="Community conversations and participation." icon={<MessagesSquare className="h-5 w-5" />} isDark={isDark} title="Helar Connect">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Questions", value: data.modules.connect.questions },
                  { label: "Contributors", value: data.modules.connect.contributors },
                  { label: "Unanswered", value: data.modules.connect.unansweredQuestions }
                ].map((item) => (
                  <div className={cn("rounded-[18px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-50")} key={item.label}>
                    <p className={cn("text-xs uppercase tracking-[0.18em]", subtleText(isDark))}>{item.label}</p>
                    <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>
            </ModuleCard>
          </div>
        </AdminPanel>

        <AdminPanel isDark={isDark}>
          <SectionHeader icon={<ShieldCheck className="h-5 w-5" />} isDark={isDark} kicker="Summary" title="What matters most right now" />
          <div className="mt-6 space-y-4">
            <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-50")}>
              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Executive snapshot</p>
              <p className={cn("mt-3 text-sm leading-7", mutedText(isDark))}>
                Helar currently has {formatNumber(data.modules.users.total)} users, {formatNumber(data.modules.finance.activeSubscriptions)} active subscriptions,
                {` ${formatNumber(data.modules.content.casesPublished)} published cases, `}
                {formatNumber(data.modules.content.summaryEntriesPublished)} published subject summary Q&A entries, and{" "}
                {formatNumber(data.modules.connect.questions)} community questions.
              </p>
            </div>

            <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-50")}>
              <div className="flex items-center gap-2">
                <CircleHelp className="h-4 w-4" />
                <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Priority items</p>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  `${formatNumber(data.modules.users.pending)} pending user records need action`,
                  `${formatNumber(data.modules.finance.failedPayments)} failed payments need finance review`,
                  `${formatNumber(data.modules.connect.unansweredQuestions)} unanswered Connect discussions remain open`
                ].map((item) => (
                  <div className="flex items-start gap-3" key={item}>
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-[color:var(--color-accent-strong)]" />
                    <p className={cn("text-sm", mutedText(isDark))}>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn("rounded-[22px] border p-4", isDark ? "border-slate-800 bg-slate-800/70" : "border-slate-200 bg-slate-50")}>
              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Recent activity</p>
              <div className="mt-4 space-y-3">
                {recentActivity.map((item) => (
                  <div className="flex items-start justify-between gap-4" key={`${item.type}-${item.timestamp}-${item.title}`}>
                    <div>
                      <p className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")}>{item.title}</p>
                      <p className={cn("mt-1 text-sm", mutedText(isDark))}>{item.detail}</p>
                    </div>
                    <span className={cn("whitespace-nowrap text-xs uppercase tracking-[0.16em]", subtleText(isDark))}>{formatRelativeTime(item.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}
