import {
  SubjectSummaryCaseStatus,
  SubjectSummaryDifficulty,
  SubjectSummaryModuleType,
  StudentStudyContentType,
  type Prisma
} from "@prisma/client";
import { z } from "zod";

import { recordIdSchema } from "./lib/record-id.js";
import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";
import { getPremiumContentAccess, truncateWords, PREMIUM_PREVIEW_WORD_LIMIT, createPreviewHtml } from "./premium-access.js";
import { runInTransaction } from "./lib/transactions.js";

function coerceSubjectSummaryModuleType(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "NLS") {
    return SubjectSummaryModuleType.HANDBOOK;
  }

  if (normalized === "FACULTY") {
    return SubjectSummaryModuleType.TEXTBOOK;
  }

  return value;
}

const subjectSummaryModuleTypeSchema = z
  .preprocess(coerceSubjectSummaryModuleType, z.nativeEnum(SubjectSummaryModuleType))
  .default(SubjectSummaryModuleType.TEXTBOOK);

const notDeletedWhere = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
} satisfies Prisma.SubjectSummaryEntryWhereInput;

const notDeletedSubjectWhere = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
} satisfies Prisma.SubjectSummarySubjectWhereInput;

const entryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  // 90 questions per page is the shared default between FACULTY/NLS admin +
  // student views; max 1000 for rare bulk exports.
  pageSize: z.coerce.number().int().min(1).max(1_000).default(90),
  search: z.string().trim().max(160).default(""),
  // serialNumber uses the canonical Helar-FAC-100 / Helar-NLS-100 format, and
  // sorts numerically by suffix so Helar-FAC-100 correctly renders DESC before
  // Helar-FAC-99 (lexical sort alone would invert them).
  sortBy: z.enum(["createdAt", "displayOrder", "question", "serialNumber", "updatedAt"]).default("serialNumber"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.union([z.nativeEnum(SubjectSummaryCaseStatus), z.literal("all")]).default("all"),
  subjectId: recordIdSchema.optional(),
  moduleType: subjectSummaryModuleTypeSchema,
  topic: z.string().trim().optional().default("")
});

const entryInputSchema = z
  .object({
    answer: z.string().trim().min(2),
    difficulty: z.nativeEnum(SubjectSummaryDifficulty).default(SubjectSummaryDifficulty.EASY),
    displayOrder: z.coerce.number().int().min(0).max(10_000).default(0),
    estimatedReadingTime: z.coerce.number().int().min(1).max(240).default(2),
    examTip: z.string().trim().optional().default(""),
    keyPrinciple: z.string().trim().optional().default(""),
    question: z.string().trim().min(2),
    relatedCaseIds: z.array(recordIdSchema).max(50).default([]),
    relatedStatutes: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
    status: z.nativeEnum(SubjectSummaryCaseStatus).default(SubjectSummaryCaseStatus.DRAFT),
    subjectId: recordIdSchema,
    tags: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    moduleType: subjectSummaryModuleTypeSchema,
    topic: z.string().trim().optional().default("")
  })
  .strict();

const topicBulkEntrySchema = z
  .object({
    answer: z.string().trim().min(2),
    difficulty: z.nativeEnum(SubjectSummaryDifficulty).default(SubjectSummaryDifficulty.EASY),
    estimatedReadingTime: z.coerce.number().int().min(1).max(240).default(2),
    examTip: z.string().trim().optional().default(""),
    keyPrinciple: z.string().trim().optional().default(""),
    question: z.string().trim().min(2),
    relatedCaseIds: z.array(recordIdSchema).max(50).default([]),
    relatedStatutes: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
    tags: z.array(z.string().trim().min(1).max(120)).max(50).default([])
  })
  .strict();

const topicBulkInputSchema = z
  .object({
    moduleType: subjectSummaryModuleTypeSchema,
    subjectId: recordIdSchema,
    topic: z.string().trim().min(2),
    status: z.nativeEnum(SubjectSummaryCaseStatus).default(SubjectSummaryCaseStatus.DRAFT),
    entries: z.array(topicBulkEntrySchema).min(1)
  })
  .strict();

const studentSubjectsQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  moduleType: subjectSummaryModuleTypeSchema
});

const studentEntriesQuerySchema = z.object({
  // 90 questions per page matches the admin default so both views show the same
  // volume of revision cards before the reader hits pagination controls.
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(1_000).default(90),
  filter: z.enum(["all", "bookmarked", "difficult", "easy", "read", "recentlyViewed", "unread"]).default("all"),
  query: z.string().trim().max(160).default(""),
  subjectId: recordIdSchema,
  moduleType: subjectSummaryModuleTypeSchema,
  topic: z.string().trim().optional().default("")
});

type EntryFilters = z.infer<typeof entryFiltersSchema>;
type EntryInput = z.infer<typeof entryInputSchema>;
type TopicBulkInput = z.infer<typeof topicBulkInputSchema>;
type StudentEntriesQuery = z.infer<typeof studentEntriesQuerySchema>;

const topicsQuerySchema = z.object({
  moduleType: subjectSummaryModuleTypeSchema,
  subjectId: recordIdSchema,
  status: z.union([z.nativeEnum(SubjectSummaryCaseStatus), z.literal("all")]).default("all")
});

const studentTopicsQuerySchema = z.object({
  moduleType: subjectSummaryModuleTypeSchema,
  subjectId: recordIdSchema
});

