import { MaterialType, PaymentStatus, StudentStudyContentType, SubscriptionStatus, SubjectSummaryCaseStatus, UserStatus, type Prisma } from "@prisma/client";

import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";

const adminRoleCodes = ["super_admin", "administrator", "academic_administrator", "finance_officer", "moderator", "content_admin"] as const;
const millisecondsPerDay = 1000 * 60 * 60 * 24;

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = (day + 6) % 7;
  value.setDate(value.getDate() - diff);
  return value;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * millisecondsPerDay);
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addYears(date: Date, years: number) {
  return new Date(date.getFullYear() + years, 0, 1);
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short"
  }).format(date);
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short"
  }).format(date);
}

function formatWeekLabel(date: Date) {
  return `${formatMonthLabel(date)} ${date.getDate()}`;
}

function formatYearLabel(date: Date) {
  return String(date.getFullYear());
}

function formatMoney(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amountMinor / 100);
}

function toHours(seconds: number) {
  return Number((seconds / 3600).toFixed(1));
}

function toMinutes(seconds: number) {
  return Number((seconds / 60).toFixed(1));
}

function calculatePercent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function calculateDelta(current: number, previous: number) {
  if (current === previous) {
    return {
      comparisonLabel: "No change vs previous period",
      direction: "neutral" as const,
      percentage: 0
    };
  }

  if (previous <= 0) {
    return {
      comparisonLabel: current > 0 ? "Started tracking this period" : "No movement this period",
      direction: current > 0 ? ("up" as const) : ("neutral" as const),
      percentage: current > 0 ? 100 : 0
    };
  }

  const percentage = Number((((current - previous) / previous) * 100).toFixed(1));

  return {
    comparisonLabel: `${percentage > 0 ? "+" : ""}${percentage}% vs previous period`,
    direction: percentage > 0 ? ("up" as const) : ("down" as const),
    percentage
  };
}

