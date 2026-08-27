import { StudentStudyContentType, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "./lib/prisma.js";
import { parseSearchDateRange } from "./lib/search-utils.js";
import { containsText } from "./lib/text-search.js";

// --- Case-insensitive + punctuation-tolerant search helpers (same semantics as portal-search) ---

function stripHtmlForSearch(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeStudySearchText(value: string): string {
  const withoutHtml = stripHtmlForSearch(value);
  const lower = withoutHtml.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized;
}

function tokenizeStudySearchQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalized = normalizeStudySearchText(trimmed);
  if (!normalized) return [];

  const tokens = new Set<string>();
  for (const term of normalized.split(" ")) {
    if (term.length >= 2) tokens.add(term);
  }

  // Also add collapsed-punctuation variant for serial-style tokens
  const collapsed = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (collapsed.length >= 3) tokens.add(collapsed);

  return Array.from(tokens);
}

function matchesStudySearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const terms = tokenizeStudySearchQuery(query);
  if (terms.length === 0) return true;

  const rawHaystack = fields.filter((f): f is string => typeof f === "string" && f.length > 0).join(" ");
  const haystack = normalizeStudySearchText(rawHaystack);
  const collapsedHaystack = rawHaystack.toLowerCase().replace(/[^a-z0-9]/g, "");

  return terms.every((term) => haystack.includes(term) || collapsedHaystack.includes(term));
}