type TopicsQuery = z.infer<typeof topicsQuerySchema>;
type StudentTopicsQuery = z.infer<typeof studentTopicsQuerySchema>;

function normalizeList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function resolveEntryStatus(inputStatus: SubjectSummaryCaseStatus, actorRoleCodes: string[] = []) {
  if (actorRoleCodes.includes("content_admin") && inputStatus === SubjectSummaryCaseStatus.PUBLISHED) {
    return SubjectSummaryCaseStatus.PENDING_APPROVAL;
  }

  return inputStatus;
}

function entryContentKey(entryId: string) {
  return `SUBJECT_SUMMARY_ENTRY:${entryId}`;
}

function buildEntryWhere(filters: EntryFilters): Prisma.SubjectSummaryEntryWhereInput {
  return {
    ...notDeletedWhere,
    subject: {
      ...notDeletedSubjectWhere
    },
    moduleType: filters.moduleType,
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(filters.status === "all" ? {} : { status: filters.status }),
    ...(filters.search
      ? {
          OR: [
            {
              question: containsText(filters.search)
            },
            {
              answer: containsText(filters.search)
            },
            {
              topic: containsText(filters.search)
            },
            {
              keyPrinciple: containsText(filters.search)
            },
            {
              examTip: containsText(filters.search)
            },
            {
              // FACULTY / NLS entries are uniquely identified by their serial, so
              // users can look them up directly using the printed serial number.
              serialNumber: containsText(filters.search)
            },
            {
              subject: {
                name: containsText(filters.search)
              }
            },
            {
              caseLinks: {
                some: {
                  case: {
                    AND: [
                      {
                        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
                      },
                      {
                        OR: [
                          {
                            title: containsText(filters.search)
                          },
                          {
                            citation: containsText(filters.search)
                          },
                          {
                            ratioDecidendi: containsText(filters.search)
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      : {})
  };
}

function buildEntrySummaryWhere(filters: EntryFilters): Prisma.SubjectSummaryEntryWhereInput {
  return {
    ...notDeletedWhere,
    subject: {
      ...notDeletedSubjectWhere
    },
    moduleType: filters.moduleType,
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.topic ? { topic: filters.topic } : {})
  };
}

function mapEntry(item: {
  id: string;
  subjectId: string;
  moduleType: SubjectSummaryModuleType;
  topic: string | null;
  serialNumber: string | null;
  question: string;
  answer: string;
  keyPrinciple: string | null;
  examTip: string | null;
  relatedStatutes: string[];
  tags: string[];
  difficulty: SubjectSummaryDifficulty;
  estimatedReadingTime: number;
  displayOrder: number;
  status: SubjectSummaryCaseStatus;
  reviewFeedback: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  subject: {
    id: string;
    name: string;
  };
  caseLinks: Array<{
    case: {
      id: string;
      title: string;
      citation: string | null;
      court: string | null;
      ratioDecidendi: string | null;
      topic: {
        id: string;
        name: string;
      };
    };
  }>;
}) {
  return {
    answer: item.answer,
    createdAt: item.createdAt.toISOString(),
    createdBy: item.createdBy,
    difficulty: item.difficulty,
    displayOrder: item.displayOrder,
    estimatedReadingTime: item.estimatedReadingTime,
    examTip: item.examTip ?? "",
    id: item.id,
    keyPrinciple: item.keyPrinciple ?? "",
    moduleType: item.moduleType === SubjectSummaryModuleType.HANDBOOK ? "NLS" : "FACULTY",
    serialNumber: item.serialNumber ?? "",
    topic: item.topic ?? "",
    question: item.question,
    relatedCases: item.caseLinks.map((link) => ({
      citation: link.case.citation ?? "",
      court: link.case.court ?? "",
      id: link.case.id,
      path: `/app/library/subject-summaries/cases/${link.case.id}`,
      ratioDecidendi: link.case.ratioDecidendi ?? "",
      title: link.case.title,
      topic: {
        id: link.case.topic.id,
        name: link.case.topic.name
      }
    })),
    reviewFeedback: item.reviewFeedback ?? "",
    relatedStatutes: item.relatedStatutes,
    status: item.status,
    subject: {
      id: item.subject.id,
      name: item.subject.name
    },
    subjectId: item.subjectId,
    tags: item.tags,
    updatedAt: item.updatedAt.toISOString()
  };
}

function buildRestrictedEntryPreview(item: ReturnType<typeof mapEntry>) {
  const previewText = truncateWords([item.answer, item.keyPrinciple, item.examTip].filter(Boolean).join(" "), PREMIUM_PREVIEW_WORD_LIMIT).text;

  return {
    ...item,
    answer: createPreviewHtml(previewText, PREMIUM_PREVIEW_WORD_LIMIT),
    examTip: "",
    keyPrinciple: "",
    relatedCases: []
  };
}

function buildStreak(days: string[]) {
  if (!days.length) {
    return 0;
  }

  const sortedDays = [...new Set(days)].sort().reverse();
  let streak = 0;
  const cursor = new Date(`${sortedDays[0]}T00:00:00.000Z`);

  for (const day of sortedDays) {
    const current = new Date(`${day}T00:00:00.000Z`);

    if (current.getTime() === cursor.getTime()) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      continue;
    }

    break;
  }

  return streak;
}

async function createAuditLog(actorUserId: string, action: string, resourceId: string, payload?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({
    data: {
      action,
      payload,
      resource: resourceId,
      userId: actorUserId
    }
  });
}

async function assertSubjectExists(subjectId: string) {
  const subject = await prisma.subjectSummarySubject.findFirst({
    where: {
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      id: subjectId
    },
    select: {
      id: true
    }
  });

  if (!subject) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Choose a valid subject before saving.",
        path: ["subjectId"]
      }
    ]);
  }
}

async function countEntryStatuses(where: Prisma.SubjectSummaryEntryWhereInput) {
  const [archivedCount, draftCount, pendingApprovalCount, publishedCount] = await Promise.all([
    prisma.subjectSummaryEntry.count({
      where: {
        ...where,
        status: SubjectSummaryCaseStatus.ARCHIVED
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        ...where,
        status: SubjectSummaryCaseStatus.DRAFT
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        ...where,
        status: SubjectSummaryCaseStatus.PENDING_APPROVAL
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        ...where,
        status: SubjectSummaryCaseStatus.PUBLISHED
      }
    })
  ]);

  return {
    archivedCount,
    draftCount,
    pendingApprovalCount,
    publishedCount,
    totalEntries: archivedCount + draftCount + pendingApprovalCount + publishedCount
  };
}

async function assertCasesBelongToSubject(
  subjectId: string,
  relatedCaseIds: string[],
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  if (!relatedCaseIds.length) {
    return;
  }

  const count = await db.subjectSummaryCase.count({
    where: {
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      id: {
        in: relatedCaseIds
      },
      subjectId
    }
  });

  if (count !== relatedCaseIds.length) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Every related case must belong to the selected subject.",
        path: ["relatedCaseIds"]
      }
    ]);
  }
}