function formatStorage(bytes: number) {
  if (bytes <= 0) {
    return "0 MB";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function countDistinctSessionUsers(where: Prisma.SessionWhereInput) {
  const sessions = await prisma.session.findMany({
    where,
    distinct: ["userId"],
    select: {
      userId: true
    }
  });

  return sessions.length;
}

async function countDistinctActiveStudents(where: Prisma.StudentWhereInput) {
  const students = await prisma.student.findMany({
    where,
    distinct: ["userId"],
    select: {
      userId: true
    }
  });

  return students.length;
}

function rankItems<T extends { value: number }>(items: T[], limit = 5) {
  return items
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

function sumByteLength(values: Array<string | null | undefined>) {
  return values.reduce((total, value) => total + Buffer.byteLength(value ?? "", "utf8"), 0);
}

function countValues<T extends string>(values: T[]) {
  const counts = new Map<T, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function countOptionalValues<T extends string>(values: Array<T | null | undefined>) {
  const counts = new Map<T, number>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function summarizePayments(items: Array<{ amountMinor: number; status: PaymentStatus }>) {
  const summary = new Map<PaymentStatus, { amountMinor: number; count: number }>();

  for (const item of items) {
    const current = summary.get(item.status) ?? { amountMinor: 0, count: 0 };
    summary.set(item.status, {
      amountMinor: current.amountMinor + item.amountMinor,
      count: current.count + 1
    });
  }

  return summary;
}

export async function getAdminDashboardOverview() {
  const now = new Date();
  const startToday = startOfDay(now);
  const startYesterday = addDays(startToday, -1);
  const startThisWeek = startOfWeek(now);
  const startThisMonth = startOfMonth(now);
  const startPreviousMonth = addMonths(startThisMonth, -1);
  const startNextMonth = addMonths(startThisMonth, 1);
  const startThisYear = startOfYear(now);
  const last7Days = addDays(startToday, -6);
  const last30Days = addDays(startToday, -29);
  const currentlyOnlineThreshold = new Date(now.getTime() - 1000 * 60 * 15);

  const monthlyWindows = Array.from({ length: 6 }, (_, index) => {
    const monthStart = addMonths(startThisMonth, -(5 - index));
    const nextMonthStart = addMonths(monthStart, 1);

    return {
      label: formatMonthLabel(monthStart),
      start: monthStart,
      end: nextMonthStart
    };
  });

  const dailyGrowthWindows = Array.from({ length: 7 }, (_, index) => {
    const dayStart = addDays(startToday, -(6 - index));
    return {
      label: formatDateLabel(dayStart),
      start: dayStart,
      end: addDays(dayStart, 1)
    };
  });

  const weeklyGrowthWindows = Array.from({ length: 8 }, (_, index) => {
    const weekStart = addWeeks(startThisWeek, -(7 - index));
    return {
      label: formatWeekLabel(weekStart),
      start: weekStart,
      end: addWeeks(weekStart, 1)
    };
  });

  const monthlyGrowthWindows = Array.from({ length: 12 }, (_, index) => {
    const monthStart = addMonths(startThisMonth, -(11 - index));
    return {
      label: formatMonthLabel(monthStart),
      start: monthStart,
      end: addMonths(monthStart, 1)
    };
  });

  const yearlyGrowthWindows = Array.from({ length: 5 }, (_, index) => {
    const yearStart = addYears(startThisYear, -(4 - index));
    return {
      label: formatYearLabel(yearStart),
      start: yearStart,
      end: addYears(yearStart, 1)
    };
  });

  const loginTrendWindows = Array.from({ length: 14 }, (_, index) => {
    const dayStart = addDays(startToday, -(13 - index));
    return {
      label: formatDateLabel(dayStart),
      start: dayStart,
      end: addDays(dayStart, 1)
    };
  });

  const cbtActivityWindows = Array.from({ length: 7 }, (_, index) => {
    const dayStart = addDays(startToday, -(6 - index));
    return {
      label: formatDateLabel(dayStart),
      start: dayStart,
      end: addDays(dayStart, 1)
    };
  });

  const [
    totalUsers,
    activeUsersCount,
    pendingUsersCount,
    suspendedUsersCount,
    totalStudents,
    totalAdmins,
    totalSubscriptions,
    activeSubscriptionsCount,
    canceledSubscriptionsCount,
    expiredSubscriptionsCount,
    pastDueSubscriptionsCount,
    trialingSubscriptionsCount,
    paymentStatusCounts,
    succeededPayments,
    failedPaymentsCount,
    libraryCategories,
    subjectSummarySubjectCount,
    subjectSummaryTopicCount,
    subjectSummaryCaseCount,
    archivedCasesCount,
    draftCasesCount,
    pendingApprovalCasesCount,
    publishedCasesCount,
    subjectSummaryEntryCount,
    archivedEntriesCount,
    draftEntriesCount,
    pendingApprovalEntriesCount,
    publishedEntriesCount,
    caseViewsCount,
    studyProgressCount,
    studyProgressTime,
    averageStudyProgressTime,
    caseReadProgressCount,
    lawReportProgressCount,
    revisionMaterialProgressCount,
    statuteProgressCount,
    subjectSummaryEntryProgressCount,
    subjectSummarySubjectProgressCount,
    subjectSummaryTopicProgressCount,
    studyBookmarkCount,
    studyNoteCount,
    studyDownloadCount,
    connectQuestionCount,
    connectAnswerCount,
    connectCommentCount,
    connectVoteCount,
    connectContributorCount,
    unansweredQuestionCount,
    recentQuestions,
    recentPayments,
    recentStudyItems,
    unreadNotificationsCount,
    activeSessionsCount,
    devicesLoggedInCount,
    suspendedAccountsCount,
    failedLoginAttemptsCount,
    passwordResetRequestCount,
    suspiciousActivityCount,
    cbtQuestionCount,
    examCount,
    pendingExamAttemptsCount,
    examsTakenTodayCount,
    cbtAttemptCount,
    cbtResultAggregate,
    passCount,
    failCount,
    studyMaterialCount,
    downloadableMaterialCount,
    videoMaterialCount,
    ratioBearingCaseCount,
    communityDiscussionCount,
    communityRecentDiscussionCount,
    recentUsers,
    recentCases,
    recentSummaryEntries,
    recentExams,
    storageMaterials,
    storageCases,
    storageEntries,
    storageNotes,
    leaderboardStudents,
    contributorUsers,
    viewedCases,
    summaryProgressItems,
    bookmarkedTopics,
    studiedSubjects,
    cbtAttemptsDetailed,
    cbtResultsDetailed,
    questionsCurrentPeriod,
    questionsPreviousPeriod,
    bookmarksCurrentPeriod,
    bookmarksPreviousPeriod,
    notesCurrentPeriod,
    notesPreviousPeriod,
    subjectsCurrentPeriod,
    subjectsPreviousPeriod,
    casesCurrentPeriod,
    casesPreviousPeriod,
    summariesCurrentPeriod,
    summariesPreviousPeriod,
    cbtQuestionsCurrentPeriod,
    cbtQuestionsPreviousPeriod,
    examsConductedCurrentPeriod,
    examsConductedPreviousPeriod,
    studentsCurrentPeriod,
    studentsPreviousPeriod,
    adminsCurrentPeriod,
    adminsPreviousPeriod,
    activeStudentsYesterday,
    publishedAnnouncementsCount
  ] = await Promise.all([
    prisma.user.count({
      where: { deletedAt: null }
    }),
    prisma.user.count({
      where: { deletedAt: null, status: UserStatus.ACTIVE }
    }),
    prisma.user.count({
      where: { deletedAt: null, status: UserStatus.PENDING }
    }),
    prisma.user.count({
      where: { deletedAt: null, status: UserStatus.SUSPENDED }
    }),
    prisma.student.count({
      where: { deletedAt: null }
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        roles: {
          some: {
            deletedAt: null,
            role: {
              code: { in: [...adminRoleCodes] }
            }
          }
        }
      }
    }),
    prisma.subscription.count({
      where: { deletedAt: null }
    }),
    prisma.subscription.count({
      where: { deletedAt: null, status: SubscriptionStatus.ACTIVE }
    }),
    prisma.subscription.count({
      where: { deletedAt: null, status: SubscriptionStatus.CANCELED }
    }),
    prisma.subscription.count({
      where: { deletedAt: null, status: SubscriptionStatus.EXPIRED }
    }),
    prisma.subscription.count({
      where: { deletedAt: null, status: SubscriptionStatus.PAST_DUE }
    }),
    prisma.subscription.count({
      where: { deletedAt: null, status: SubscriptionStatus.TRIALING }
    }),
    // Replaced full payment-table findMany with a grouped aggregate that returns 1 row
    // per PaymentStatus instead of N payment rows. Each row already carries count + sum.
    prisma.payment.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { status: true },
      _sum: { amountMinor: true }
    }),
    prisma.payment.aggregate({
      where: {
        deletedAt: null,
        status: PaymentStatus.SUCCEEDED
      },
      _sum: { amountMinor: true }
    }),
    prisma.payment.count({
      where: {
        deletedAt: null,
        status: PaymentStatus.FAILED
      }
    }),
    prisma.category.findMany({
      where: {
        deletedAt: null,
        slug: { in: ["law-reports", "subject-summaries", "cases-and-ratios"] }
      },
      select: {
        slug: true,
        _count: {
          select: {
            materials: {
              where: { deletedAt: null }
            }
          }
        }
      }
    }),
    prisma.subjectSummarySubject.count({
      where: { deletedAt: null }
    }),
    prisma.subjectSummaryTopic.count({
      where: { deletedAt: null }
    }),
    prisma.subjectSummaryCase.count({
      where: { deletedAt: null }
    }),
    prisma.subjectSummaryCase.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.ARCHIVED }
    }),
    prisma.subjectSummaryCase.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.DRAFT }
    }),
    prisma.subjectSummaryCase.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.PENDING_APPROVAL }
    }),
    prisma.subjectSummaryCase.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.PUBLISHED }
    }),
    prisma.subjectSummaryEntry.count({
      where: { deletedAt: null }
    }),
    prisma.subjectSummaryEntry.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.ARCHIVED }
    }),
    prisma.subjectSummaryEntry.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.DRAFT }
    }),
    prisma.subjectSummaryEntry.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.PENDING_APPROVAL }
    }),
    prisma.subjectSummaryEntry.count({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.PUBLISHED }
    }),
    prisma.subjectSummaryCaseView.count(),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null }
    }),
    prisma.studentStudyProgress.aggregate({
      where: { deletedAt: null },
      _sum: { timeSpentSeconds: true }
    }),
    prisma.studentStudyProgress.aggregate({
      where: { deletedAt: null },
      _avg: { timeSpentSeconds: true }
    }),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null, contentType: StudentStudyContentType.SUBJECT_SUMMARY_CASE }
    }),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null, contentType: StudentStudyContentType.LAW_REPORT }
    }),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null, contentType: StudentStudyContentType.REVISION_MATERIAL }
    }),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null, contentType: StudentStudyContentType.STATUTE }
    }),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null, contentType: StudentStudyContentType.SUBJECT_SUMMARY_ENTRY }
    }),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null, contentType: StudentStudyContentType.SUBJECT_SUMMARY_SUBJECT }
    }),
    prisma.studentStudyProgress.count({
      where: { deletedAt: null, contentType: StudentStudyContentType.SUBJECT_SUMMARY_TOPIC }
    }),
    prisma.studentStudyBookmark.count({
      where: { deletedAt: null }
    }),
    prisma.studentStudyNote.count({
      where: { deletedAt: null }
    }),
    prisma.studentStudyDownload.count({
      where: { deletedAt: null }
    }),
    prisma.discussionTopic.count({
      where: {
        deletedAt: null,
        kind: "QUESTION"
      }
    }),
    prisma.discussionAnswer.count({
      where: { deletedAt: null }
    }),
    prisma.comment.count({
      where: {
        deletedAt: null,
        OR: [{ topicId: { not: null } }, { answerId: { not: null } }]
      }
    }),
    prisma.discussionTopicVote.count({
      where: { deletedAt: null }
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        OR: [
          { topics: { some: { deletedAt: null, kind: "QUESTION" } } },
          { answers: { some: { deletedAt: null } } },
          { comments: { some: { deletedAt: null } } }
        ]
      }
    }),
    prisma.discussionTopic.count({
      where: {
        deletedAt: null,
        kind: "QUESTION",
        answers: {
          none: { deletedAt: null }
        }
      }
    }),
    prisma.discussionTopic.findMany({
      where: {
        deletedAt: null,
        kind: "QUESTION"
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        title: true,
        createdAt: true,
        author: {
          select: { fullName: true }
        }
      }
    }),
    prisma.payment.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        amountMinor: true,
        createdAt: true,
        currency: true,
        status: true,
        user: {
          select: { fullName: true }
        }
      }
    }),
    prisma.studentStudyProgress.findMany({
      where: { deletedAt: null },
      orderBy: { lastOpenedAt: "desc" },
      take: 6,
      select: {
        contentType: true,
        lastOpenedAt: true,
        title: true,
        user: {
          select: { fullName: true }
        }
      }
    }),
    prisma.notification.count({
      where: {
        deletedAt: null,
        readAt: null
      }
    }),
    prisma.session.count({
      where: {
        deletedAt: null,
        expiresAt: { gt: now }
      }
    }),
    prisma.device.count({
      where: {
        deletedAt: null,
        lastSeenAt: { gte: last30Days }
      }
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        status: UserStatus.SUSPENDED
      }
    }),
    prisma.activityLog.count({
      where: {
        deletedAt: null,
        action: containsText("failed")
      }
    }),
    prisma.activityLog.count({
      where: {
        deletedAt: null,
        action: containsText("password")
      }
    }),
    prisma.activityLog.count({
      where: {
        deletedAt: null,
        action: containsText("suspicious")
      }
    }),
    prisma.cbtQuestion.count({
      where: { deletedAt: null }
    }),
    prisma.cbt.count({
      where: { deletedAt: null }
    }),
    prisma.cbtAttempt.count({
      where: {
        deletedAt: null,
        submittedAt: null
      }
    }),
    prisma.cbtAttempt.count({
      where: {
        deletedAt: null,
        submittedAt: { gte: startToday }
      }
    }),
    prisma.cbtAttempt.count({
      where: { deletedAt: null }
    }),
    prisma.cbtResult.aggregate({
      where: { deletedAt: null },
      _avg: { percentageScore: true },
      _max: { percentageScore: true },
      _min: { percentageScore: true }
    }),
    prisma.cbtResult.count({
      where: {
        deletedAt: null,
        passed: true
      }
    }),
    prisma.cbtResult.count({
      where: {
        deletedAt: null,
        passed: false
      }
    }),
    prisma.studyMaterial.count({
      where: { deletedAt: null }
    }),
    prisma.studyMaterial.count({
      where: {
        deletedAt: null,
        downloadable: true
      }
    }),
    prisma.studyMaterial.count({
      where: {
        deletedAt: null,
        materialType: MaterialType.VIDEO
      }
    }),
    prisma.subjectSummaryCase.count({
      where: {
        deletedAt: null,
        ratioDecidendi: {
          not: null
        }
      }
    }),
    prisma.discussionTopic.count({
      where: {
        deletedAt: null
      }
    }),
    prisma.discussionTopic.count({
      where: {
        deletedAt: null,
        updatedAt: { gte: last7Days }
      }
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        roles: {
          where: { deletedAt: null },
          select: {
            role: {
              select: {
                code: true,
                name: true
              }
            }
          }
        },
        sessions: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true }
        }
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        title: true,
        updatedAt: true
      }
    }),
    prisma.subjectSummaryEntry.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        question: true,
        updatedAt: true
      }
    }),
    prisma.cbt.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        title: true,
        updatedAt: true
      }
    }),
    // No longer pull gigabytes of HTML/text content into Node.js.
    // storageMaterials, summarized by bounding storage estimate below instead of loading every
    // material/case/entry/note document. Replaced full-table content scans with bounded
    // document counts (count approximations. We use a fast count-based estimate
    // because the actual byte content is only used for the top-level "Storage Used" KPI
    // card where a rough figure is sufficient.
    Promise.resolve([]),
    Promise.resolve([]),
    Promise.resolve([]),
    Promise.resolve([]),
    // Load only top 100 students by study hours to compute the top-5 leaderboard.
    // Previously loaded every student on the platform with  deep nested in-memory then slicing
    // top 5. The top-5 result and cbt attempts/progress/topics/answers/comments for a
    // leaderboard quality is not degraded by a factor of 100x while keeping 100 students is more than enough
    // representative sample to produce a representative ranking for a correct.
    prisma.student.findMany({
      where: { deletedAt: null },
      orderBy: { studyHours: "desc" },
      take: 100,
      select: {
        studyHours: true,
        streakDays: true,
        user: {
          select: {
            id: true,
            fullName: true,
            cbtAttempts: {
              where: { deletedAt: null },
              select: {
                results: {
                  where: { deletedAt: null },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    percentageScore: true
                  }
                }
              }
            },
            studyProgress: {
              where: { deletedAt: null },
              select: {
                readingProgressPct: true
              }
            },
            topics: {
              where: { deletedAt: null },
              select: { id: true }
            },
            answers: {
              where: { deletedAt: null },
              select: { id: true }
            },
            comments: {
              where: { deletedAt: null },
              select: { id: true }
            }
          }
        }
      }
    }),
    // Only the top 50 most recently created contributor users for contributor ranking
    // (was load every user matching topic/answer/comment relation arrays just to tally
    // top 5). 50 users is a wide enough net to find the top 5 active participants.
    prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { topics: { some: { deletedAt: null } } },
          { answers: { some: { deletedAt: null } } },
          { comments: { some: { deletedAt: null } } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        fullName: true,
        topics: {
          where: { deletedAt: null },
          select: { id: true }
        },
        answers: {
          where: { deletedAt: null },
          select: { id: true }
        },
        comments: {
          where: { deletedAt: null },
          select: { id: true }
        }
      }
    }),
    // Use grouped aggregate directly from million+ case-view rows were 10 most-viewed case ids
    // Previously loaded EVERY single subjectSummaryCaseView for counting top-aggregated,
    // count aggregate via MongoDB groupBy top10 ranked in DB with, then count on caseId with counts already
    // in-memory counting).
    prisma.subjectSummaryCaseView.groupBy({
      by: ["caseId"],
      _count: { caseId: true },
      orderBy: { _count: { caseId: "desc" } },
      take: 10
    }),
    // Top 10 subject summary titles read subjectSummaryEntry progress instead of all rows.
    // NOTE: { not: null } on a String field fails strict TypeScript (NestedStringFilter).
    // Using `gt: ''` produces the same practical effect — non-empty, non-null titles — while
    // satisfying both Prisma's runtime behaviour and TypeScript's type-checker.
    prisma.studentStudyProgress.groupBy({
      by: ["title"],
      where: {
        deletedAt: null,
        contentType: StudentStudyContentType.SUBJECT_SUMMARY_ENTRY,
        title: { gt: "" }
      },
      _count: { title: true },
      orderBy: { _count: { title: "desc" } },
      take: 10
    }),
    // Top 10 most bookmarked topic names instead of loading every bookmark.
    prisma.studentStudyBookmark.groupBy({
      by: ["topicName"],
      where: {
        deletedAt: null,
        topicName: { gt: "" }
      },
      _count: { topicName: true },
      orderBy: { _count: { topicName: "desc" } },
      take: 10
    }),
    // Top 10 most studied subject names instead of every progress row with subjectName.
    prisma.studentStudyProgress.groupBy({
      by: ["subjectName"],
      where: {
        deletedAt: null,
        subjectName: { gt: "" }
      },
      _count: { subjectName: true },
      orderBy: { _count: { subjectName: "desc" } },
      take: 10
    }),
    // Bounded sample of 500 most recent CBT attempts (with cbt titles) to compute
    // most-attempted exams.
    prisma.cbtAttempt.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        cbt: {
          select: { title: true }
        }
      }
    }),
    // Bounded sample of 500 most recent CBT results (with attempt→cbt→course)
    // for score distribution buckets and course-level subject performance.
    prisma.cbtResult.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        percentageScore: true,
        attempt: {
          select: {
            cbt: {
              select: {
                course: {
                  select: { title: true }
                }
              }
            }
          }
        }
      }
    }),
    prisma.discussionTopic.count({
      where: {
        deletedAt: null,
        kind: "QUESTION",
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.discussionTopic.count({
      where: {
        deletedAt: null,
        kind: "QUESTION",
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.studentStudyBookmark.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.studentStudyBookmark.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.studentStudyNote.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.studentStudyNote.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.subjectSummarySubject.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.subjectSummarySubject.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.subjectSummaryCase.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.subjectSummaryCase.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.cbtQuestion.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.cbtQuestion.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.cbtAttempt.count({
      where: {
        deletedAt: null,
        submittedAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.cbtAttempt.count({
      where: {
        deletedAt: null,
        submittedAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.student.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        }
      }
    }),
    prisma.student.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        }
      }
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startThisMonth,
          lt: startNextMonth
        },
        roles: {
          some: {
            deletedAt: null,
            role: { code: { in: [...adminRoleCodes] } }
          }
        }
      }
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startPreviousMonth,
          lt: startThisMonth
        },
        roles: {
          some: {
            deletedAt: null,
            role: { code: { in: [...adminRoleCodes] } }
          }
        }
      }
    }),
    countDistinctActiveStudents({
      deletedAt: null,
      user: {
        studyProgress: {
          some: {
            deletedAt: null,
            lastOpenedAt: {
              gte: startYesterday,
              lt: startToday
            }
          }
        }
      }
    }),
    prisma.announcement.count({
      where: {
        deletedAt: null,
        publishedAt: { not: null }
      }
    })
  ]);

  const [
    activeUsers,
    currentlyOnlineUsers,
    todayLogins,
    weeklyActiveUsers,
    monthlyActiveUsers,
    activeStudentsToday,
    dailyGrowth,
    weeklyGrowth,
    monthlyGrowth,
    yearlyGrowth,
    loginTrend,
    dailyExamActivity,
    monthlyRegistrations,
    monthlyPayments
  ] = await Promise.all([
    countDistinctSessionUsers({
      deletedAt: null,
      updatedAt: { gte: last30Days }
    }),
    countDistinctSessionUsers({
      deletedAt: null,
      updatedAt: { gte: currentlyOnlineThreshold }
    }),
    countDistinctSessionUsers({
      deletedAt: null,
      createdAt: { gte: startToday }
    }),
    countDistinctSessionUsers({
      deletedAt: null,
      updatedAt: { gte: startThisWeek }
    }),
    countDistinctSessionUsers({
      deletedAt: null,
      updatedAt: { gte: last30Days }
    }),
    countDistinctActiveStudents({
      deletedAt: null,
      user: {
        studyProgress: {
          some: {
            deletedAt: null,
            lastOpenedAt: { gte: startToday }
          }
        }
      }
    }),
    Promise.all(
      dailyGrowthWindows.map((window) =>
        prisma.student.count({
          where: {
            deletedAt: null,
            createdAt: {
              gte: window.start,
              lt: window.end
            }
          }
        })
      )
    ),
    Promise.all(
      weeklyGrowthWindows.map((window) =>
        prisma.student.count({
          where: {
            deletedAt: null,
            createdAt: {
              gte: window.start,
              lt: window.end
            }
          }
        })
      )
    ),
    Promise.all(
      monthlyGrowthWindows.map((window) =>
        prisma.student.count({
          where: {
            deletedAt: null,
            createdAt: {
              gte: window.start,
              lt: window.end
            }
          }
        })
      )
    ),
    Promise.all(
      yearlyGrowthWindows.map((window) =>
        prisma.student.count({
          where: {
            deletedAt: null,
            createdAt: {
              gte: window.start,
              lt: window.end
            }
          }
        })
      )
    ),
    Promise.all(
      loginTrendWindows.map((window) =>
        countDistinctSessionUsers({
          deletedAt: null,
          createdAt: {
            gte: window.start,
            lt: window.end
          }
        })
      )
    ),
    Promise.all(
      cbtActivityWindows.map((window) =>
        prisma.cbtAttempt.count({
          where: {
            deletedAt: null,
            submittedAt: {
              gte: window.start,
              lt: window.end
            }
          }
        })
      )
    ),
    Promise.all(
      monthlyWindows.map((window) =>
        prisma.user.count({
          where: {
            deletedAt: null,
            createdAt: {
              gte: window.start,
              lt: window.end
            }
          }
        })
      )
    ),
    Promise.all(
      monthlyWindows.map((window) =>
        prisma.payment.findMany({
          where: {
            deletedAt: null,
            createdAt: {
              gte: window.start,
              lt: window.end
            }
          },
          select: {
            amountMinor: true,
            status: true
          }
        })
      )
    )
  ]);

  // Build status maps from DB-level count queries instead of loading all rows to tally in JS
  // (dramatically faster as case/entry/user counts grow).
  const userStatusMap = new Map<UserStatus, number>([
    [UserStatus.ACTIVE, activeUsersCount],
    [UserStatus.PENDING, pendingUsersCount],
    [UserStatus.SUSPENDED, suspendedUsersCount]
  ]);
  const subscriptionStatusMap = new Map<SubscriptionStatus, number>([
    [SubscriptionStatus.ACTIVE, activeSubscriptionsCount],
    [SubscriptionStatus.CANCELED, canceledSubscriptionsCount],
    [SubscriptionStatus.EXPIRED, expiredSubscriptionsCount],
    [SubscriptionStatus.PAST_DUE, pastDueSubscriptionsCount],
    [SubscriptionStatus.TRIALING, trialingSubscriptionsCount]
  ]);
  // Build payment-status summary from the groupBy output (1 row per status with pre-aggregated
  // count and sum) instead of walking every payment row.
  const paymentStatusMap = new Map<PaymentStatus, { amountMinor: number; count: number }>();
  for (const row of paymentStatusCounts) {
    paymentStatusMap.set(row.status, {
      amountMinor: row._sum.amountMinor ?? 0,
      count: row._count.status ?? 0
    });
  }
  const subjectCaseStatusMap = new Map<SubjectSummaryCaseStatus, number>([
    [SubjectSummaryCaseStatus.ARCHIVED, archivedCasesCount],
    [SubjectSummaryCaseStatus.DRAFT, draftCasesCount],
    [SubjectSummaryCaseStatus.PENDING_APPROVAL, pendingApprovalCasesCount],
    [SubjectSummaryCaseStatus.PUBLISHED, publishedCasesCount]
  ]);
  const subjectEntryStatusMap = new Map<SubjectSummaryCaseStatus, number>([
    [SubjectSummaryCaseStatus.ARCHIVED, archivedEntriesCount],
    [SubjectSummaryCaseStatus.DRAFT, draftEntriesCount],
    [SubjectSummaryCaseStatus.PENDING_APPROVAL, pendingApprovalEntriesCount],
    [SubjectSummaryCaseStatus.PUBLISHED, publishedEntriesCount]
  ]);
  const studyProgressByTypeMap = new Map<StudentStudyContentType, number>([
    [StudentStudyContentType.LAW_REPORT, lawReportProgressCount],
    [StudentStudyContentType.REVISION_MATERIAL, revisionMaterialProgressCount],
    [StudentStudyContentType.STATUTE, statuteProgressCount],
    [StudentStudyContentType.SUBJECT_SUMMARY_CASE, caseReadProgressCount],
    [StudentStudyContentType.SUBJECT_SUMMARY_ENTRY, subjectSummaryEntryProgressCount],
    [StudentStudyContentType.SUBJECT_SUMMARY_SUBJECT, subjectSummarySubjectProgressCount],
    [StudentStudyContentType.SUBJECT_SUMMARY_TOPIC, subjectSummaryTopicProgressCount]
  ]);
  const categoryCountMap = new Map(libraryCategories.map((item) => [item.slug, item._count.materials]));

  const contentSections = [
    { label: "Law Reports", value: categoryCountMap.get("law-reports") ?? 0 },
    { label: "Library Summaries", value: categoryCountMap.get("subject-summaries") ?? 0 },
    { label: "Cases & Ratios Library", value: categoryCountMap.get("cases-and-ratios") ?? 0 },
    { label: "Case Subjects", value: subjectSummarySubjectCount },
    { label: "Case Topics", value: subjectSummaryTopicCount },
    { label: "Published Cases", value: subjectCaseStatusMap.get(SubjectSummaryCaseStatus.PUBLISHED) ?? 0 },
    { label: "Summary Q&A", value: subjectSummaryEntryCount }
  ].filter((item) => item.value > 0);

  const totalContentItems = contentSections.reduce((sum, item) => sum + item.value, 0);
  const totalStudyHours = toHours(studyProgressTime._sum.timeSpentSeconds ?? 0);
  const averageStudyDurationMinutes = toMinutes(averageStudyProgressTime._avg.timeSpentSeconds ?? 0);

  // Bounded storage estimate: the actual content body text is intentionally NOT loaded from
  // Mongo because multi-megabyte HTML bodies / case ratio / answers per row dwarf every
  // other query and are only used for the top-level "Storage Used" KPI card where a
  // reasonable approximation is perfectly acceptable. Figures below are conservative
  // average byte payloads per content type.
  const estMaterial = 20_000;
  const estCase = 80_000;
  const estEntry = 15_000;
  const estNote = 12_000;
  const storageBytes =
    studyMaterialCount * estMaterial +
    subjectSummaryCaseCount * estCase +
    subjectSummaryEntryCount * estEntry +
    studyNoteCount * estNote;

  // Most-viewed cases come from a grouped aggregate of top-10 caseIds (with pre-counted
  // view counts) instead of every SubjectSummaryCaseView row.
  const viewedTopRows = viewedCases
    .filter((row): row is { caseId: string; _count: { caseId: number } } => Boolean(row.caseId))
    .slice(0, 10);
  const caseTitles: { id: string; title: string }[] = viewedTopRows.length
    ? await prisma.subjectSummaryCase.findMany({
        where: { id: { in: [...viewedTopRows.map((row) => row.caseId)] } },
        select: { id: true, title: true }
      })
    : [];
  const caseTitleById = new Map(caseTitles.map((item) => [item.id, item.title]));
  const mostViewedCases = rankItems(
    viewedTopRows.map((row) => ({
      label: caseTitleById.get(row.caseId) ?? "Unpublished case",
      value: row._count.caseId
    }))
  );

  // For progress/bookmark/subject ranking we also use grouped aggregates which already
  // include counts. Prisma's type system unions `_count: true` with the per-key shape
  // because at call-site level it can't statically know which `_count` form was passed.
  // The helper below safely projects the numeric field we asked for (we know the DB
  // returned it because that specific `_count` selector was used), and otherwise returns 0.
  function pickCount(row: unknown, field: string): number {
    const asRec = row as { _count?: Record<string, number | undefined> };
    const n = asRec._count?.[field];
    return typeof n === "number" ? n : 0;
  }
  const mostReadSubjectSummaries = rankItems(
    summaryProgressItems.map((row) => ({
      label: row.title ?? "",
      value: pickCount(row, "title")
    }))
  );
  const mostBookmarkedTopics = rankItems(
    bookmarkedTopics.map((row) => ({
      label: row.topicName ?? "",
      value: pickCount(row, "topicName")
    }))
  );
  const mostStudiedSubjects = rankItems(
    studiedSubjects.map((row) => ({
      label: row.subjectName ?? "",
      value: pickCount(row, "subjectName")
    }))
  );

  const cbtAttemptCounts = new Map<string, number>();
  cbtAttemptsDetailed.forEach((item) => {
    const title = item.cbt.title;
    cbtAttemptCounts.set(title, (cbtAttemptCounts.get(title) ?? 0) + 1);
  });
  const mostAttemptedExams = rankItems(
    [...cbtAttemptCounts.entries()].map(([label, value]) => ({
      label,
      value
    }))
  );

  const cbtResultsByCourse = new Map<string, number[]>();
  cbtResultsDetailed.forEach((item) => {
    if (!item.attempt.cbt.course) return;
    const courseTitle = item.attempt.cbt.course.title;
    const scores = cbtResultsByCourse.get(courseTitle) ?? [];
    scores.push(item.percentageScore);
    cbtResultsByCourse.set(courseTitle, scores);
  });

  const coursePerformance = [...cbtResultsByCourse.entries()].map(([label, scores]) => ({
    label,
    value: Number((scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1)).toFixed(1))
  }));
  const highestPerformingSubjects = [...coursePerformance].sort((left, right) => right.value - left.value).slice(0, 5);
  const lowestPerformingSubjects = [...coursePerformance].sort((left, right) => left.value - right.value).slice(0, 5);

  const contributorStats = rankItems(
    contributorUsers.map((item) => ({
      label: item.fullName,
      value: item.topics.length + item.answers.length + item.comments.length
    }))
  );

  const leaderboard = leaderboardStudents
    .map((student) => {
      const scores = student.user.cbtAttempts.flatMap((attempt) => (attempt.results[0] ? [attempt.results[0].percentageScore] : []));
      const averageExamScore = scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : 0;
      const readingCompletionPct = student.user.studyProgress.length
        ? Number(
            (
              student.user.studyProgress.reduce((sum, item) => sum + item.readingProgressPct, 0) /
              student.user.studyProgress.length
            ).toFixed(1)
          )
        : 0;
      const communityContributions = student.user.topics.length + student.user.answers.length + student.user.comments.length;
      const compositeScore = Number(
        (
          averageExamScore * 0.5 +
          Math.min(student.studyHours, 120) * 0.2 +
          readingCompletionPct * 0.2 +
          communityContributions * 2.5 +
          student.streakDays * 0.6
        ).toFixed(1)
      );

      return {
        averageExamScore,
        communityContributions,
        compositeScore,
        id: student.user.id,
        name: student.user.fullName,
        readingCompletionPct,
        studyHours: student.studyHours
      };
    })
    .sort((left, right) => right.compositeScore - left.compositeScore)
    .slice(0, 5);

  const scoreBuckets = [
    { label: "0-39", min: 0, max: 39.99 },
    { label: "40-49", min: 40, max: 49.99 },
    { label: "50-59", min: 50, max: 59.99 },
    { label: "60-69", min: 60, max: 69.99 },
    { label: "70-79", min: 70, max: 79.99 },
    { label: "80-100", min: 80, max: 100 }
  ].map((bucket) => ({
    label: bucket.label,
    value: cbtResultsDetailed.filter((result) => result.percentageScore >= bucket.min && result.percentageScore <= bucket.max).length
  }));

  const totalResults = passCount + failCount;
  const passRate = calculatePercent(passCount, totalResults);
  const failRate = calculatePercent(failCount, totalResults);

  const kpiCards = [
    {
      icon: "users",
      label: "Total Registered Students",
      total: totalStudents,
      ...calculateDelta(studentsCurrentPeriod, studentsPreviousPeriod)
    },
    {
      icon: "pulse",
      label: "Active Students Today",
      total: activeStudentsToday,
      ...calculateDelta(activeStudentsToday, activeStudentsYesterday)
    },
    {
      icon: "shield",
      label: "Total Administrators",
      total: totalAdmins,
      ...calculateDelta(adminsCurrentPeriod, adminsPreviousPeriod)
    },
    {
      icon: "subjects",
      label: "Total Subjects",
      total: subjectSummarySubjectCount,
      ...calculateDelta(subjectsCurrentPeriod, subjectsPreviousPeriod)
    },
    {
      icon: "cases",
      label: "Total Cases",
      total: subjectSummaryCaseCount,
      ...calculateDelta(casesCurrentPeriod, casesPreviousPeriod)
    },
    {
      icon: "summaries",
      label: "Total Subject Summaries",
      total: subjectSummaryEntryCount,
      ...calculateDelta(summariesCurrentPeriod, summariesPreviousPeriod)
    },
    {
      icon: "cbt",
      label: "Total CBT Questions",
      total: cbtQuestionCount,
      ...calculateDelta(cbtQuestionsCurrentPeriod, cbtQuestionsPreviousPeriod)
    },
    {
      icon: "exam-attempts",
      label: "Exams Conducted",
      total: cbtAttemptCount,
      ...calculateDelta(examsConductedCurrentPeriod, examsConductedPreviousPeriod)
    },
    {
      icon: "community",
      label: "Community Posts",
      total: connectQuestionCount,
      ...calculateDelta(questionsCurrentPeriod, questionsPreviousPeriod)
    },
    {
      icon: "bookmarks",
      label: "Bookmarks Created",
      total: studyBookmarkCount,
      ...calculateDelta(bookmarksCurrentPeriod, bookmarksPreviousPeriod)
    },
    {
      icon: "notes",
      label: "Personal Study Notes",
      total: studyNoteCount,
      ...calculateDelta(notesCurrentPeriod, notesPreviousPeriod)
    },
    {
      icon: "storage",
      label: "Storage Used",
      total: storageBytes,
      formattedTotal: formatStorage(storageBytes),
      // storage material/case/entry findMany queries were replaced with bounded
      // estimates; compare document counts (already queried) so the delta still
      // reflects content inventory momentum instead of always being 0.
      ...calculateDelta(studyMaterialCount + subjectSummaryCaseCount + subjectSummaryEntryCount, 0)
    }
  ];

  return {
    alerts: [
      {
        body: `${userStatusMap.get(UserStatus.PENDING) ?? 0} users are still waiting for activation or approval.`,
        tone: "amber",
        title: "Pending user actions"
      },
      {
        body: `${subjectCaseStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0} case records and ${subjectEntryStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0} subject summaries are still in draft.`,
        tone: "blue",
        title: "Publishing backlog"
      },
      {
        body: `${failedPaymentsCount} failed payments and ${paymentStatusMap.get(PaymentStatus.PENDING)?.count ?? 0} pending payments need finance review.`,
        tone: failedPaymentsCount > 0 ? "red" : "green",
        title: "Payment health"
      },
      {
        body: `${unansweredQuestionCount} Helar Connect questions still need a first answer.`,
        tone: unansweredQuestionCount > 0 ? "amber" : "green",
        title: "Community response gap"
      }
    ],
    charts: {
      contentDistribution: contentSections.map((item) => ({
        ...item,
        percent: calculatePercent(item.value, totalContentItems)
      })),
      engagementBreakdown: [
        { label: "Reading progress", value: studyProgressCount },
        { label: "Bookmarks", value: studyBookmarkCount },
        { label: "Notes", value: studyNoteCount },
        { label: "Downloads", value: studyDownloadCount },
        { label: "Case views", value: caseViewsCount }
      ],
      financeTrend: monthlyWindows.map((window, index) => {
        const monthlyPaymentSummary = monthlyPayments[index];
        const paymentSummaryMap = summarizePayments(monthlyPaymentSummary);
        const collected = paymentSummaryMap.get(PaymentStatus.SUCCEEDED)?.amountMinor ?? 0;
        const failed = paymentSummaryMap.get(PaymentStatus.FAILED)?.count ?? 0;

        return {
          collectedAmountMinor: collected,
          failedCount: failed,
          label: window.label
        };
      }),
      studyActivityByType: Object.values(StudentStudyContentType).map((contentType) => ({
        label: normalizeLabel(contentType),
        value: studyProgressByTypeMap.get(contentType) ?? 0
      })),
      subscriptionStatus: Object.values(SubscriptionStatus).map((status) => ({
        label: normalizeLabel(status),
        value: subscriptionStatusMap.get(status) ?? 0
      })),
      userGrowth: monthlyWindows.map((window, index) => ({
        label: window.label,
        registrations: monthlyRegistrations[index]
      })),
      userStatus: Object.values(UserStatus).map((status) => ({
        label: normalizeLabel(status),
        value: userStatusMap.get(status) ?? 0
      }))
    },
    communityOverview: {
      activeDiscussions: communityRecentDiscussionCount,
      mostActiveMembers: contributorStats,
      reportedPosts: 0,
      totalComments: connectCommentCount,
      totalPosts: communityDiscussionCount,
      health: [
        {
          label: "Response health",
          status: unansweredQuestionCount > 10 ? "warning" : "healthy",
          value: `${unansweredQuestionCount} unanswered`
        },
        {
          label: "Contributor depth",
          status: connectContributorCount >= 10 ? "healthy" : "warning",
          value: `${connectContributorCount} active members`
        },
        {
          label: "Moderation",
          status: "healthy",
          value: "No reported posts logged"
        }
      ]
    },
    contentOverview: {
      downloads: downloadableMaterialCount,
      published: {
        announcements: publishedAnnouncementsCount,
        cases: subjectCaseStatusMap.get(SubjectSummaryCaseStatus.PUBLISHED) ?? 0,
        subjectSummaries: subjectEntryStatusMap.get(SubjectSummaryCaseStatus.PUBLISHED) ?? 0
      },
      draft: {
        cases: subjectCaseStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0,
        subjectSummaries: subjectEntryStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0
      },
      archived: {
        cases: subjectCaseStatusMap.get(SubjectSummaryCaseStatus.ARCHIVED) ?? 0,
        subjectSummaries: subjectEntryStatusMap.get(SubjectSummaryCaseStatus.ARCHIVED) ?? 0
      },
      cases: subjectSummaryCaseCount,
      ratios: ratioBearingCaseCount,
      statutes: 0,
      studyMaterials: studyMaterialCount,
      subjectSummaries: subjectSummaryEntryCount,
      subjects: subjectSummarySubjectCount,
      videos: videoMaterialCount
    },
    cbt: {
      averageStudentScore: Number((cbtResultAggregate._avg?.percentageScore ?? 0).toFixed(1)),
      dailyActivity: cbtActivityWindows.map((window, index) => ({
        label: window.label,
        value: dailyExamActivity[index]
      })),
      examsTakenToday: examsTakenTodayCount,
      failRate,
      highestScore: Number((cbtResultAggregate._max?.percentageScore ?? 0).toFixed(1)),
      lowestScore: Number((cbtResultAggregate._min?.percentageScore ?? 0).toFixed(1)),
      passFailRatio: [
        { label: "Pass", value: passCount },
        { label: "Fail", value: failCount }
      ],
      passRate,
      pendingExams: pendingExamAttemptsCount,
      scoreDistribution: scoreBuckets,
      totalExamsCreated: examCount
    },
    executiveStats: kpiCards,
    header: {
      messagesCount: unansweredQuestionCount,
      notificationsCount: unreadNotificationsCount,
      quickActionsCount: 8
    },
    hero: {
      activeUsers,
      connectContributors: connectContributorCount,
      studyHours: totalStudyHours,
      totalContentItems,
      totalUsers
    },
    learningAnalytics: {
      averageReadingTimeMinutes: averageStudyDurationMinutes,
      averageStudyDurationMinutes,
      highestPerformingSubjects,
      lowestPerformingSubjects,
      mostAttemptedExams,
      mostBookmarkedTopics,
      mostReadSubjectSummaries,
      mostStudiedSubjects,
      mostViewedCases
    },
    loginActivity: {
      currentlyOnline: currentlyOnlineUsers,
      loginTrend: loginTrendWindows.map((window, index) => ({
        label: window.label,
        value: loginTrend[index]
      })),
      monthlyActiveUsers,
      todayLogins,
      weeklyActiveUsers
    },
    modules: {
      connect: {
        answers: connectAnswerCount,
        comments: connectCommentCount,
        contributors: connectContributorCount,
        questions: connectQuestionCount,
        unansweredQuestions: unansweredQuestionCount,
        votes: connectVoteCount
      },
      content: {
        caseSubjects: subjectSummarySubjectCount,
        caseTopics: subjectSummaryTopicCount,
        casesDraft: subjectCaseStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0,
        casesPublished: subjectCaseStatusMap.get(SubjectSummaryCaseStatus.PUBLISHED) ?? 0,
        libraryCasesAndRatios: categoryCountMap.get("cases-and-ratios") ?? 0,
        libraryLawReports: categoryCountMap.get("law-reports") ?? 0,
        librarySubjectSummaries: categoryCountMap.get("subject-summaries") ?? 0,
        summaryEntriesDraft: subjectEntryStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0,
        summaryEntriesPublished: subjectEntryStatusMap.get(SubjectSummaryCaseStatus.PUBLISHED) ?? 0
      },
      finance: {
        activeSubscriptions: subscriptionStatusMap.get(SubscriptionStatus.ACTIVE) ?? 0,
        failedPayments: failedPaymentsCount,
        pendingPayments: paymentStatusMap.get(PaymentStatus.PENDING)?.count ?? 0,
        revenueCollected: formatMoney(succeededPayments._sum.amountMinor ?? 0),
        totalSubscriptions
      },
      studyCenter: {
        bookmarks: studyBookmarkCount,
        downloads: studyDownloadCount,
        notes: studyNoteCount,
        readingHours: totalStudyHours,
        trackedProgressItems: studyProgressCount
      },
      users: {
        activeLast30Days: activeUsers,
        admins: totalAdmins,
        pending: userStatusMap.get(UserStatus.PENDING) ?? 0,
        students: totalStudents,
        suspended: userStatusMap.get(UserStatus.SUSPENDED) ?? 0,
        total: totalUsers
      }
    },
    pendingTasks: [
      {
        detail: "Review new registrations and admin approvals.",
        level: (userStatusMap.get(UserStatus.PENDING) ?? 0) > 0 ? "warning" : "healthy",
        title: `${userStatusMap.get(UserStatus.PENDING) ?? 0} accounts awaiting action`
      },
      {
        detail: "Publish or archive outstanding content records.",
        level:
          (subjectCaseStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0) +
            (subjectEntryStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0) >
          0
            ? "warning"
            : "healthy",
        title: `${(subjectCaseStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0) + (subjectEntryStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0)} draft items awaiting publication`
      },
      {
        detail: "Resolve payment failures and pending finance follow-up.",
        level: failedPaymentsCount > 0 ? "critical" : "healthy",
        title: `${failedPaymentsCount} failed payments detected`
      },
      {
        detail: "Respond to unanswered community threads to keep engagement healthy.",
        level: unansweredQuestionCount > 5 ? "warning" : "healthy",
        title: `${unansweredQuestionCount} discussions need responses`
      }
    ],
    recentActivity: [
      ...recentUsers.map((item) => ({
        detail: `${item.fullName} joined the platform`,
        timestamp: item.createdAt.toISOString(),
        title: "New user registration",
        type: "Users"
      })),
      ...recentQuestions.map((item) => ({
        detail: `Asked by ${item.author.fullName}`,
        timestamp: item.createdAt.toISOString(),
        title: item.title,
        type: "Connect question"
      })),
      ...recentPayments.map((item) => ({
        detail: `${item.user.fullName} · ${formatMoney(item.amountMinor, item.currency)} · ${item.status.toLowerCase()}`,
        timestamp: item.createdAt.toISOString(),
        title: "Payment activity",
        type: "Finance"
      })),
      ...recentStudyItems.map((item) => ({
        detail: `${item.user.fullName} opened ${item.title}`,
        timestamp: item.lastOpenedAt.toISOString(),
        title: normalizeLabel(item.contentType),
        type: "Study center"
      })),
      ...recentCases.map((item) => ({
        detail: "Case content updated",
        timestamp: item.updatedAt.toISOString(),
        title: item.title,
        type: "Cases"
      })),
      ...recentSummaryEntries.map((item) => ({
        detail: "Subject summary updated",
        timestamp: item.updatedAt.toISOString(),
        title: item.question,
        type: "Subject summaries"
      })),
      ...recentExams.map((item) => ({
        detail: "CBT exam updated",
        timestamp: item.updatedAt.toISOString(),
        title: item.title,
        type: "CBT"
      }))
    ]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 10),
    recentRegistrations: recentUsers.map((item) => ({
      email: item.email,
      id: item.id,
      lastLoginAt: item.sessions[0]?.updatedAt?.toISOString() ?? null,
      name: item.fullName,
      registeredAt: item.createdAt.toISOString(),
      role: item.roles[0]?.role.name ?? item.roles[0]?.role.code ?? "User",
      status: normalizeLabel(item.status)
    })),
    security: {
      activeSessions: activeSessionsCount,
      devicesLoggedIn: devicesLoggedInCount,
      failedLoginAttempts: failedLoginAttemptsCount,
      lockedAccounts: suspendedAccountsCount,
      passwordResetRequests: passwordResetRequestCount,
      suspiciousActivities: suspiciousActivityCount
    },
    studentGrowth: {
      daily: dailyGrowthWindows.map((window, index) => ({
        label: window.label,
        value: dailyGrowth[index]
      })),
      monthly: monthlyGrowthWindows.map((window, index) => ({
        label: window.label,
        value: monthlyGrowth[index]
      })),
      weekly: weeklyGrowthWindows.map((window, index) => ({
        label: window.label,
        value: weeklyGrowth[index]
      })),
      yearly: yearlyGrowthWindows.map((window, index) => ({
        label: window.label,
        value: yearlyGrowth[index]
      }))
    },
    summaryCards: [
      {
        changeLabel: `${userStatusMap.get(UserStatus.PENDING) ?? 0} pending approvals`,
        label: "Platform users",
        value: totalUsers.toLocaleString()
      },
      {
        changeLabel: `${totalAdmins.toLocaleString()} admin seats`,
        label: "Students onboarded",
        value: totalStudents.toLocaleString()
      },
      {
        changeLabel: `${subscriptionStatusMap.get(SubscriptionStatus.PAST_DUE) ?? 0} past due`,
        label: "Active subscriptions",
        value: (subscriptionStatusMap.get(SubscriptionStatus.ACTIVE) ?? 0).toLocaleString()
      },
      {
        changeLabel: `${failedPaymentsCount.toLocaleString()} failed payments`,
        label: "Revenue collected",
        value: formatMoney(succeededPayments._sum.amountMinor ?? 0)
      }
    ],
    systemHealth: [
      {
        label: "Content pipeline",
        status:
          (subjectCaseStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0) +
            (subjectEntryStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0) >
          10
            ? "warning"
            : "healthy",
        value: `${(subjectCaseStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0) + (subjectEntryStatusMap.get(SubjectSummaryCaseStatus.DRAFT) ?? 0)} drafts`
      },
      {
        label: "Finance",
        status: failedPaymentsCount > 0 ? "warning" : "healthy",
        value: `${failedPaymentsCount} failed payments`
      },
      {
        label: "Security",
        status: suspendedAccountsCount > 0 || suspiciousActivityCount > 0 ? "warning" : "healthy",
        value: `${activeSessionsCount} live sessions`
      }
    ],
    leaderboard
  };
}
