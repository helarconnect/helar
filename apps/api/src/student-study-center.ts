import { StudentStudyContentType, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";

const progressInputSchema = z
  .object({
    completed: z.boolean().optional(),
    contentKey: z.string().trim().min(3).max(255),
    contentType: z.nativeEnum(StudentStudyContentType),
    lastPositionLabel: z.string().trim().max(120).optional(),
    path: z.string().trim().min(1).max(500),
    readingProgressPct: z.coerce.number().min(0).max(100).optional(),
    scrollProgressPct: z.coerce.number().min(0).max(100).optional(),
    subjectName: z.string().trim().max(160).optional(),
    timeSpentSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
    title: z.string().trim().min(2).max(220),
    topicName: z.string().trim().max(160).optional()
  })
  .strict();

const bookmarkInputSchema = z
  .object({
    contentKey: z.string().trim().min(3).max(255),
    contentType: z.nativeEnum(StudentStudyContentType),
    note: z.string().trim().max(1_000).optional().default(""),
    path: z.string().trim().min(1).max(500),
    subjectName: z.string().trim().max(160).optional(),
    title: z.string().trim().min(2).max(220),
    topicName: z.string().trim().max(160).optional()
  })
  .strict();

const notesQuerySchema = z.object({
  search: z.string().trim().max(120).default("")
});

const notesInputSchema = z
  .object({
    attachmentUrls: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    contentHtml: z.string().trim().max(100_000),
    contentKey: z.string().trim().min(3).max(255).optional(),
    contentPlainText: z.string().trim().max(20_000),
    contentType: z.nativeEnum(StudentStudyContentType).optional(),
    isDraft: z.boolean().optional().default(false),
    isFavorite: z.boolean().optional().default(false),
    path: z.string().trim().max(500).optional(),
    referenceTitle: z.string().trim().max(220).optional(),
    subjectName: z.string().trim().max(160).optional(),
    title: z.string().trim().min(2).max(220),
    topicName: z.string().trim().max(160).optional()
  })
  .strict();

const searchQuerySchema = z.object({
  query: z.string().trim().min(2).max(120)
});

const downloadInputSchema = z
  .object({
    contentKey: z.string().trim().min(3).max(255),
    contentType: z.nativeEnum(StudentStudyContentType),
    fileName: z.string().trim().min(2).max(220),
    path: z.string().trim().min(1).max(500),
    subjectName: z.string().trim().max(160).optional(),
    title: z.string().trim().min(2).max(220),
    topicName: z.string().trim().max(160).optional()
  })
  .strict();

const bookmarkQuerySchema = z.object({
  contentType: z.nativeEnum(StudentStudyContentType).optional(),
  search: z.string().trim().max(120).default(""),
  sortBy: z.enum(["date", "subject", "title", "topic"]).default("date")
});

const progressQuerySchema = z.object({
  contentKey: z.string().trim().min(3).max(255)
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function weekdayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const notDeletedStudyProgressWhere: Prisma.StudentStudyProgressWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedStudyBookmarkWhere: Prisma.StudentStudyBookmarkWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedStudyNoteWhere: Prisma.StudentStudyNoteWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedStudyDownloadWhere: Prisma.StudentStudyDownloadWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

function buildAchievementBadges(params: {
  completedItems: number;
  streakDays: number;
  totalBookmarks: number;
  totalSeconds: number;
  totalTrackedItems: number;
  weeklyStudyDays: number;
}) {
  const badges: Array<{ description: string; label: string; tone: "amber" | "blue" | "emerald" }> = [];

  if (params.streakDays >= 3) {
    badges.push({
      description: "You have shown up consistently across multiple reading days.",
      label: `${params.streakDays}-day study streak`,
      tone: "amber"
    });
  }

  if (params.totalSeconds >= 60 * 60) {
    badges.push({
      description: "Your tracked study time has crossed the one-hour mark.",
      label: "1+ hour of tracked study",
      tone: "emerald"
    });
  }

  if (params.totalBookmarks >= 5) {
    badges.push({
      description: "You are actively organizing materials for fast review.",
      label: "Organized reader",
      tone: "blue"
    });
  }

  if (params.completedItems >= 3) {
    badges.push({
      description: "You have fully completed multiple tracked reading items.",
      label: "Completion momentum",
      tone: "emerald"
    });
  }

  if (params.weeklyStudyDays >= 4) {
    badges.push({
      description: "You kept your reading rhythm active on most days this week.",
      label: "Consistent this week",
      tone: "amber"
    });
  }

  if (!badges.length) {
    badges.push({
      description: params.totalTrackedItems > 0 ? "Your reading history is being tracked. Keep going to unlock more badges." : "Open library materials and your first study badge will appear here.",
      label: params.totalTrackedItems > 0 ? "Study journey started" : "Ready to begin",
      tone: "blue"
    });
  }

  return badges.slice(0, 4);
}

export function parseStudyProgressInput(input: unknown) {
  return progressInputSchema.parse(input);
}

export function parseStudyBookmarkInput(input: unknown) {
  return bookmarkInputSchema.parse(input);
}

export function parseStudyNotesQuery(query: Record<string, string | string[] | undefined>) {
  return notesQuerySchema.parse(query);
}

export function parseStudyNoteInput(input: unknown) {
  return notesInputSchema.parse(input);
}

export function parseStudySearchQuery(query: Record<string, string | string[] | undefined>) {
  return searchQuerySchema.parse(query);
}

export function parseStudyDownloadInput(input: unknown) {
  return downloadInputSchema.parse(input);
}

export function parseStudyBookmarkQuery(query: Record<string, string | string[] | undefined>) {
  return bookmarkQuerySchema.parse(query);
}

export function parseStudyProgressQuery(query: Record<string, string | string[] | undefined>) {
  return progressQuerySchema.parse(query);
}

export async function upsertStudentStudyProgress(userId: string, input: z.infer<typeof progressInputSchema>) {
  const existing = await prisma.studentStudyProgress.findUnique({
    where: {
      userId_contentKey: {
        contentKey: input.contentKey,
        userId
      }
    }
  });

  const payload = {
    completed: input.completed ?? existing?.completed ?? false,
    contentType: input.contentType,
    lastOpenedAt: new Date(),
    lastPositionLabel: input.lastPositionLabel ?? existing?.lastPositionLabel ?? null,
    path: input.path,
    readingProgressPct: typeof input.readingProgressPct === "number" ? Math.max(existing?.readingProgressPct ?? 0, input.readingProgressPct) : existing?.readingProgressPct ?? 0,
    scrollProgressPct: typeof input.scrollProgressPct === "number" ? input.scrollProgressPct : existing?.scrollProgressPct ?? 0,
    subjectName: input.subjectName?.trim() || null,
    timeSpentSeconds: (existing?.timeSpentSeconds ?? 0) + (input.timeSpentSeconds ?? 0),
    title: input.title,
    topicName: input.topicName?.trim() || null
  };

  const progress = existing
    ? await prisma.studentStudyProgress.update({
        where: {
          id: existing.id
        },
        data: payload
      })
    : await prisma.studentStudyProgress.create({
        data: {
          ...payload,
          contentKey: input.contentKey,
          userId
        }
      });

  return {
    ...progress,
    createdAt: progress.createdAt.toISOString(),
    lastOpenedAt: progress.lastOpenedAt.toISOString(),
    updatedAt: progress.updatedAt.toISOString()
  };
}

export async function getStudentStudyProgress(userId: string, contentKey: string) {
  const progress = await prisma.studentStudyProgress.findUnique({
    where: {
      userId_contentKey: {
        contentKey,
        userId
      }
    }
  });

  if (!progress || progress.deletedAt) {
    return null;
  }

  return {
    ...progress,
    createdAt: progress.createdAt.toISOString(),
    lastOpenedAt: progress.lastOpenedAt.toISOString(),
    updatedAt: progress.updatedAt.toISOString()
  };
}

export async function listStudentStudyBookmarks(userId: string, query: z.infer<typeof bookmarkQuerySchema>) {
  const orderBy =
    query.sortBy === "title"
      ? [{ title: "asc" as const }, { createdAt: "desc" as const }]
      : query.sortBy === "subject"
        ? [{ subjectName: "asc" as const }, { createdAt: "desc" as const }]
        : query.sortBy === "topic"
          ? [{ topicName: "asc" as const }, { createdAt: "desc" as const }]
          : [{ createdAt: "desc" as const }];

  const items = await prisma.studentStudyBookmark.findMany({
    where: {
      ...notDeletedStudyBookmarkWhere,
      userId,
      ...(query.contentType ? { contentType: query.contentType } : {}),
      ...(query.search
        ? {
            OR: [
              { title: containsText(query.search) },
              { subjectName: containsText(query.search) },
              { topicName: containsText(query.search) },
              { note: containsText(query.search) }
            ]
          }
        : {})
    },
    orderBy
  });

  return {
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}

export async function addStudentStudyBookmark(userId: string, input: z.infer<typeof bookmarkInputSchema>) {
  const existing = await prisma.studentStudyBookmark.findUnique({
    where: {
      userId_contentKey: {
        contentKey: input.contentKey,
        userId
      }
    }
  });

  const bookmark = existing
    ? await prisma.studentStudyBookmark.update({
        where: { id: existing.id },
        data: {
          contentType: input.contentType,
          deletedAt: null,
          note: input.note || null,
          path: input.path,
          subjectName: input.subjectName?.trim() || null,
          title: input.title,
          topicName: input.topicName?.trim() || null
        }
      })
    : await prisma.studentStudyBookmark.create({
        data: {
          contentKey: input.contentKey,
          contentType: input.contentType,
          note: input.note || null,
          path: input.path,
          subjectName: input.subjectName?.trim() || null,
          title: input.title,
          topicName: input.topicName?.trim() || null,
          userId
        }
      });

  return {
    ...bookmark,
    createdAt: bookmark.createdAt.toISOString(),
    updatedAt: bookmark.updatedAt.toISOString()
  };
}

export async function removeStudentStudyBookmark(userId: string, bookmarkId: string) {
  const bookmark = await prisma.studentStudyBookmark.findFirst({
    where: {
      ...notDeletedStudyBookmarkWhere,
      id: bookmarkId,
      userId
    }
  });

  if (!bookmark) {
    return null;
  }

  await prisma.studentStudyBookmark.update({
    where: {
      id: bookmark.id
    },
    data: {
      deletedAt: new Date()
    }
  });

  return {
    success: true
  };
}

export async function listStudentStudyNotes(userId: string, query: z.infer<typeof notesQuerySchema>) {
  const items = await prisma.studentStudyNote.findMany({
    where: {
      ...notDeletedStudyNoteWhere,
      userId,
      ...(query.search
        ? {
            OR: [
              { title: containsText(query.search) },
              { referenceTitle: containsText(query.search) },
              { subjectName: containsText(query.search) },
              { topicName: containsText(query.search) },
              { contentPlainText: containsText(query.search) }
            ]
          }
        : {})
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}

export async function createStudentStudyNote(userId: string, input: z.infer<typeof notesInputSchema>) {
  const note = await prisma.studentStudyNote.create({
    data: {
      attachmentUrls: input.attachmentUrls,
      contentHtml: input.contentHtml,
      contentKey: input.contentKey?.trim() || null,
      contentPlainText: input.contentPlainText,
      contentType: input.contentType ?? null,
      isDraft: input.isDraft ?? false,
      isFavorite: input.isFavorite ?? false,
      path: input.path?.trim() || null,
      referenceTitle: input.referenceTitle?.trim() || null,
      subjectName: input.subjectName?.trim() || null,
      title: input.title,
      topicName: input.topicName?.trim() || null,
      userId
    }
  });

  return {
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString()
  };
}

export async function updateStudentStudyNote(userId: string, noteId: string, input: z.infer<typeof notesInputSchema>) {
  const existing = await prisma.studentStudyNote.findFirst({
    where: {
      ...notDeletedStudyNoteWhere,
      id: noteId,
      userId
    }
  });

  if (!existing) {
    return null;
  }

  const note = await prisma.studentStudyNote.update({
    where: {
      id: noteId
    },
    data: {
      attachmentUrls: input.attachmentUrls,
      contentHtml: input.contentHtml,
      contentKey: input.contentKey?.trim() || null,
      contentPlainText: input.contentPlainText,
      contentType: input.contentType ?? null,
      isDraft: input.isDraft ?? false,
      isFavorite: input.isFavorite ?? false,
      path: input.path?.trim() || null,
      referenceTitle: input.referenceTitle?.trim() || null,
      subjectName: input.subjectName?.trim() || null,
      title: input.title,
      topicName: input.topicName?.trim() || null
    }
  });

  return {
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString()
  };
}

export async function deleteStudentStudyNote(userId: string, noteId: string) {
  const existing = await prisma.studentStudyNote.findFirst({
    where: {
      ...notDeletedStudyNoteWhere,
      id: noteId,
      userId
    }
  });

  if (!existing) {
    return null;
  }

  await prisma.studentStudyNote.update({
    where: {
      id: existing.id
    },
    data: {
      deletedAt: new Date()
    }
  });

  return {
    success: true
  };
}

export async function recordStudentStudyDownload(userId: string, input: z.infer<typeof downloadInputSchema>) {
  const download = await prisma.studentStudyDownload.create({
    data: {
      contentKey: input.contentKey,
      contentType: input.contentType,
      fileName: input.fileName,
      path: input.path,
      subjectName: input.subjectName?.trim() || null,
      title: input.title,
      topicName: input.topicName?.trim() || null,
      userId
    }
  });

  return {
    ...download,
    createdAt: download.createdAt.toISOString(),
    updatedAt: download.updatedAt.toISOString()
  };
}

export async function listStudentStudyDownloads(userId: string, query: z.infer<typeof notesQuerySchema>) {
  const items = await prisma.studentStudyDownload.findMany({
    where: {
      ...notDeletedStudyDownloadWhere,
      userId,
      ...(query.search
        ? {
            OR: [
              { fileName: containsText(query.search) },
              { title: containsText(query.search) },
              { subjectName: containsText(query.search) },
              { topicName: containsText(query.search) }
            ]
          }
        : {})
    },
    orderBy: [{ createdAt: "desc" }]
  });

  return {
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}

export async function searchStudentStudyCenter(userId: string, query: z.infer<typeof searchQuerySchema>) {
  const [bookmarks, notes, downloads, history] = await Promise.all([
    prisma.studentStudyBookmark.findMany({
      where: {
        ...notDeletedStudyBookmarkWhere,
        userId,
        OR: [
          { title: containsText(query.query) },
          { subjectName: containsText(query.query) },
          { topicName: containsText(query.query) }
        ]
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5
    }),
    prisma.studentStudyNote.findMany({
      where: {
        ...notDeletedStudyNoteWhere,
        userId,
        OR: [
          { title: containsText(query.query) },
          { referenceTitle: containsText(query.query) },
          { contentPlainText: containsText(query.query) }
        ]
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5
    }),
    prisma.studentStudyDownload.findMany({
      where: {
        ...notDeletedStudyDownloadWhere,
        userId,
        OR: [
          { fileName: containsText(query.query) },
          { title: containsText(query.query) }
        ]
      },
      orderBy: [{ createdAt: "desc" }],
      take: 5
    }),
    prisma.studentStudyProgress.findMany({
      where: {
        ...notDeletedStudyProgressWhere,
        userId,
        OR: [
          { title: containsText(query.query) },
          { subjectName: containsText(query.query) },
          { topicName: containsText(query.query) }
        ]
      },
      orderBy: [{ lastOpenedAt: "desc" }],
      take: 6
    })
  ]);

  return {
    items: [
      ...bookmarks.map((item) => ({
        id: item.id,
        kind: "bookmark" as const,
        label: item.title,
        meta: [item.subjectName, item.topicName].filter(Boolean).join(" / "),
        path: item.path
      })),
      ...notes.map((item) => ({
        id: item.id,
        kind: "note" as const,
        label: item.title,
        meta: item.referenceTitle || [item.subjectName, item.topicName].filter(Boolean).join(" / "),
        path: item.path || "/app/dashboard"
      })),
      ...downloads.map((item) => ({
        id: item.id,
        kind: "download" as const,
        label: item.fileName,
        meta: item.title,
        path: item.path
      })),
      ...history.map((item) => ({
        id: item.id,
        kind: "history" as const,
        label: item.title,
        meta: [item.subjectName, item.topicName].filter(Boolean).join(" / "),
        path: item.path
      }))
    ].slice(0, 16)
  };
}

export async function getStudentStudyCenterDashboard(userId: string) {
  const [progressItems, bookmarks, downloads] = await Promise.all([
    prisma.studentStudyProgress.findMany({
      where: {
        ...notDeletedStudyProgressWhere,
        userId
      },
      orderBy: [{ lastOpenedAt: "desc" }]
    }),
    prisma.studentStudyBookmark.findMany({
      where: {
        ...notDeletedStudyBookmarkWhere,
        userId
      },
      orderBy: [{ createdAt: "desc" }],
      take: 6
    }),
    prisma.studentStudyDownload.findMany({
      where: {
        ...notDeletedStudyDownloadWhere,
        userId
      },
      orderBy: [{ createdAt: "desc" }],
      take: 6
    })
  ]);

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const weekStart = addDays(todayStart, -6);
  const monthStart = startOfMonth(now);

  const uniqueStudyDays = Array.from(
    new Set(progressItems.map((item) => dateKey(item.lastOpenedAt)).sort((left, right) => right.localeCompare(left)))
  );

  let streakDays = 0;
  let cursor = todayStart;

  while (uniqueStudyDays.includes(dateKey(cursor))) {
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  const todayItems = progressItems.filter((item) => item.lastOpenedAt >= todayStart && item.lastOpenedAt < tomorrowStart);
  const weekItems = progressItems.filter((item) => item.lastOpenedAt >= weekStart);
  const monthItems = progressItems.filter((item) => item.lastOpenedAt >= monthStart);

  const totalSeconds = progressItems.reduce((sum, item) => sum + item.timeSpentSeconds, 0);
  const todaySeconds = todayItems.reduce((sum, item) => sum + item.timeSpentSeconds, 0);
  const weekSeconds = weekItems.reduce((sum, item) => sum + item.timeSpentSeconds, 0);
  const monthSeconds = monthItems.reduce((sum, item) => sum + item.timeSpentSeconds, 0);
  const weeklyStudyDays = new Set(weekItems.map((item) => dateKey(item.lastOpenedAt))).size;
  const monthlyStudyDays = new Set(monthItems.map((item) => dateKey(item.lastOpenedAt))).size;
  const sessionsPerWeek = Number(weekItems.length.toFixed(1));
  const completedItems = progressItems.filter((item) => item.completed || item.readingProgressPct >= 100).length;
  const inProgressItems = progressItems.filter((item) => !item.completed && item.readingProgressPct > 0 && item.readingProgressPct < 100).length;

  const activeDayMap = new Map<string, number>();

  for (const item of progressItems) {
    const label = weekdayLabel(item.lastOpenedAt);
    activeDayMap.set(label, (activeDayMap.get(label) ?? 0) + item.timeSpentSeconds);
  }

  const mostActiveStudyDay = [...activeDayMap.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "No activity yet";
  const uncompletedItems = progressItems.filter((item) => !item.completed && item.readingProgressPct < 100);
  const dailyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(todayStart, index - 6);
    const dayItems = progressItems.filter((item) => dateKey(item.lastOpenedAt) === dateKey(date));
    const seconds = dayItems.reduce((sum, item) => sum + item.timeSpentSeconds, 0);

    return {
      date: date.toISOString(),
      label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      seconds,
      sessionCount: dayItems.length
    };
  });
  
  const continueReadingItem =
    uncompletedItems[0] ?? progressItems[0] ?? null;
  const lastStudiedTopic = progressItems.find((item) => item.topicName) ?? progressItems[0] ?? null;

  return {
    bookmarks: {
      items: bookmarks.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      })),
      total: bookmarks.length
    },
    continueReading: continueReadingItem
      ? {
          ...continueReadingItem,
          createdAt: continueReadingItem.createdAt.toISOString(),
          lastOpenedAt: continueReadingItem.lastOpenedAt.toISOString(),
          updatedAt: continueReadingItem.updatedAt.toISOString()
        }
      : null,
    downloads: {
      items: downloads.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      })),
      total: downloads.length
    },
    frequency: {
      averageStudySessionsPerWeek: sessionsPerWeek,
      dailyActivity,
      daysStudiedThisMonth: monthlyStudyDays,
      daysStudiedThisWeek: weeklyStudyDays,
      mostActiveStudyDay,
      streakDays
    },
    lastStudiedTopic: lastStudiedTopic
      ? {
          lastOpenedAt: lastStudiedTopic.lastOpenedAt.toISOString(),
          path: lastStudiedTopic.path,
          progressPct: lastStudiedTopic.readingProgressPct,
          subjectName: lastStudiedTopic.subjectName,
          title: lastStudiedTopic.title,
          topicName: lastStudiedTopic.topicName
        }
      : null,
    progress: {
      completedItems,
      inProgressItems,
      totalTrackedItems: progressItems.length
    },
    readingDuration: {
      monthlySeconds: monthSeconds,
      todaySeconds,
      totalSeconds,
      weeklySeconds: weekSeconds
    },
    recentlyOpened: progressItems.slice(0, 8).map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      lastOpenedAt: item.lastOpenedAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    })),
    recentlyViewedCases: progressItems
      .filter((item) => item.contentType === StudentStudyContentType.SUBJECT_SUMMARY_CASE)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        lastOpenedAt: item.lastOpenedAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      })),
    timeline: progressItems.slice(0, 12).map((item) => ({
      contentType: item.contentType,
      durationSeconds: item.timeSpentSeconds,
      id: item.id,
      lastOpenedAt: item.lastOpenedAt.toISOString(),
      lastPositionLabel: item.lastPositionLabel,
      path: item.path,
      progressPct: item.readingProgressPct,
      status: item.completed || item.readingProgressPct >= 100 ? "Completed" : item.readingProgressPct > 0 ? "In progress" : "Started",
      title: item.title
    })),
    unifiedSearchPlaceholder: "Search bookmarks, downloads, and reading history",
    achievements: buildAchievementBadges({
      completedItems,
      streakDays,
      totalBookmarks: bookmarks.length,
      totalSeconds,
      totalTrackedItems: progressItems.length,
      weeklyStudyDays
    })
  };
}