export function parseSubjectSummaryEntryFilters(query: Record<string, string | string[] | undefined>) {
  return entryFiltersSchema.parse({
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    sortBy: Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy,
    sortOrder: Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder,
    status: Array.isArray(query.status) ? query.status[0] : query.status,
    subjectId: Array.isArray(query.subjectId) ? query.subjectId[0] : query.subjectId,
    moduleType: Array.isArray(query.moduleType) ? query.moduleType[0] : query.moduleType,
    topic: Array.isArray(query.topic) ? query.topic[0] : query.topic
  });
}

export function parseSubjectSummaryEntryInput(body: unknown) {
  return entryInputSchema.parse(body);
}

export function parseSubjectSummaryTopicBulkInput(body: unknown) {
  return topicBulkInputSchema.parse(body);
}

export function parseStudentSubjectSummarySubjectsQuery(query: Record<string, string | string[] | undefined>) {
  return studentSubjectsQuerySchema.parse({
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    moduleType: Array.isArray(query.moduleType) ? query.moduleType[0] : query.moduleType
  });
}

export function parseStudentSubjectSummaryEntriesQuery(query: Record<string, string | string[] | undefined>) {
  return studentEntriesQuerySchema.parse({
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    filter: Array.isArray(query.filter) ? query.filter[0] : query.filter,
    query: Array.isArray(query.query) ? query.query[0] : query.query,
    subjectId: Array.isArray(query.subjectId) ? query.subjectId[0] : query.subjectId,
    moduleType: Array.isArray(query.moduleType) ? query.moduleType[0] : query.moduleType,
    topic: Array.isArray(query.topic) ? query.topic[0] : query.topic
  });
}

export function parseSubjectSummaryModuleTopicsQuery(query: Record<string, string | string[] | undefined>) {
  return topicsQuerySchema.parse({
    moduleType: Array.isArray(query.moduleType) ? query.moduleType[0] : query.moduleType,
    status: Array.isArray(query.status) ? query.status[0] : query.status,
    subjectId: Array.isArray(query.subjectId) ? query.subjectId[0] : query.subjectId
  });
}

export function parseStudentSubjectSummaryTopicsQuery(query: Record<string, string | string[] | undefined>) {
  return studentTopicsQuerySchema.parse({
    moduleType: Array.isArray(query.moduleType) ? query.moduleType[0] : query.moduleType,
    subjectId: Array.isArray(query.subjectId) ? query.subjectId[0] : query.subjectId
  });
}

