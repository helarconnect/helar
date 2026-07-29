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

const entryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  search: z.string().trim().max(160).default(""),
  sortBy: z.enum(["createdAt", "displayOrder", "question", "updatedAt"]).default("displayOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  status: z.union([z.nativeEnum(SubjectSummaryCaseStatus), z.literal("all")]).default("all"),
  subjectId: recordIdSchema.optional(),
  moduleType: z.nativeEnum(SubjectSummaryModuleType).default(SubjectSummaryModuleType.FACULTY),
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
    moduleType: z.nativeEnum(SubjectSummaryModuleType).default(SubjectSummaryModuleType.FACULTY),
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
    moduleType: z.nativeEnum(SubjectSummaryModuleType).default(SubjectSummaryModuleType.FACULTY),
    subjectId: recordIdSchema,
    topic: z.string().trim().min(2),
    status: z.nativeEnum(SubjectSummaryCaseStatus).default(SubjectSummaryCaseStatus.DRAFT),
    entries: z.array(topicBulkEntrySchema).min(1)
  })
  .strict();

const studentSubjectsQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  moduleType: z.nativeEnum(SubjectSummaryModuleType).default(SubjectSummaryModuleType.FACULTY)
});

const studentEntriesQuerySchema = z.object({
  filter: z.enum(["all", "bookmarked", "difficult", "easy", "read", "recentlyViewed", "unread"]).default("all"),
  query: z.string().trim().max(160).default(""),
  subjectId: recordIdSchema,
  moduleType: z.nativeEnum(SubjectSummaryModuleType).default(SubjectSummaryModuleType.FACULTY),
  topic: z.string().trim().optional().default("")
});

type EntryFilters = z.infer<typeof entryFiltersSchema>;
type EntryInput = z.infer<typeof entryInputSchema>;
type TopicBulkInput = z.infer<typeof topicBulkInputSchema>;
type StudentEntriesQuery = z.infer<typeof studentEntriesQuerySchema>;

const topicsQuerySchema = z.object({
  moduleType: z.nativeEnum(SubjectSummaryModuleType).default(SubjectSummaryModuleType.FACULTY),
  subjectId: recordIdSchema,
  status: z.union([z.nativeEnum(SubjectSummaryCaseStatus), z.literal("all")]).default("all")
});

const studentTopicsQuerySchema = z.object({
  moduleType: z.nativeEnum(SubjectSummaryModuleType).default(SubjectSummaryModuleType.FACULTY),
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
    deletedAt: null,
    subject: {
      deletedAt: null
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
              subject: {
                name: containsText(filters.search)
              }
            },
            {
              caseLinks: {
                some: {
                  case: {
                    deletedAt: null,
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
                }
              }
            }
          ]
        }
      : {})
  };
}

function mapEntry(item: {
  id: string;
  subjectId: string;
  moduleType: SubjectSummaryModuleType;
  topic: string | null;
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
    moduleType: item.moduleType,
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
      deletedAt: null,
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

async function countEntryStatuses() {
  const [archivedCount, draftCount, pendingApprovalCount, publishedCount] = await Promise.all([
    prisma.subjectSummaryEntry.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.ARCHIVED
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.DRAFT
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.PENDING_APPROVAL
      }
    }),
    prisma.subjectSummaryEntry.count({
      where: {
        deletedAt: null,
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

async function assertCasesBelongToSubject(subjectId: string, relatedCaseIds: string[]) {
  if (!relatedCaseIds.length) {
    return;
  }

  const count = await prisma.subjectSummaryCase.count({
    where: {
      deletedAt: null,
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
  const [items, totalItems, subjects, summary] = await Promise.all([
    prisma.subjectSummaryEntry.findMany({
      where,
      orderBy: [{ [filters.sortBy]: filters.sortOrder }, { question: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
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
    }),
    prisma.subjectSummaryEntry.count({ where }),
    prisma.subjectSummarySubject.findMany({
      where: {
        deletedAt: null
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true
      }
    }),
    countEntryStatuses()
  ]);

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
      deletedAt: null,
      moduleType: query.moduleType,
      subject: {
        deletedAt: null
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
        deletedAt: null
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: {
        deletedAt: null,
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

export async function createSubjectSummaryEntry(input: EntryInput, actorUserId: string, actorRoleCodes: string[] = []) {
  await assertSubjectExists(input.subjectId);
  await assertCasesBelongToSubject(input.subjectId, input.relatedCaseIds);
  const resolvedStatus = resolveEntryStatus(input.status, actorRoleCodes);

  const entry = await prisma.subjectSummaryEntry.create({
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
    const existingMax = await tx.subjectSummaryEntry.findFirst({
      where: {
        deletedAt: null,
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

    for (const entryInput of input.entries) {
      await assertCasesBelongToSubject(input.subjectId, entryInput.relatedCaseIds);

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
      deletedAt: null,
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
      deletedAt: null,
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
  const subjects = await prisma.subjectSummarySubject.findMany({
    where: {
      deletedAt: null,
      entries: {
        some: {
          deletedAt: null,
          moduleType,
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
          deletedAt: null,
          moduleType,
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
          deletedAt: null,
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
}

export async function listStudentSubjectSummaryTopics(_userId: string, query: StudentTopicsQuery) {
  const rows = await prisma.subjectSummaryEntry.findMany({
    where: {
      deletedAt: null,
      moduleType: query.moduleType,
      status: SubjectSummaryCaseStatus.PUBLISHED,
      subject: {
        deletedAt: null
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
      deletedAt: null,
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

  const allEntries = await prisma.subjectSummaryEntry.findMany({
    where: {
      deletedAt: null,
      moduleType: query.moduleType,
      status: SubjectSummaryCaseStatus.PUBLISHED,
      subjectId: query.subjectId,
      ...(query.topic ? { topic: query.topic } : {})
    },
    orderBy: [{ displayOrder: "asc" }, { question: "asc" }],
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

  const entryIds = allEntries.map((entry) => entry.id);
  const contentKeys = entryIds.map((entryId) => entryContentKey(entryId));

  const [progressItems, bookmarkItems, noteItems] = await Promise.all([
    contentKeys.length
      ? prisma.studentStudyProgress.findMany({
          where: {
            contentKey: {
              in: contentKeys
            },
            deletedAt: null,
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
            deletedAt: null,
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
            deletedAt: null,
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

  const totalQuestions = allEntries.length;
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
    entries: filteredEntries.map((entry, index) => {
      const mapped = mapEntry(entry);
      const visibleEntry = contentAccess.hasFullAccess ? mapped : buildRestrictedEntryPreview(mapped);
      const contentKey = entryContentKey(entry.id);
      const progress = progressByKey.get(contentKey);
      const notes = noteGroups.get(contentKey) ?? [];

      return {
        ...visibleEntry,
        noteCount: notes.length,
        notePreview: notes[0]?.contentPlainText ?? "",
        orderLabel: index + 1,
        progress: {
          completed: progress?.completed ?? false,
          lastOpenedAt: progress?.lastOpenedAt.toISOString() ?? null,
          readingProgressPct: progress?.readingProgressPct ?? 0,
          timeSpentSeconds: progress?.timeSpentSeconds ?? 0
        },
        bookmarked: bookmarkByKey.has(contentKey)
      };
    }),
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