// Generic deterministic sort helper with tiebreaks
function studyCompareWithTiebreak<T>(
  a: T,
  b: T,
  direction: "asc" | "desc",
  createdAtOf: (row: T) => Date,
  updatedAtOf?: (row: T) => Date
): number {
  const directionMul = direction === "asc" ? 1 : -1;
  // Primary: updatedAt if available, else createdAt
  const aPrimary = updatedAtOf ? updatedAtOf(a).getTime() : createdAtOf(a).getTime();
  const bPrimary = updatedAtOf ? updatedAtOf(b).getTime() : createdAtOf(b).getTime();
  let cmp = (aPrimary - bPrimary) * directionMul;
  if (cmp !== 0) return cmp;
  // Tiebreak 1: createdAt
  const aC = createdAtOf(a).getTime();
  const bC = createdAtOf(b).getTime();
  cmp = (aC - bC) * directionMul;
  if (cmp !== 0) return cmp;
  // Tiebreak 2: id ASC
  const aId = (a as { id: string }).id;
  const bId = (b as { id: string }).id;
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

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

function usesMongoRuntime() {
  return (process.env.DATABASE_URL ?? "").startsWith("mongodb");
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearchTerms(terms: string[], ...values: Array<string | null | undefined>) {
  if (!terms.length) {
    return true;
  }

  const haystack = values.map((value) => normalizeSearchText(value)).filter(Boolean).join(" ");
  if (!haystack) {
    return false;
  }

  const collapsedHaystack = haystack.replace(/[^a-z0-9]+/g, "");
  return terms.every((term) => haystack.includes(term) || collapsedHaystack.includes(term));
}

async function completeMongoMatches<T extends { id: string }>(params: {
  items: T[];
  limit: number;
  loadCandidates: () => Promise<T[]>;
  matches: (item: T) => boolean;
}) {
  if (!usesMongoRuntime() || params.items.length >= params.limit) {
    return params.items;
  }

  const completedItems = [...params.items];
  const seenIds = new Set(completedItems.map((item) => item.id));
  let candidates: T[] = [];

  try {
    candidates = await params.loadCandidates();
  } catch (error) {
    console.error(error);
    return completedItems;
  }

  for (const candidate of candidates) {
    if (seenIds.has(candidate.id)) {
      continue;
    }

    let isMatch = false;
    try {
      isMatch = params.matches(candidate);
    } catch (error) {
      console.error(error);
      isMatch = false;
    }

    if (!isMatch) {
      continue;
    }

    completedItems.push(candidate);
    seenIds.add(candidate.id);

    if (completedItems.length >= params.limit) {
      break;
    }
  }

  return completedItems;
}

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

  const trimmedSearch = query.search.trim();
  const hasActiveSearch = trimmedSearch.length >= 2;

  if (!hasActiveSearch) {
    const items = await prisma.studentStudyBookmark.findMany({
      where: {
        ...notDeletedStudyBookmarkWhere,
        userId,
        ...(query.contentType ? { contentType: query.contentType } : {})
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

  const baseWhere: Prisma.StudentStudyBookmarkWhereInput = {
    ...notDeletedStudyBookmarkWhere,
    userId,
    ...(query.contentType ? { contentType: query.contentType } : {})
  };
  const strictWhere: Prisma.StudentStudyBookmarkWhereInput = {
    ...baseWhere,
    OR: [
      { title: containsText(trimmedSearch) },
      { subjectName: containsText(trimmedSearch) },
      { topicName: containsText(trimmedSearch) },
      { note: containsText(trimmedSearch) }
    ]
  };
  const broadWhere: Prisma.StudentStudyBookmarkWhereInput = baseWhere;

  const [strictRows, broadRows] = await Promise.all([
    prisma.studentStudyBookmark.findMany({ where: strictWhere, orderBy }),
    prisma.studentStudyBookmark.findMany({ where: broadWhere, orderBy })
  ]);

  const mergedMap = new Map<string, typeof strictRows[number]>();
  for (const row of strictRows) mergedMap.set(row.id, row);
  for (const row of broadRows) if (!mergedMap.has(row.id)) mergedMap.set(row.id, row);

  const merged = Array.from(mergedMap.values());
  const matched = merged.filter((row) =>
    matchesStudySearch(trimmedSearch, row.title, row.subjectName, row.topicName, row.note)
  );

  matched.sort((a, b) => {
    let cmp = 0;
    if (query.sortBy === "title") {
      cmp = (a.title ?? "").localeCompare(b.title ?? "");
    } else if (query.sortBy === "subject") {
      cmp = (a.subjectName ?? "").localeCompare(b.subjectName ?? "");
    } else if (query.sortBy === "topic") {
      cmp = (a.topicName ?? "").localeCompare(b.topicName ?? "");
    }
    if (cmp !== 0) return cmp;
    return studyCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt);
  });

  return {
    items: matched.map((item) => ({
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
  const orderBy = [{ updatedAt: "desc" as const }];
  const trimmedSearch = query.search.trim();
  const hasActiveSearch = trimmedSearch.length >= 2;

  if (!hasActiveSearch) {
    const items = await prisma.studentStudyNote.findMany({
      where: {
        ...notDeletedStudyNoteWhere,
        userId
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

  const baseWhere: Prisma.StudentStudyNoteWhereInput = {
    ...notDeletedStudyNoteWhere,
    userId
  };
  const strictWhere: Prisma.StudentStudyNoteWhereInput = {
    ...baseWhere,
    OR: [
      { title: containsText(trimmedSearch) },
      { referenceTitle: containsText(trimmedSearch) },
      { subjectName: containsText(trimmedSearch) },
      { topicName: containsText(trimmedSearch) },
      { contentPlainText: containsText(trimmedSearch) }
    ]
  };
  const broadWhere: Prisma.StudentStudyNoteWhereInput = baseWhere;

  const [strictRows, broadRows] = await Promise.all([
    prisma.studentStudyNote.findMany({ where: strictWhere, orderBy }),
    prisma.studentStudyNote.findMany({ where: broadWhere, orderBy })
  ]);

  const mergedMap = new Map<string, typeof strictRows[number]>();
  for (const row of strictRows) mergedMap.set(row.id, row);
  for (const row of broadRows) if (!mergedMap.has(row.id)) mergedMap.set(row.id, row);

  const merged = Array.from(mergedMap.values());
  const matched = merged.filter((row) =>
    matchesStudySearch(trimmedSearch, row.title, row.referenceTitle, row.subjectName, row.topicName, row.contentPlainText)
  );

  matched.sort((a, b) => studyCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt));

  return {
    items: matched.map((item) => ({
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
  const orderBy = [{ createdAt: "desc" as const }];
  const trimmedSearch = query.search.trim();
  const hasActiveSearch = trimmedSearch.length >= 2;

  if (!hasActiveSearch) {
    const items = await prisma.studentStudyDownload.findMany({
      where: {
        ...notDeletedStudyDownloadWhere,
        userId
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

  const baseWhere: Prisma.StudentStudyDownloadWhereInput = {
    ...notDeletedStudyDownloadWhere,
    userId
  };
  const strictWhere: Prisma.StudentStudyDownloadWhereInput = {
    ...baseWhere,
    OR: [
      { fileName: containsText(trimmedSearch) },
      { title: containsText(trimmedSearch) },
      { subjectName: containsText(trimmedSearch) },
      { topicName: containsText(trimmedSearch) }
    ]
  };
  const broadWhere: Prisma.StudentStudyDownloadWhereInput = baseWhere;

  const [strictRows, broadRows] = await Promise.all([
    prisma.studentStudyDownload.findMany({ where: strictWhere, orderBy }),
    prisma.studentStudyDownload.findMany({ where: broadWhere, orderBy })
  ]);

  const mergedMap = new Map<string, typeof strictRows[number]>();
  for (const row of strictRows) mergedMap.set(row.id, row);
  for (const row of broadRows) if (!mergedMap.has(row.id)) mergedMap.set(row.id, row);

  const merged = Array.from(mergedMap.values());
  const matched = merged.filter((row) =>
    matchesStudySearch(trimmedSearch, row.fileName, row.title, row.subjectName, row.topicName)
  );

  matched.sort((a, b) => studyCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt));

  return {
    items: matched.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}

export async function searchStudentStudyCenter(userId: string, query: z.infer<typeof searchQuerySchema>) {
  const dateRange = parseSearchDateRange(query.query);
  const trimmedSearch = query.query.trim();
  const hasActiveSearch = trimmedSearch.length >= 2;

  const bookmarkBaseWhere: Prisma.StudentStudyBookmarkWhereInput = {
    ...notDeletedStudyBookmarkWhere,
    userId
  };
  const bookmarkDateRangeWhere: Prisma.StudentStudyBookmarkWhereInput | undefined = dateRange
    ? {
        OR: [
          { createdAt: { gte: dateRange.start, lt: dateRange.end } },
          { updatedAt: { gte: dateRange.start, lt: dateRange.end } }
        ]
      }
    : undefined;
  const bookmarkStrictTermsWhere: Prisma.StudentStudyBookmarkWhereInput = hasActiveSearch
    ? {
        OR: [
          { title: containsText(trimmedSearch) },
          { subjectName: containsText(trimmedSearch) },
          { topicName: containsText(trimmedSearch) },
          { note: containsText(trimmedSearch) }
        ]
      }
    : {};
  const bookmarkStrictWhere: Prisma.StudentStudyBookmarkWhereInput = dateRange
    ? { ...bookmarkBaseWhere, OR: [bookmarkStrictTermsWhere, bookmarkDateRangeWhere!] }
    : { ...bookmarkBaseWhere, ...bookmarkStrictTermsWhere };
  const bookmarkBroadWhere: Prisma.StudentStudyBookmarkWhereInput = dateRange
    ? { ...bookmarkBaseWhere, ...bookmarkDateRangeWhere }
    : bookmarkBaseWhere;

  const notesBaseWhere: Prisma.StudentStudyNoteWhereInput = {
    ...notDeletedStudyNoteWhere,
    userId
  };
  const notesDateRangeWhere: Prisma.StudentStudyNoteWhereInput | undefined = dateRange
    ? {
        OR: [
          { createdAt: { gte: dateRange.start, lt: dateRange.end } },
          { updatedAt: { gte: dateRange.start, lt: dateRange.end } }
        ]
      }
    : undefined;
  const notesStrictTermsWhere: Prisma.StudentStudyNoteWhereInput = hasActiveSearch
    ? {
        OR: [
          { title: containsText(trimmedSearch) },
          { referenceTitle: containsText(trimmedSearch) },
          { subjectName: containsText(trimmedSearch) },
          { topicName: containsText(trimmedSearch) },
          { contentPlainText: containsText(trimmedSearch) }
        ]
      }
    : {};
  const notesStrictWhere: Prisma.StudentStudyNoteWhereInput = dateRange
    ? { ...notesBaseWhere, OR: [notesStrictTermsWhere, notesDateRangeWhere!] }
    : { ...notesBaseWhere, ...notesStrictTermsWhere };
  const notesBroadWhere: Prisma.StudentStudyNoteWhereInput = dateRange
    ? { ...notesBaseWhere, ...notesDateRangeWhere }
    : notesBaseWhere;

  const downloadsBaseWhere: Prisma.StudentStudyDownloadWhereInput = {
    ...notDeletedStudyDownloadWhere,
    userId
  };
  const downloadsDateRangeWhere: Prisma.StudentStudyDownloadWhereInput | undefined = dateRange
    ? { createdAt: { gte: dateRange.start, lt: dateRange.end } }
    : undefined;
  const downloadsStrictTermsWhere: Prisma.StudentStudyDownloadWhereInput = hasActiveSearch
    ? {
        OR: [
          { fileName: containsText(trimmedSearch) },
          { title: containsText(trimmedSearch) },
          { subjectName: containsText(trimmedSearch) },
          { topicName: containsText(trimmedSearch) }
        ]
      }
    : {};
  const downloadsStrictWhere: Prisma.StudentStudyDownloadWhereInput = dateRange
    ? { ...downloadsBaseWhere, OR: [downloadsStrictTermsWhere, downloadsDateRangeWhere!] }
    : { ...downloadsBaseWhere, ...downloadsStrictTermsWhere };
  const downloadsBroadWhere: Prisma.StudentStudyDownloadWhereInput = dateRange
    ? { ...downloadsBaseWhere, ...downloadsDateRangeWhere }
    : downloadsBaseWhere;

  const historyBaseWhere: Prisma.StudentStudyProgressWhereInput = {
    ...notDeletedStudyProgressWhere,
    userId
  };
  const historyDateRangeWhere: Prisma.StudentStudyProgressWhereInput | undefined = dateRange
    ? {
        OR: [
          { createdAt: { gte: dateRange.start, lt: dateRange.end } },
          { updatedAt: { gte: dateRange.start, lt: dateRange.end } },
          { lastOpenedAt: { gte: dateRange.start, lt: dateRange.end } }
        ]
      }
    : undefined;
  const historyStrictTermsWhere: Prisma.StudentStudyProgressWhereInput = hasActiveSearch
    ? {
        OR: [
          { title: containsText(trimmedSearch) },
          { subjectName: containsText(trimmedSearch) },
          { topicName: containsText(trimmedSearch) },
          { lastPositionLabel: containsText(trimmedSearch) }
        ]
      }
    : {};
  const historyStrictWhere: Prisma.StudentStudyProgressWhereInput = dateRange
    ? { ...historyBaseWhere, OR: [historyStrictTermsWhere, historyDateRangeWhere!] }
    : { ...historyBaseWhere, ...historyStrictTermsWhere };
  const historyBroadWhere: Prisma.StudentStudyProgressWhereInput = dateRange
    ? { ...historyBaseWhere, ...historyDateRangeWhere }
    : historyBaseWhere;

  const [
    strictBookmarks, broadBookmarks,
    strictNotes, broadNotes,
    strictDownloads, broadDownloads,
    strictHistory, broadHistory
  ] = await Promise.all([
    prisma.studentStudyBookmark.findMany({ where: bookmarkStrictWhere, orderBy: [{ updatedAt: "desc" }] }),
    prisma.studentStudyBookmark.findMany({ where: bookmarkBroadWhere, orderBy: [{ updatedAt: "desc" }] }),
    prisma.studentStudyNote.findMany({ where: notesStrictWhere, orderBy: [{ updatedAt: "desc" }] }),
    prisma.studentStudyNote.findMany({ where: notesBroadWhere, orderBy: [{ updatedAt: "desc" }] }),
    prisma.studentStudyDownload.findMany({ where: downloadsStrictWhere, orderBy: [{ createdAt: "desc" }] }),
    prisma.studentStudyDownload.findMany({ where: downloadsBroadWhere, orderBy: [{ createdAt: "desc" }] }),
    prisma.studentStudyProgress.findMany({ where: historyStrictWhere, orderBy: [{ lastOpenedAt: "desc" }] }),
    prisma.studentStudyProgress.findMany({ where: historyBroadWhere, orderBy: [{ lastOpenedAt: "desc" }] })
  ]);

  function mergeById<T extends { id: string }>(strict: T[], broad: T[]): T[] {
    const map = new Map<string, T>();
    for (const row of strict) map.set(row.id, row);
    for (const row of broad) if (!map.has(row.id)) map.set(row.id, row);
    return Array.from(map.values());
  }

  const mergedBookmarks = mergeById(strictBookmarks, broadBookmarks);
  const matchedBookmarks = mergedBookmarks.filter((row) => {
    const textMatch = hasActiveSearch
      ? matchesStudySearch(trimmedSearch, row.title, row.subjectName, row.topicName, row.note)
      : true;
    const dateMatch = dateRange
      ? (row.createdAt >= dateRange.start && row.createdAt < dateRange.end) ||
        (row.updatedAt >= dateRange.start && row.updatedAt < dateRange.end)
      : false;
    return textMatch || dateMatch;
  });
  matchedBookmarks.sort((a, b) => studyCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt));
  const finalBookmarks = matchedBookmarks.slice(0, 5);

  const mergedNotes = mergeById(strictNotes, broadNotes);
  const matchedNotes = mergedNotes.filter((row) => {
    const textMatch = hasActiveSearch
      ? matchesStudySearch(trimmedSearch, row.title, row.referenceTitle, row.subjectName, row.topicName, row.contentPlainText)
      : true;
    const dateMatch = dateRange
      ? (row.createdAt >= dateRange.start && row.createdAt < dateRange.end) ||
        (row.updatedAt >= dateRange.start && row.updatedAt < dateRange.end)
      : false;
    return textMatch || dateMatch;
  });
  matchedNotes.sort((a, b) => studyCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt));
  const finalNotes = matchedNotes.slice(0, 5);

  const mergedDownloads = mergeById(strictDownloads, broadDownloads);
  const matchedDownloads = mergedDownloads.filter((row) => {
    const textMatch = hasActiveSearch
      ? matchesStudySearch(trimmedSearch, row.fileName, row.title, row.subjectName, row.topicName)
      : true;
    const dateMatch = dateRange
      ? row.createdAt >= dateRange.start && row.createdAt < dateRange.end
      : false;
    return textMatch || dateMatch;
  });
  matchedDownloads.sort((a, b) => studyCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt));
  const finalDownloads = matchedDownloads.slice(0, 5);

  const mergedHistory = mergeById(strictHistory, broadHistory);
  const matchedHistory = mergedHistory.filter((row) => {
    const textMatch = hasActiveSearch
      ? matchesStudySearch(trimmedSearch, row.title, row.subjectName, row.topicName, row.lastPositionLabel)
      : true;
    const dateMatch = dateRange
      ? (row.createdAt >= dateRange.start && row.createdAt < dateRange.end) ||
        (row.updatedAt >= dateRange.start && row.updatedAt < dateRange.end) ||
        (row.lastOpenedAt >= dateRange.start && row.lastOpenedAt < dateRange.end)
      : false;
    return textMatch || dateMatch;
  });
  matchedHistory.sort((a, b) => {
    const directionMul = -1;
    const aPrimary = a.lastOpenedAt.getTime();
    const bPrimary = b.lastOpenedAt.getTime();
    let cmp = (aPrimary - bPrimary) * directionMul;
    if (cmp !== 0) return cmp;
    return studyCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt);
  });
  const finalHistory = matchedHistory.slice(0, 6);

  return {
    items: [
      ...finalBookmarks.map((item) => ({
        id: item.id,
        kind: "bookmark" as const,
        label: item.title,
        meta: [item.subjectName, item.topicName].filter(Boolean).join(" / "),
        path: item.path
      })),
      ...finalNotes.map((item) => ({
        id: item.id,
        kind: "note" as const,
        label: item.title,
        meta: item.referenceTitle || [item.subjectName, item.topicName].filter(Boolean).join(" / "),
        path: item.path || "/app/dashboard"
      })),
      ...finalDownloads.map((item) => ({
        id: item.id,
        kind: "download" as const,
        label: item.fileName,
        meta: item.title,
        path: item.path
      })),
      ...finalHistory.map((item) => ({
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