export async function listSubjectSummaryEntries(filters: EntryFilters) {
  const where = buildEntryWhere(filters);
  const summaryWhere = buildEntrySummaryWhere(filters);
  const [totalItems, subjects, summary] = await Promise.all([
    prisma.subjectSummaryEntry.count({ where }),
    prisma.subjectSummarySubject.findMany({
      where: {
        ...notDeletedSubjectWhere,
        // If a subject only has NLS entries and the admin is viewing the FACULTY
        // page (or vice-versa) showing it in the dropdown creates false "I selected
        // a subject but can't see any uploaded content" confusion. Restrict the list
        // to subjects that actually have at least one non-deleted entry in the
        // currently-selected moduleType/status combo. Falls back gracefully to
        // "deletedAt: null only" when filters.status = "all".
        entries: {
          some: {
            ...notDeletedWhere,
            moduleType: filters.moduleType,
            ...(filters.status === "all" ? {} : { status: filters.status })
          }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true
      }
    }),
    countEntryStatuses(summaryWhere)
  ]);

  const paginationStart = (filters.page - 1) * filters.pageSize;
  const paginationEnd = paginationStart + filters.pageSize;

  // When sorting by serialNumber, DB-level lexical DESC is wrong for the new
  // Helar-FAC-100 format because "Helar-FAC-99" sorts before "Helar-FAC-100"
  // (string-wise 9 > 1). Pull the filtered candidates with only the fields
  // needed for order+include then do an in-memory numeric-suffix sort so
  // pagination boundaries are semantically correct (Helar-FAC-100 > Helar-FAC-99).
  let items: Array<any>;
  if (filters.sortBy === "serialNumber") {
    const candidates = await prisma.subjectSummaryEntry.findMany({
      where,
      orderBy: [{ serialNumber: filters.sortOrder === "asc" ? "asc" : "desc" }, { createdAt: "desc" }, { question: "asc" }],
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        },
        caseLinks: {
          include: {
            case: {
              include: {
                topic: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });
    candidates.sort((left, right) =>
      compareSubjectSummarySerialForSort(left, right, filters.sortOrder)
    );
    items = candidates.slice(paginationStart, paginationEnd);
  } else {
    items = await prisma.subjectSummaryEntry.findMany({
      where,
      orderBy: [{ [filters.sortBy]: filters.sortOrder }, { serialNumber: "desc" }, { question: "asc" }],
      skip: paginationStart,
      take: filters.pageSize,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        },
        caseLinks: {
          include: {
            case: {
              include: {
                topic: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  return {
    items: items.map((item) => mapEntry(item)),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize))
    },
    subjects,
    summary
  };
}

export async function listSubjectSummaryModuleTopics(query: TopicsQuery) {
  const rows = await prisma.subjectSummaryEntry.findMany({
    where: {
      ...notDeletedWhere,
      moduleType: query.moduleType,
      subject: {
        ...notDeletedSubjectWhere
      },
      subjectId: query.subjectId,
      ...(query.status === "all" ? {} : { status: query.status }),
      topic: {
        not: null
      }
    },
    select: {
      status: true,
      topic: true,
      updatedAt: true
    }
  });

  const topics = new Map<
    string,
    {
      archivedCount: number;
      draftCount: number;
      lastUpdated: string;
      pendingApprovalCount: number;
      publishedCount: number;
      questionCount: number;
      topic: string;
    }
  >();

  for (const row of rows) {
    const normalizedTopic = (row.topic ?? "").trim();
    if (!normalizedTopic) {
      continue;
    }

    const existing = topics.get(normalizedTopic) ?? {
      archivedCount: 0,
      draftCount: 0,
      lastUpdated: row.updatedAt.toISOString(),
      pendingApprovalCount: 0,
      publishedCount: 0,
      questionCount: 0,
      topic: normalizedTopic
    };

    existing.questionCount += 1;

    if (row.status === SubjectSummaryCaseStatus.ARCHIVED) {
      existing.archivedCount += 1;
    } else if (row.status === SubjectSummaryCaseStatus.PUBLISHED) {
      existing.publishedCount += 1;
    } else if (row.status === SubjectSummaryCaseStatus.PENDING_APPROVAL) {
      existing.pendingApprovalCount += 1;
    } else {
      existing.draftCount += 1;
    }

    const updatedAt = row.updatedAt.toISOString();
    if (updatedAt > existing.lastUpdated) {
      existing.lastUpdated = updatedAt;
    }

    topics.set(normalizedTopic, existing);
  }

  return {
    items: Array.from(topics.values()).sort((left, right) => {
      if (left.lastUpdated !== right.lastUpdated) {
        return right.lastUpdated.localeCompare(left.lastUpdated);
      }
      return left.topic.localeCompare(right.topic);
    })
  };
}

export async function getSubjectSummaryEntryFormOptions(subjectId?: string) {
  const [subjects, relatedCases] = await Promise.all([
    prisma.subjectSummarySubject.findMany({
      where: {
        ...notDeletedSubjectWhere
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: {
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        ...(subjectId ? { subjectId } : {})
      },
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        title: true,
        citation: true,
        subjectId: true,
        topic: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })
  ]);

  return {
    relatedCases: relatedCases.map((item) => ({
      citation: item.citation ?? "",
      id: item.id,
      subjectId: item.subjectId,
      title: item.title,
      topic: item.topic
    })),
    subjects
  };
}

function formatSubjectSummarySerialNumber(moduleType: SubjectSummaryModuleType, value: number) {
  const prefix = moduleType === SubjectSummaryModuleType.HANDBOOK ? "Helar-HDB-" : "Helar-TXT-";
  return `${prefix}${value}`;
}

/**
 * Extract the numeric portion of a subject summary serial, handling both the
 * current canonical format ("Helar-FAC-100", "Helar-NLS-100") and the older
 * short-form legacy values ("FAC-99", "NLS-42") so pre-existing rows still
 * sort, render and search correctly alongside the new format.
 *
 * Returns null when no numeric suffix can be parsed so callers can fall back
 * to createdAt / question text as the tiebreaker.
 */
function parseSubjectSummarySerialSuffix(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const lastDash = value.lastIndexOf("-");
  const candidate = lastDash === -1 ? value : value.slice(lastDash + 1);
  if (!candidate) {
    return null;
  }
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
}

/**
 * Primary sort for the Helar-FAC-100 / Helar-NLS-100 serial format.
 * DB-level lexical `{ serialNumber: desc }` breaks once you have both 99 and 100
 * because "9" > "1" string-wise. Comparing by the numeric suffix after the last
 * dash restores the human-expected "higher number = newer = first in DESC" order.
 */
function compareSubjectSummarySerialForSort(
  left: { serialNumber: string | null; createdAt: Date; question: string },
  right: { serialNumber: string | null; createdAt: Date; question: string },
  direction: "asc" | "desc"
) {
  const leftNum = parseSubjectSummarySerialSuffix(left.serialNumber);
  const rightNum = parseSubjectSummarySerialSuffix(right.serialNumber);
  if (leftNum != null && rightNum != null) {
    return direction === "asc" ? leftNum - rightNum : rightNum - leftNum;
  }
  if (leftNum != null) {
    return direction === "asc" ? -1 : 1;
  }
  if (rightNum != null) {
    return direction === "asc" ? 1 : -1;
  }
  const timeDelta = left.createdAt.getTime() - right.createdAt.getTime();
  const tie = timeDelta === 0 ? left.question.localeCompare(right.question) : timeDelta;
  return direction === "asc" ? tie : -tie;
}

async function allocateSubjectSummarySerialRange(
  tx: Prisma.TransactionClient,
  moduleType: SubjectSummaryModuleType,
  count: number
) {
  const next = await tx.subjectSummarySerialCounter.upsert({
    where: { moduleType },
    update: { value: { increment: count } },
    create: { moduleType, value: count },
    select: { value: true }
  });

  return next.value - count + 1;
}

export async function createSubjectSummaryEntry(input: EntryInput, actorUserId: string, actorRoleCodes: string[] = []) {
  await assertSubjectExists(input.subjectId);
  await assertCasesBelongToSubject(input.subjectId, input.relatedCaseIds);
  const resolvedStatus = resolveEntryStatus(input.status, actorRoleCodes);

  const entry = await runInTransaction(async (tx) => {
    const serialStart = await allocateSubjectSummarySerialRange(tx, input.moduleType, 1);
    const serialNumber = formatSubjectSummarySerialNumber(input.moduleType, serialStart);

    return tx.subjectSummaryEntry.create({
      data: {
        answer: input.answer,
        createdBy: actorUserId,
        deletedAt: null,
        difficulty: input.difficulty,
        displayOrder: input.displayOrder,
        estimatedReadingTime: input.estimatedReadingTime,
        examTip: input.examTip.trim() || null,
        keyPrinciple: input.keyPrinciple.trim() || null,
        moduleType: input.moduleType,
        serialNumber,
        question: input.question,
        reviewFeedback: null,
        relatedStatutes: normalizeList(input.relatedStatutes),
        status: resolvedStatus,
        subjectId: input.subjectId,
        tags: normalizeList(input.tags),
        topic: input.topic.trim() || null,
        caseLinks: {
          create: input.relatedCaseIds.map((caseId) => ({
            caseId
          }))
        }
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        },
        caseLinks: {
          include: {
            case: {
              include: {
                topic: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  await createAuditLog(actorUserId, "subject_summary_entry_created", entry.id, {
    question: entry.question,
    subjectId: entry.subjectId
  });

  return mapEntry(entry);
}

export async function createSubjectSummaryTopicEntries(input: TopicBulkInput, actorUserId: string, actorRoleCodes: string[] = []) {
  await assertSubjectExists(input.subjectId);
  const resolvedStatus = resolveEntryStatus(input.status, actorRoleCodes);
  const trimmedTopic = input.topic.trim();

  const result = await runInTransaction(async (tx) => {
    const serialStart = await allocateSubjectSummarySerialRange(tx, input.moduleType, input.entries.length);
    const existingMax = await tx.subjectSummaryEntry.findFirst({
      where: {
        ...notDeletedWhere,
        moduleType: input.moduleType,
        subjectId: input.subjectId,
        topic: trimmedTopic || null
      },
      orderBy: {
        displayOrder: "desc"
      },
      select: {
        displayOrder: true
      }
    });

    let displayOrderCursor = (existingMax?.displayOrder ?? -1) + 1;
    let serialCursor = serialStart;

    const relatedCaseIdSet = new Set<string>();

    for (const entryInput of input.entries) {
      for (const caseId of entryInput.relatedCaseIds) {
        relatedCaseIdSet.add(caseId);
      }
    }

    await assertCasesBelongToSubject(input.subjectId, Array.from(relatedCaseIdSet), tx);

    for (const entryInput of input.entries) {
      await tx.subjectSummaryEntry.create({
        data: {
          answer: entryInput.answer,
          createdBy: actorUserId,
          deletedAt: null,
          difficulty: entryInput.difficulty,
          displayOrder: displayOrderCursor,
          estimatedReadingTime: entryInput.estimatedReadingTime,
          examTip: entryInput.examTip.trim() || null,
          keyPrinciple: entryInput.keyPrinciple.trim() || null,
          moduleType: input.moduleType,
          serialNumber: formatSubjectSummarySerialNumber(input.moduleType, serialCursor),
          question: entryInput.question,
          reviewFeedback: null,
          relatedStatutes: normalizeList(entryInput.relatedStatutes),
          status: resolvedStatus,
          subjectId: input.subjectId,
          tags: normalizeList(entryInput.tags),
          topic: trimmedTopic || null,
          caseLinks: {
            create: entryInput.relatedCaseIds.map((caseId) => ({
              caseId
            }))
          }
        }
      });

      displayOrderCursor += 1;
      serialCursor += 1;
    }

    return {
      createdCount: input.entries.length
    };
  });

  await createAuditLog(actorUserId, "subject_summary_topic_entries_created", `${input.subjectId}:${input.moduleType}:${trimmedTopic}`, {
    createdCount: result.createdCount,
    moduleType: input.moduleType,
    subjectId: input.subjectId,
    topic: trimmedTopic
  });

  return result;
}

export async function getAdminSubjectSummaryEntry(entryId: string) {
  const entry = await prisma.subjectSummaryEntry.findFirst({
    where: {
      ...notDeletedWhere,
      id: entryId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      caseLinks: {
        include: {
          case: {
            include: {
              topic: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!entry) {
    return null;
  }

  return mapEntry(entry);
}

export async function updateSubjectSummaryEntry(
  entryId: string,
  input: EntryInput,
  actorUserId: string,
  actorRoleCodes: string[] = []
) {
  await assertSubjectExists(input.subjectId);
  await assertCasesBelongToSubject(input.subjectId, input.relatedCaseIds);

  const existing = await prisma.subjectSummaryEntry.findFirst({
    where: {
      ...notDeletedWhere,
      id: entryId
    },
    select: {
      id: true
    }
  });

  if (!existing) {
    return null;
  }

  const resolvedStatus = resolveEntryStatus(input.status, actorRoleCodes);

  const entry = await prisma.subjectSummaryEntry.update({
    where: {
      id: entryId
    },
    data: {
      answer: input.answer,
      difficulty: input.difficulty,
      displayOrder: input.displayOrder,
      estimatedReadingTime: input.estimatedReadingTime,
      examTip: input.examTip.trim() || null,
      keyPrinciple: input.keyPrinciple.trim() || null,
      moduleType: input.moduleType,
      question: input.question,
      reviewFeedback: null,
      relatedStatutes: normalizeList(input.relatedStatutes),
      status: resolvedStatus,
      subjectId: input.subjectId,
      tags: normalizeList(input.tags),
      topic: input.topic.trim() || null,
      caseLinks: {
        deleteMany: {},
        create: input.relatedCaseIds.map((caseId) => ({
          caseId
        }))
      }
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      caseLinks: {
        include: {
          case: {
            include: {
              topic: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }
    }
  });

  await createAuditLog(actorUserId, "subject_summary_entry_updated", entry.id, {
    question: entry.question,
    subjectId: entry.subjectId
  });

  return mapEntry(entry);
}

export async function deleteSubjectSummaryEntry(entryId: string, actorUserId: string) {
  const existing = await prisma.subjectSummaryEntry.findFirst({
    where: {
      ...notDeletedWhere,
      id: entryId
    },
    select: {
      id: true
    }
  });

  if (!existing) {
    return null;
  }

  await prisma.subjectSummaryEntry.update({
    where: {
      id: entryId
    },
    data: {
      deletedAt: new Date()
    }
  });

  await createAuditLog(actorUserId, "subject_summary_entry_deleted", entryId);

  return {
    id: entryId,
    success: true
  };
}

export async function listStudentSubjectSummarySubjects(userId: string, search: string, moduleType: SubjectSummaryModuleType) {
  const loadSubjects = async (targetModuleType: SubjectSummaryModuleType) => {
    const subjects = await prisma.subjectSummarySubject.findMany({
      where: {
        ...notDeletedSubjectWhere,
        entries: {
          some: {
            ...notDeletedWhere,
            moduleType: targetModuleType,
            status: SubjectSummaryCaseStatus.PUBLISHED
          }
        },
        ...(search
          ? {
              name: containsText(search)
            }
          : {})
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: {
        entries: {
          where: {
            ...notDeletedWhere,
            moduleType: targetModuleType,
            status: SubjectSummaryCaseStatus.PUBLISHED
          },
          select: {
            id: true,
            estimatedReadingTime: true,
            updatedAt: true
          }
        }
      }
    });

    const allEntryIds = subjects.flatMap((subject) => subject.entries.map((entry) => entry.id));
    const progressItems = allEntryIds.length
      ? await prisma.studentStudyProgress.findMany({
          where: {
            contentKey: {
              in: allEntryIds.map((entryId) => entryContentKey(entryId))
            },
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            userId
          },
          select: {
            completed: true,
            contentKey: true,
            lastOpenedAt: true
          }
        })
      : [];

    const progressByKey = new Map(progressItems.map((item) => [item.contentKey, item]));

    return {
      items: subjects.map((subject) => {
        const completedCount = subject.entries.reduce((sum, entry) => {
          const progress = progressByKey.get(entryContentKey(entry.id));
          return sum + (progress?.completed ? 1 : 0);
        }, 0);

        const lastOpenedAt = subject.entries
          .map((entry) => progressByKey.get(entryContentKey(entry.id))?.lastOpenedAt ?? null)
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

        return {
          completionPct: subject.entries.length ? Math.round((completedCount / subject.entries.length) * 100) : 0,
          completedCount,
          estimatedReadingTime: subject.entries.reduce((sum, entry) => sum + entry.estimatedReadingTime, 0),
          id: subject.id,
          lastOpenedAt: lastOpenedAt?.toISOString() ?? null,
          lastUpdated: subject.entries
            .map((entry) => entry.updatedAt)
            .sort((left, right) => right.getTime() - left.getTime())[0]
            .toISOString(),
          name: subject.name,
          questionCount: subject.entries.length
        };
      })
    };
  };

  const primary = await loadSubjects(moduleType);
  if (primary.items.length) {
    return primary;
  }

  const fallbackModuleType =
    moduleType === SubjectSummaryModuleType.TEXTBOOK ? SubjectSummaryModuleType.HANDBOOK : SubjectSummaryModuleType.TEXTBOOK;

  return loadSubjects(fallbackModuleType);
}

export async function listStudentSubjectSummaryTopics(_userId: string, query: StudentTopicsQuery) {
  const loadRows = (targetModuleType: SubjectSummaryModuleType) =>
    prisma.subjectSummaryEntry.findMany({
      where: {
        ...notDeletedWhere,
        moduleType: targetModuleType,
        status: SubjectSummaryCaseStatus.PUBLISHED,
        subject: {
          ...notDeletedSubjectWhere
        },
        subjectId: query.subjectId,
        topic: {
          not: null
        }
      },
      select: {
        topic: true,
        updatedAt: true
      }
    });

  let rows = await loadRows(query.moduleType);
  if (!rows.length) {
    const fallbackModuleType =
      query.moduleType === SubjectSummaryModuleType.TEXTBOOK ? SubjectSummaryModuleType.HANDBOOK : SubjectSummaryModuleType.TEXTBOOK;
    rows = await loadRows(fallbackModuleType);
  }

  const topics = new Map<string, { lastUpdated: string; questionCount: number; topic: string }>();

  for (const row of rows) {
    const normalizedTopic = (row.topic ?? "").trim();
    if (!normalizedTopic) {
      continue;
    }

    const existing = topics.get(normalizedTopic) ?? {
      lastUpdated: row.updatedAt.toISOString(),
      questionCount: 0,
      topic: normalizedTopic
    };

    existing.questionCount += 1;
    const updatedAt = row.updatedAt.toISOString();
    if (updatedAt > existing.lastUpdated) {
      existing.lastUpdated = updatedAt;
    }

    topics.set(normalizedTopic, existing);
  }

  return {
    items: Array.from(topics.values()).sort((left, right) => {
      if (left.lastUpdated !== right.lastUpdated) {
        return right.lastUpdated.localeCompare(left.lastUpdated);
      }
      return left.topic.localeCompare(right.topic);
    })
  };
}

export async function getStudentSubjectSummaryRevisionView(userId: string, query: StudentEntriesQuery) {
  const contentAccess = await getPremiumContentAccess(userId);
  const subject = await prisma.subjectSummarySubject.findFirst({
    where: {
      ...notDeletedSubjectWhere,
      id: query.subjectId
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!subject) {
    return null;
  }

  const loadEntries = (targetModuleType: SubjectSummaryModuleType) =>
    prisma.subjectSummaryEntry.findMany({
      where: {
        ...notDeletedWhere,
        moduleType: targetModuleType,
        status: SubjectSummaryCaseStatus.PUBLISHED,
        subjectId: query.subjectId,
        ...(query.topic ? { topic: query.topic } : {})
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        },
        caseLinks: {
          include: {
            case: {
              include: {
                topic: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

  let allEntries = await loadEntries(query.moduleType);
  if (!allEntries.length) {
    const fallbackModuleType =
      query.moduleType === SubjectSummaryModuleType.TEXTBOOK ? SubjectSummaryModuleType.HANDBOOK : SubjectSummaryModuleType.TEXTBOOK;
    allEntries = await loadEntries(fallbackModuleType);
  }
  // DB-level orderBy was removed above so we can perform a single canonical
  // numeric-suffix sort below (Helar-FAC-100 > Helar-FAC-99) instead of the
  // wrong lexical ordering.

  const entryIds = allEntries.map((entry) => entry.id);
  const contentKeys = entryIds.map((entryId) => entryContentKey(entryId));

  const [progressItems, bookmarkItems, noteItems] = await Promise.all([
    contentKeys.length
      ? prisma.studentStudyProgress.findMany({
          where: {
            contentKey: {
              in: contentKeys
            },
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            userId
          }
        })
      : [],
    contentKeys.length
      ? prisma.studentStudyBookmark.findMany({
          where: {
            contentKey: {
              in: contentKeys
            },
            contentType: StudentStudyContentType.SUBJECT_SUMMARY_ENTRY,
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            userId
          }
        })
      : [],
    contentKeys.length
      ? prisma.studentStudyNote.findMany({
          where: {
            contentKey: {
              in: contentKeys
            },
            contentType: StudentStudyContentType.SUBJECT_SUMMARY_ENTRY,
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            userId
          },
          orderBy: {
            updatedAt: "desc"
          }
        })
      : []
  ]);

  const progressByKey = new Map(progressItems.map((item) => [item.contentKey, item]));
  const bookmarkByKey = new Map(bookmarkItems.map((item) => [item.contentKey, item]));
  const noteGroups = new Map<string, typeof noteItems>();

  for (const note of noteItems) {
    const noteKey = note.contentKey;

    if (!noteKey) {
      continue;
    }

    noteGroups.set(noteKey, [...(noteGroups.get(noteKey) ?? []), note]);
  }

  const filteredEntries = allEntries.filter((entry) => {
    const mapped = mapEntry(entry);
    const contentKey = entryContentKey(entry.id);
    const progress = progressByKey.get(contentKey);
    const isBookmarked = bookmarkByKey.has(contentKey);
    const entryNotes = noteGroups.get(contentKey) ?? [];
    const searchText = query.query.trim().toLowerCase();

    const matchesSearch =
      !searchText ||
      [
        mapped.question,
        mapped.keyPrinciple,
        mapped.examTip,
        mapped.answer,
        mapped.serialNumber,
        mapped.tags.join(" "),
        mapped.relatedStatutes.join(" "),
        mapped.relatedCases.map((item) => `${item.title} ${item.citation} ${item.ratioDecidendi}`).join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);

    if (!matchesSearch) {
      return false;
    }

    if (query.filter === "read") {
      return Boolean(progress?.completed);
    }

    if (query.filter === "unread") {
      return !progress?.completed;
    }

    if (query.filter === "bookmarked") {
      return isBookmarked;
    }

    if (query.filter === "easy") {
      return entry.difficulty === SubjectSummaryDifficulty.EASY;
    }

    if (query.filter === "difficult") {
      return entry.difficulty === SubjectSummaryDifficulty.ADVANCED;
    }

    if (query.filter === "recentlyViewed") {
      return Boolean(progress?.lastOpenedAt);
    }

    return entryNotes.length >= 0;
  });

  // Primary sort for the canonical Helar-FAC-100 / Helar-NLS-100 serial format:
  // DESC by numeric suffix so higher serials (newer uploads) render first. For the
  // "recently viewed" filter, however, lastOpenedAt wins — the serial number is
  // then used to break ties deterministically.
  const sortedEntries = [...filteredEntries].sort((left, right) => {
    if (query.filter === "recentlyViewed") {
      const leftAt = progressByKey.get(entryContentKey(left.id))?.lastOpenedAt?.getTime() ?? 0;
      const rightAt = progressByKey.get(entryContentKey(right.id))?.lastOpenedAt?.getTime() ?? 0;
      if (leftAt !== rightAt) {
        return rightAt - leftAt;
      }
    }
    return compareSubjectSummarySerialForSort(left, right, "desc");
  });

  const totalQuestions = sortedEntries.length;
  const paginationStart = (query.page - 1) * query.pageSize;
  const paginationEnd = paginationStart + query.pageSize;
  const paginatedEntries = sortedEntries.slice(paginationStart, paginationEnd);
  const completedCount = allEntries.reduce((sum, entry) => {
    const progress = progressByKey.get(entryContentKey(entry.id));
    return sum + (progress?.completed ? 1 : 0);
  }, 0);
  const totalReadingTimeSeconds = allEntries.reduce((sum, entry) => {
    const progress = progressByKey.get(entryContentKey(entry.id));
    return sum + (progress?.timeSpentSeconds ?? 0);
  }, 0);
  const totalBookmarks = allEntries.reduce((sum, entry) => sum + (bookmarkByKey.has(entryContentKey(entry.id)) ? 1 : 0), 0);
  const totalNotes = allEntries.reduce((sum, entry) => sum + (noteGroups.get(entryContentKey(entry.id))?.length ?? 0), 0);
  const lastReadProgress = [...progressItems].sort((left, right) => right.lastOpenedAt.getTime() - left.lastOpenedAt.getTime())[0] ?? null;
  const weeklyViewedCount = progressItems.filter((item) => item.lastOpenedAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;
  const streakDays = buildStreak(progressItems.map((item) => item.lastOpenedAt.toISOString().slice(0, 10)));
  const continueReadingEntry = lastReadProgress
    ? allEntries.find((entry) => entryContentKey(entry.id) === lastReadProgress.contentKey) ?? null
    : null;

  return {
    contentAccess: {
      ...contentAccess,
      activeSubscriptionEndsAt: contentAccess.activeSubscriptionEndsAt?.toISOString() ?? null
    },
    entries: paginatedEntries.map((entry, index) => {
      const mapped = mapEntry(entry);
      const visibleEntry = contentAccess.hasFullAccess ? mapped : buildRestrictedEntryPreview(mapped);
      const contentKey = entryContentKey(entry.id);
      const progress = progressByKey.get(contentKey);
      const notes = noteGroups.get(contentKey) ?? [];

      return {
        ...visibleEntry,
        noteCount: notes.length,
        notePreview: notes[0]?.contentPlainText ?? "",
        // orderLabel = page-aware row number so the first card on page 2 does not
        // repeat "1" when the user already read through page 1.
        orderLabel: paginationStart + index + 1,
        progress: {
          completed: progress?.completed ?? false,
          lastOpenedAt: progress?.lastOpenedAt.toISOString() ?? null,
          readingProgressPct: progress?.readingProgressPct ?? 0,
          timeSpentSeconds: progress?.timeSpentSeconds ?? 0
        },
        bookmarked: bookmarkByKey.has(contentKey)
      };
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: totalQuestions,
      totalPages: Math.max(1, Math.ceil(totalQuestions / query.pageSize))
    },
    stats: {
      averageReadingTime: totalQuestions ? Math.round(allEntries.reduce((sum, entry) => sum + entry.estimatedReadingTime, 0) / totalQuestions) : 0,
      bookmarks: totalBookmarks,
      completed: completedCount,
      completionPct: totalQuestions ? Math.round((completedCount / totalQuestions) * 100) : 0,
      continueReadingEntryId: continueReadingEntry?.id ?? null,
      lastReadAt: lastReadProgress?.lastOpenedAt.toISOString() ?? null,
      notesCreated: totalNotes,
      questionsRemaining: Math.max(totalQuestions - completedCount, 0),
      questionsTotal: totalQuestions,
      studyStreak: streakDays,
      totalReadingTimeSeconds,
      weeklyProgressPct: totalQuestions ? Math.round((weeklyViewedCount / totalQuestions) * 100) : 0
    },
    subject: {
      estimatedReadingTime: allEntries.reduce((sum, entry) => sum + entry.estimatedReadingTime, 0),
      id: subject.id,
      lastUpdated:
        allEntries
          .map((entry) => entry.updatedAt)
          .sort((left, right) => right.getTime() - left.getTime())[0]
          ?.toISOString() ?? null,
      name: subject.name
    }
  };
}
