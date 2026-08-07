import {
  SubjectSummaryCaseStatus,
  SubjectSummaryStatus,
  type Prisma
} from "@prisma/client";
import { z } from "zod";

import { recordIdSchema } from "./lib/record-id.js";
import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";
import { getPremiumContentAccess, truncateWords, PREMIUM_PREVIEW_WORD_LIMIT } from "./premium-access.js";
import { runBatchTransaction } from "./lib/transactions.js";

const subjectFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  // Max 500 per page supports reference dropdowns and bulk selection workflows
  // in the admin workspace (e.g., Study Notes FAB and subject pickers).
  pageSize: z.coerce.number().int().min(1).max(500).default(10),
  search: z.string().trim().max(120).default(""),
  sortBy: z.enum(["createdAt", "displayOrder", "name", "updatedAt"]).default("displayOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  status: z.union([z.nativeEnum(SubjectSummaryStatus), z.literal("all")]).default("all")
});

const topicFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(10),
  search: z.string().trim().max(120).default(""),
  sortBy: z.enum(["createdAt", "displayOrder", "name", "updatedAt"]).default("displayOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  status: z.union([z.nativeEnum(SubjectSummaryStatus), z.literal("all")]).default("all"),
  subjectId: recordIdSchema.optional()
});

const caseFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(10),
  search: z.string().trim().max(120).default(""),
  sortBy: z.enum(["createdAt", "title", "updatedAt", "year"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.union([z.nativeEnum(SubjectSummaryCaseStatus), z.literal("all")]).default("all"),
  subjectId: recordIdSchema.optional(),
  topicId: recordIdSchema.optional()
});

const hierarchyQuerySchema = z.object({
  search: z.string().trim().max(120).default("")
});

const autocompleteQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
  query: z.string().trim().min(2).max(120)
});

const subjectInputSchema = z
  .object({
    description: z.string().trim().max(3_000).optional().default(""),
    displayOrder: z.coerce.number().int().min(0).max(10_000).default(0),
    name: z.string().trim().min(2).max(120),
    status: z.nativeEnum(SubjectSummaryStatus).default(SubjectSummaryStatus.ACTIVE)
  })
  .strict();

const topicInputSchema = z
  .object({
    description: z.string().trim().max(3_000).optional().default(""),
    displayOrder: z.coerce.number().int().min(0).max(10_000).default(0),
    name: z.string().trim().min(2).max(120),
    status: z.nativeEnum(SubjectSummaryStatus).default(SubjectSummaryStatus.ACTIVE),
    subjectId: recordIdSchema
  })
  .strict();

const stringListFieldSchema = z.array(z.string().trim().min(1).max(500)).max(50).default([]);

const caseInputSchema = z
  .object({
    attachments: stringListFieldSchema,
    caseSummary: z.string().trim().max(80_000).optional().default(""),
    citation: z.string().trim().max(300).optional().default(""),
    court: z.string().trim().max(200).optional().default(""),
    decisionHolding: z.string().trim().max(80_000).optional().default(""),
    externalReferences: stringListFieldSchema,
    facts: z.string().trim().max(80_000).optional().default(""),
    issues: z.string().trim().max(80_000).optional().default(""),
    judges: stringListFieldSchema,
    jurisdiction: z.string().trim().max(200).optional().default(""),
    keywords: stringListFieldSchema,
    legalPrinciples: stringListFieldSchema,
    obiterDicta: z.string().trim().max(80_000).optional().default(""),
    ratioDecidendi: z.string().trim().max(80_000).optional().default(""),
    relatedCases: stringListFieldSchema,
    relatedStatutes: stringListFieldSchema,
    status: z.nativeEnum(SubjectSummaryCaseStatus).default(SubjectSummaryCaseStatus.DRAFT),
    subjectId: recordIdSchema,
    title: z.string().trim().min(2).max(180),
    topicId: recordIdSchema,
    year: z.coerce.number().int().min(1800).max(3000).optional().nullable(),
  })
  .strict();

const subjectBulkActionSchema = z
  .object({
    action: z.enum(["activate", "archive", "deactivate", "delete"]),
    ids: z.array(recordIdSchema).min(1).max(200)
  })
  .strict();

const topicBulkActionSchema = z
  .object({
    action: z.enum(["activate", "archive", "deactivate", "delete"]),
    ids: z.array(recordIdSchema).min(1).max(200)
  })
  .strict();

const caseBulkActionSchema = z
  .object({
    action: z.enum(["archive", "delete", "draft", "publish"]),
    ids: z.array(recordIdSchema).min(1).max(200)
  })
  .strict();

export type SubjectSummarySubjectFilters = z.infer<typeof subjectFiltersSchema>;
export type SubjectSummaryTopicFilters = z.infer<typeof topicFiltersSchema>;
export type SubjectSummaryCaseFilters = z.infer<typeof caseFiltersSchema>;
export type SubjectSummaryHierarchyQuery = z.infer<typeof hierarchyQuerySchema>;
export type SubjectSummaryAutocompleteQuery = z.infer<typeof autocompleteQuerySchema>;
export type SubjectSummarySubjectInput = z.infer<typeof subjectInputSchema>;
export type SubjectSummaryTopicInput = z.infer<typeof topicInputSchema>;
export type SubjectSummaryCaseInput = z.infer<typeof caseInputSchema>;
export type SubjectSummarySubjectBulkAction = z.infer<typeof subjectBulkActionSchema>;
export type SubjectSummaryTopicBulkAction = z.infer<typeof topicBulkActionSchema>;
export type SubjectSummaryCaseBulkAction = z.infer<typeof caseBulkActionSchema>;

type ReadingInsight = {
  id: string;
  kind: "case" | "subject" | "topic";
  label: string;
  reads: number;
};

function nullIfBlank(value: string) {
  return value.trim() ? value.trim() : null;
}

function normalizeStringList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function resolveCaseStatus(inputStatus: SubjectSummaryCaseStatus, actorRoleCodes: string[] = []) {
  if (actorRoleCodes.includes("content_admin") && inputStatus === SubjectSummaryCaseStatus.PUBLISHED) {
    return SubjectSummaryCaseStatus.PENDING_APPROVAL;
  }

  return inputStatus;
}

function mapSubject(subject: {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  status: SubjectSummaryStatus;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    topics: number;
    cases: number;
  };
}) {
  return {
    caseCount: subject._count.cases,
    createdAt: subject.createdAt.toISOString(),
    description: subject.description ?? "",
    displayOrder: subject.displayOrder,
    id: subject.id,
    name: subject.name,
    status: subject.status,
    topicCount: subject._count.topics,
    updatedAt: subject.updatedAt.toISOString()
  };
}

function mapTopic(topic: {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  status: SubjectSummaryStatus;
  createdAt: Date;
  updatedAt: Date;
  subjectId: string;
  subject: {
    id: string;
    name: string;
  };
  _count: {
    cases: number;
  };
}) {
  return {
    caseCount: topic._count.cases,
    createdAt: topic.createdAt.toISOString(),
    description: topic.description ?? "",
    displayOrder: topic.displayOrder,
    id: topic.id,
    name: topic.name,
    status: topic.status,
    subject: {
      id: topic.subject.id,
      name: topic.subject.name
    },
    subjectId: topic.subjectId,
    updatedAt: topic.updatedAt.toISOString()
  };
}

function mapCase(item: {
  id: string;
  title: string;
  citation: string | null;
  court: string | null;
  judges: string[];
  year: number | null;
  jurisdiction: string | null;
  caseSummary: string | null;
  facts: string | null;
  issues: string | null;
  decisionHolding: string | null;
  ratioDecidendi: string | null;
  obiterDicta: string | null;
  legalPrinciples: string[];
  relatedStatutes: string[];
  relatedCases: string[];
  keywords: string[];
  attachments: string[];
  externalReferences: string[];
  status: SubjectSummaryCaseStatus;
  reviewFeedback: string | null;
  createdAt: Date;
  updatedAt: Date;
  subjectId: string;
  topicId: string;
  subject: {
    id: string;
    name: string;
  };
  topic: {
    id: string;
    name: string;
  };
}) {
  return {
    attachments: item.attachments,
    caseSummary: item.caseSummary ?? "",
    citation: item.citation ?? "",
    court: item.court ?? "",
    createdAt: item.createdAt.toISOString(),
    decisionHolding: item.decisionHolding ?? "",
    externalReferences: item.externalReferences,
    facts: item.facts ?? "",
    id: item.id,
    issues: item.issues ?? "",
    judges: item.judges,
    jurisdiction: item.jurisdiction ?? "",
    keywords: item.keywords,
    legalPrinciples: item.legalPrinciples,
    obiterDicta: item.obiterDicta ?? "",
    ratioDecidendi: item.ratioDecidendi ?? "",
    relatedCases: item.relatedCases,
    relatedStatutes: item.relatedStatutes,
    reviewFeedback: item.reviewFeedback ?? "",
    status: item.status,
    subject: {
      id: item.subject.id,
      name: item.subject.name
    },
    subjectId: item.subjectId,
    title: item.title,
    topic: {
      id: item.topic.id,
      name: item.topic.name
    },
    topicId: item.topicId,
    updatedAt: item.updatedAt.toISOString(),
    year: item.year
  };
}

function buildRestrictedCasePreview(item: ReturnType<typeof mapCase>) {
  const previewText = truncateWords(
    [
      item.caseSummary,
      item.facts,
      item.issues,
      item.decisionHolding,
      item.ratioDecidendi,
      item.obiterDicta
    ]
      .filter(Boolean)
      .join(" "),
    PREMIUM_PREVIEW_WORD_LIMIT
  ).text;

  return {
    ...item,
    attachments: [],
    caseSummary: previewText,
    decisionHolding: "",
    externalReferences: [],
    facts: "",
    issues: "",
    keywords: [],
    legalPrinciples: [],
    obiterDicta: "",
    ratioDecidendi: "",
    relatedCases: [],
    relatedStatutes: []
  };
}

function countOccurrences(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function getTopCountEntry(counts: Map<string, number>) {
  let topEntry: { id: string; reads: number } | null = null;

  for (const [id, reads] of counts.entries()) {
    if (!topEntry || reads > topEntry.reads) {
      topEntry = { id, reads };
    }
  }

  return topEntry;
}

async function countSubjectStatuses() {
  const [activeCount, archivedCount, inactiveCount] = await Promise.all([
    prisma.subjectSummarySubject.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE
      }
    }),
    prisma.subjectSummarySubject.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.ARCHIVED
      }
    }),
    prisma.subjectSummarySubject.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.INACTIVE
      }
    })
  ]);

  return {
    activeCount,
    archivedCount,
    inactiveCount,
    totalSubjects: activeCount + archivedCount + inactiveCount
  };
}

async function countTopicStatuses() {
  const [activeCount, archivedCount, inactiveCount] = await Promise.all([
    prisma.subjectSummaryTopic.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE
      }
    }),
    prisma.subjectSummaryTopic.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.ARCHIVED
      }
    }),
    prisma.subjectSummaryTopic.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.INACTIVE
      }
    })
  ]);

  return {
    activeCount,
    archivedCount,
    inactiveCount,
    totalTopics: activeCount + archivedCount + inactiveCount
  };
}

async function countCaseStatuses() {
  const [archivedCount, draftCount, pendingApprovalCount, publishedCount] = await Promise.all([
    prisma.subjectSummaryCase.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.ARCHIVED
      }
    }),
    prisma.subjectSummaryCase.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.DRAFT
      }
    }),
    prisma.subjectSummaryCase.count({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.PENDING_APPROVAL
      }
    }),
    prisma.subjectSummaryCase.count({
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
    totalCases: archivedCount + draftCount + pendingApprovalCount + publishedCount
  };
}

async function createSubjectSummaryAuditLog(
  actorUserId: string,
  action: string,
  resourceId: string,
  payload?: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: {
      action,
      payload,
      resource: resourceId,
      userId: actorUserId
    }
  });
}

function buildSubjectWhere(filters: SubjectSummarySubjectFilters): Prisma.SubjectSummarySubjectWhereInput {
  return {
    deletedAt: null,
    ...(filters.status === "all" ? {} : { status: filters.status }),
    ...(filters.search
      ? {
          OR: [
            {
              name: containsText(filters.search)
            },
            {
              description: containsText(filters.search)
            }
          ]
        }
      : {})
  };
}

function buildTopicWhere(filters: SubjectSummaryTopicFilters): Prisma.SubjectSummaryTopicWhereInput {
  return {
    deletedAt: null,
    subject: {
      deletedAt: null
    },
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status === "all" ? {} : { status: filters.status }),
    ...(filters.search
      ? {
          OR: [
            {
              name: containsText(filters.search)
            },
            {
              description: containsText(filters.search)
            },
            {
              subject: {
                name: containsText(filters.search)
              }
            }
          ]
        }
      : {})
  };
}

function buildCaseWhere(filters: SubjectSummaryCaseFilters): Prisma.SubjectSummaryCaseWhereInput {
  return {
    deletedAt: null,
    subject: {
      deletedAt: null
    },
    topic: {
      deletedAt: null
    },
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.topicId ? { topicId: filters.topicId } : {}),
    ...(filters.status === "all" ? {} : { status: filters.status }),
    ...(filters.search
      ? {
          OR: [
            {
              title: containsText(filters.search)
            },
            {
              citation: containsText(filters.search)
            },
            {
              court: containsText(filters.search)
            },
            {
              jurisdiction: containsText(filters.search)
            },
            {
              caseSummary: containsText(filters.search)
            },
            {
              topic: {
                name: containsText(filters.search)
              }
            },
            {
              subject: {
                name: containsText(filters.search)
              }
            }
          ]
        }
      : {})
  };
}

async function assertTopicBelongsToSubject(subjectId: string, topicId: string) {
  const topic = await prisma.subjectSummaryTopic.findFirst({
    where: {
      deletedAt: null,
      id: topicId,
      subjectId
    },
    select: {
      id: true
    }
  });

  if (!topic) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Selected topic does not belong to the chosen subject.",
        path: ["topicId"]
      }
    ]);
  }
}

export function parseSubjectSummarySubjectFilters(query: Record<string, string | string[] | undefined>) {
  return subjectFiltersSchema.parse({
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    sortBy: Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy,
    sortOrder: Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder,
    status: Array.isArray(query.status) ? query.status[0] : query.status
  });
}

export function parseSubjectSummaryTopicFilters(query: Record<string, string | string[] | undefined>) {
  return topicFiltersSchema.parse({
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    sortBy: Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy,
    sortOrder: Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder,
    status: Array.isArray(query.status) ? query.status[0] : query.status,
    subjectId: Array.isArray(query.subjectId) ? query.subjectId[0] : query.subjectId
  });
}

export function parseSubjectSummaryCaseFilters(query: Record<string, string | string[] | undefined>) {
  return caseFiltersSchema.parse({
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    sortBy: Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy,
    sortOrder: Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder,
    status: Array.isArray(query.status) ? query.status[0] : query.status,
    subjectId: Array.isArray(query.subjectId) ? query.subjectId[0] : query.subjectId,
    topicId: Array.isArray(query.topicId) ? query.topicId[0] : query.topicId
  });
}

export function parseSubjectSummaryHierarchyQuery(query: Record<string, string | string[] | undefined>) {
  return hierarchyQuerySchema.parse({
    search: Array.isArray(query.search) ? query.search[0] : query.search
  });
}

export function parseSubjectSummaryAutocompleteQuery(query: Record<string, string | string[] | undefined>) {
  return autocompleteQuerySchema.parse({
    limit: Array.isArray(query.limit) ? query.limit[0] : query.limit,
    query: Array.isArray(query.query) ? query.query[0] : query.query
  });
}

export function parseSubjectSummarySubjectInput(body: unknown) {
  return subjectInputSchema.parse(body);
}

export function parseSubjectSummaryTopicInput(body: unknown) {
  return topicInputSchema.parse(body);
}

export function parseSubjectSummaryCaseInput(body: unknown) {
  return caseInputSchema.parse(body);
}

export function parseSubjectSummarySubjectBulkAction(body: unknown) {
  return subjectBulkActionSchema.parse(body);
}

export function parseSubjectSummaryTopicBulkAction(body: unknown) {
  return topicBulkActionSchema.parse(body);
}

export function parseSubjectSummaryCaseBulkAction(body: unknown) {
  return caseBulkActionSchema.parse(body);
}

export async function listSubjectSummarySubjects(filters: SubjectSummarySubjectFilters) {
  const where = buildSubjectWhere(filters);
  const [items, totalItems, summary] = await Promise.all([
    prisma.subjectSummarySubject.findMany({
      where,
      orderBy: {
        [filters.sortBy]: filters.sortOrder
      },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        _count: {
          select: {
            cases: {
              where: {
                deletedAt: null
              }
            },
            topics: {
              where: {
                deletedAt: null
              }
            }
          }
        }
      }
    }),
    prisma.subjectSummarySubject.count({ where }),
    countSubjectStatuses()
  ]);

  return {
    items: items.map((item) => mapSubject(item)),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize))
    },
    summary
  };
}

export async function listSubjectSummaryTopics(filters: SubjectSummaryTopicFilters) {
  const where = buildTopicWhere(filters);
  const [items, totalItems, subjects, summary] = await Promise.all([
    prisma.subjectSummaryTopic.findMany({
      where,
      orderBy: {
        [filters.sortBy]: filters.sortOrder
      },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: {
            cases: {
              where: {
                deletedAt: null
              }
            }
          }
        }
      }
    }),
    prisma.subjectSummaryTopic.count({ where }),
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
    countTopicStatuses()
  ]);

  return {
    items: items.map((item) => mapTopic(item)),
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

export async function listSubjectSummaryCases(filters: SubjectSummaryCaseFilters) {
  const where = buildCaseWhere(filters);
  const [items, totalItems, subjects, topics, summary] = await Promise.all([
    prisma.subjectSummaryCase.findMany({
      where,
      orderBy: {
        [filters.sortBy]: filters.sortOrder
      },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        },
        topic: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.subjectSummaryCase.count({ where }),
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
    prisma.subjectSummaryTopic.findMany({
      where: {
        deletedAt: null,
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {})
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        subjectId: true
      }
    }),
    countCaseStatuses()
  ]);

  return {
    items: items.map((item) => mapCase(item)),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize))
    },
    subjects,
    summary,
    topics
  };
}

export async function getSubjectSummaryHierarchy(query: SubjectSummaryHierarchyQuery) {
  const subjects = await prisma.subjectSummarySubject.findMany({
    where: {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              {
                name: containsText(query.search)
              },
              {
                description: containsText(query.search)
              },
              {
                topics: {
                  some: {
                    deletedAt: null,
                    OR: [
                      {
                        name: containsText(query.search)
                      },
                      {
                        description: containsText(query.search)
                      }
                    ]
                  }
                }
              },
              {
                cases: {
                  some: {
                    deletedAt: null,
                    OR: [
                      {
                        title: containsText(query.search)
                      },
                      {
                        citation: containsText(query.search)
                      },
                      {
                        caseSummary: containsText(query.search)
                      }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          cases: {
            where: {
              deletedAt: null
            }
          },
          topics: {
            where: {
              deletedAt: null
            }
          }
        }
      }
    }
  });

  return {
    items: subjects.map((subject) => ({
      ...mapSubject(subject),
      hasTopics: subject._count.topics > 0
    }))
  };
}

export async function getSubjectSummaryHierarchyTopics(subjectId: string, query: SubjectSummaryHierarchyQuery) {
  const topics = await prisma.subjectSummaryTopic.findMany({
    where: {
      deletedAt: null,
      subjectId,
      ...(query.search
        ? {
            OR: [
              {
                name: containsText(query.search)
              },
              {
                description: containsText(query.search)
              },
              {
                cases: {
                  some: {
                    deletedAt: null,
                    OR: [
                      {
                        title: containsText(query.search)
                      },
                      {
                        citation: containsText(query.search)
                      }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          cases: {
            where: {
              deletedAt: null
            }
          }
        }
      }
    }
  });

  return {
    items: topics.map((topic) => ({
      ...mapTopic(topic),
      hasCases: topic._count.cases > 0
    }))
  };
}

export async function getSubjectSummaryHierarchyCases(topicId: string, query: SubjectSummaryHierarchyQuery) {
  const items = await prisma.subjectSummaryCase.findMany({
    where: {
      deletedAt: null,
      topicId,
      ...(query.search
        ? {
            OR: [
              {
                title: containsText(query.search)
              },
              {
                citation: containsText(query.search)
              },
              {
                court: containsText(query.search)
              },
              {
                caseSummary: containsText(query.search)
              }
            ]
          }
        : {})
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      topic: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return {
    items: items.map((item) => mapCase(item))
  };
}

export async function getPublishedSubjectSummaryHierarchy(query: SubjectSummaryHierarchyQuery) {
  const subjects = await prisma.subjectSummarySubject.findMany({
    where: {
      deletedAt: null,
      status: SubjectSummaryStatus.ACTIVE,
      topics: {
        some: {
          deletedAt: null,
          status: SubjectSummaryStatus.ACTIVE,
          cases: {
            some: {
              deletedAt: null,
              status: SubjectSummaryCaseStatus.PUBLISHED
            }
          }
        }
      },
      ...(query.search
        ? {
            OR: [
              {
                name: containsText(query.search)
              },
              {
                description: containsText(query.search)
              },
              {
                topics: {
                  some: {
                    deletedAt: null,
                    status: SubjectSummaryStatus.ACTIVE,
                    OR: [
                      {
                        name: containsText(query.search)
                      },
                      {
                        description: containsText(query.search)
                      },
                      {
                        cases: {
                          some: {
                            deletedAt: null,
                            status: SubjectSummaryCaseStatus.PUBLISHED,
                            OR: [
                              {
                                title: containsText(query.search)
                              },
                              {
                                citation: containsText(query.search)
                              },
                              {
                                caseSummary: containsText(query.search)
                              }
                            ]
                          }
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          cases: {
            where: {
              deletedAt: null,
              status: SubjectSummaryCaseStatus.PUBLISHED
            }
          },
          topics: {
            where: {
              deletedAt: null,
              status: SubjectSummaryStatus.ACTIVE
            }
          }
        }
      }
    }
  });

  return {
    items: subjects.map((subject) => ({
      ...mapSubject(subject),
      hasTopics: subject._count.topics > 0
    }))
  };
}

export async function getPublishedSubjectSummaryHierarchyTopics(subjectId: string, query: SubjectSummaryHierarchyQuery) {
  const topics = await prisma.subjectSummaryTopic.findMany({
    where: {
      deletedAt: null,
      status: SubjectSummaryStatus.ACTIVE,
      subjectId,
      cases: {
        some: {
          deletedAt: null,
          status: SubjectSummaryCaseStatus.PUBLISHED
        }
      },
      subject: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE
      },
      ...(query.search
        ? {
            OR: [
              {
                name: containsText(query.search)
              },
              {
                description: containsText(query.search)
              },
              {
                cases: {
                  some: {
                    deletedAt: null,
                    status: SubjectSummaryCaseStatus.PUBLISHED,
                    OR: [
                      {
                        title: containsText(query.search)
                      },
                      {
                        citation: containsText(query.search)
                      }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          cases: {
            where: {
              deletedAt: null,
              status: SubjectSummaryCaseStatus.PUBLISHED
            }
          }
        }
      }
    }
  });

  return {
    items: topics.map((topic) => ({
      ...mapTopic(topic),
      hasCases: topic._count.cases > 0
    }))
  };
}

export async function getPublishedSubjectSummaryHierarchyCases(topicId: string, query: SubjectSummaryHierarchyQuery) {
  const items = await prisma.subjectSummaryCase.findMany({
    where: {
      deletedAt: null,
      status: SubjectSummaryCaseStatus.PUBLISHED,
      topicId,
      subject: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE
      },
      topic: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE
      },
      ...(query.search
        ? {
            OR: [
              {
                title: containsText(query.search)
              },
              {
                citation: containsText(query.search)
              },
              {
                court: containsText(query.search)
              },
              {
                caseSummary: containsText(query.search)
              }
            ]
          }
        : {})
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      topic: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return {
    items: items.map((item) => mapCase(item))
  };
}

export async function getSubjectSummaryCaseDetail(caseId: string) {
  const item = await prisma.subjectSummaryCase.findFirst({
    where: {
      deletedAt: null,
      id: caseId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      topic: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return item ? mapCase(item) : null;
}

export async function getPublishedSubjectSummaryCaseDetail(caseId: string, userId?: string) {
  const item = await prisma.subjectSummaryCase.findFirst({
    where: {
      deletedAt: null,
      id: caseId,
      status: SubjectSummaryCaseStatus.PUBLISHED,
      subject: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE
      },
      topic: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE
      }
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      topic: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!item) {
    return null;
  }

  const mappedCase = mapCase(item);
  const contentAccess = userId
    ? await getPremiumContentAccess(userId)
    : {
        activeSubscriptionEndsAt: null,
        activeSubscriptionId: null,
        hasFullAccess: true,
        isPreview: false,
        previewWordLimit: PREMIUM_PREVIEW_WORD_LIMIT,
        requiresSubscription: false,
        upgradeMessage: ""
      };

  return {
    ...(contentAccess.hasFullAccess ? mappedCase : buildRestrictedCasePreview(mappedCase)),
    activeSubscriptionEndsAt: contentAccess.activeSubscriptionEndsAt?.toISOString() ?? null,
    hasFullAccess: contentAccess.hasFullAccess,
    isPreview: contentAccess.isPreview,
    previewWordLimit: contentAccess.previewWordLimit,
    requiresSubscription: contentAccess.requiresSubscription,
    upgradeMessage: contentAccess.upgradeMessage
  };
}

export async function recordSubjectSummaryCaseView(caseId: string, userId: string) {
  const item = await prisma.subjectSummaryCase.findFirst({
    where: {
      deletedAt: null,
      id: caseId
    },
    select: {
      id: true,
      subjectId: true,
      topicId: true
    }
  });

  if (!item) {
    return null;
  }

  await prisma.subjectSummaryCaseView.create({
    data: {
      caseId: item.id,
      subjectId: item.subjectId,
      topicId: item.topicId,
      userId
    }
  });

  return {
    success: true
  };
}

export async function getSubjectSummaryReadingInsights() {
  const views = await prisma.subjectSummaryCaseView.findMany({
    select: {
      caseId: true,
      subjectId: true,
      topicId: true
    }
  });

  const topSubjectGroup = getTopCountEntry(countOccurrences(views.map((view) => view.subjectId)));
  const topTopicGroup = getTopCountEntry(countOccurrences(views.map((view) => view.topicId)));
  const topCaseGroup = getTopCountEntry(countOccurrences(views.map((view) => view.caseId)));

  const [topSubject, topTopic, topCase] = await Promise.all([
    topSubjectGroup
      ? prisma.subjectSummarySubject.findFirst({
          where: {
            deletedAt: null,
            id: topSubjectGroup.id
          },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve(null),
    topTopicGroup
      ? prisma.subjectSummaryTopic.findFirst({
          where: {
            deletedAt: null,
            id: topTopicGroup.id
          },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve(null),
    topCaseGroup
      ? prisma.subjectSummaryCase.findFirst({
          where: {
            deletedAt: null,
            id: topCaseGroup.id
          },
          select: {
            id: true,
            title: true
          }
        })
      : Promise.resolve(null)
  ]);

  const items: ReadingInsight[] = [
    topSubject
      ? {
          id: topSubject.id,
          kind: "subject",
          label: topSubject.name,
          reads: topSubjectGroup?.reads ?? 0
        }
      : {
          id: "subject-empty",
          kind: "subject",
          label: "No subject reads yet",
          reads: 0
        },
    topTopic
      ? {
          id: topTopic.id,
          kind: "topic",
          label: topTopic.name,
          reads: topTopicGroup?.reads ?? 0
        }
      : {
          id: "topic-empty",
          kind: "topic",
          label: "No topic reads yet",
          reads: 0
        },
    topCase
      ? {
          id: topCase.id,
          kind: "case",
          label: topCase.title,
          reads: topCaseGroup?.reads ?? 0
        }
      : {
          id: "case-empty",
          kind: "case",
          label: "No case reads yet",
          reads: 0
        }
  ];

  return {
    items,
    totalReads: views.length
  };
}

export async function autocompleteSubjectSummaries(query: SubjectSummaryAutocompleteQuery) {
  const [subjects, topics, cases] = await Promise.all([
    prisma.subjectSummarySubject.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            name: containsText(query.query)
          },
          {
            description: containsText(query.query)
          }
        ]
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      take: query.limit,
      select: {
        id: true,
        name: true
      }
    }),
    prisma.subjectSummaryTopic.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            name: containsText(query.query)
          },
          {
            description: containsText(query.query)
          }
        ]
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      take: query.limit,
      include: {
        subject: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            title: containsText(query.query)
          },
          {
            citation: containsText(query.query)
          },
          {
            caseSummary: containsText(query.query)
          }
        ]
      },
      orderBy: [{ updatedAt: "desc" }],
      take: query.limit,
      include: {
        subject: {
          select: {
            name: true
          }
        },
        topic: {
          select: {
            name: true
          }
        }
      }
    })
  ]);

  return {
    items: [
      ...subjects.map((subject) => ({
        id: subject.id,
        label: subject.name,
        path: `/app/admin/library/subject-summaries/subjects?subjectId=${subject.id}`,
        subtitle: "Subject",
        type: "subject" as const
      })),
      ...topics.map((topic) => ({
        id: topic.id,
        label: topic.name,
        path: `/app/admin/library/subject-summaries/topics?subjectId=${topic.subjectId}`,
        subtitle: `Topic in ${topic.subject.name}`,
        type: "topic" as const
      })),
      ...cases.map((item) => ({
        id: item.id,
        label: item.title,
        path: `/app/admin/library/subject-summaries/cases/${item.id}`,
        subtitle: `${item.subject.name} / ${item.topic.name}`,
        type: "case" as const
      }))
    ].slice(0, query.limit)
  };
}

export async function autocompletePublishedSubjectSummaries(query: SubjectSummaryAutocompleteQuery) {
  const [subjects, topics, cases] = await Promise.all([
    prisma.subjectSummarySubject.findMany({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE,
        topics: {
          some: {
            deletedAt: null,
            status: SubjectSummaryStatus.ACTIVE,
            cases: {
              some: {
                deletedAt: null,
                status: SubjectSummaryCaseStatus.PUBLISHED
              }
            }
          }
        },
        OR: [
          {
            name: containsText(query.query)
          },
          {
            description: containsText(query.query)
          }
        ]
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      take: query.limit,
      select: {
        id: true,
        name: true
      }
    }),
    prisma.subjectSummaryTopic.findMany({
      where: {
        deletedAt: null,
        status: SubjectSummaryStatus.ACTIVE,
        cases: {
          some: {
            deletedAt: null,
            status: SubjectSummaryCaseStatus.PUBLISHED
          }
        },
        subject: {
          deletedAt: null,
          status: SubjectSummaryStatus.ACTIVE
        },
        OR: [
          {
            name: containsText(query.query)
          },
          {
            description: containsText(query.query)
          }
        ]
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      take: query.limit,
      include: {
        subject: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.PUBLISHED,
        subject: {
          deletedAt: null,
          status: SubjectSummaryStatus.ACTIVE
        },
        topic: {
          deletedAt: null,
          status: SubjectSummaryStatus.ACTIVE
        },
        OR: [
          {
            title: containsText(query.query)
          },
          {
            citation: containsText(query.query)
          },
          {
            caseSummary: containsText(query.query)
          }
        ]
      },
      orderBy: [{ updatedAt: "desc" }],
      take: query.limit,
      include: {
        subject: {
          select: {
            name: true
          }
        },
        topic: {
          select: {
            name: true
          }
        }
      }
    })
  ]);

  return {
    items: [
      ...subjects.map((subject) => ({
        id: subject.id,
        label: subject.name,
        path: `/app/library/subject-summaries?subjectId=${subject.id}`,
        subtitle: "Subject",
        type: "subject" as const
      })),
      ...topics.map((topic) => ({
        id: topic.id,
        label: topic.name,
        path: `/app/library/subject-summaries?subjectId=${topic.subjectId}&topicId=${topic.id}`,
        subtitle: `Topic in ${topic.subject.name}`,
        type: "topic" as const
      })),
      ...cases.map((item) => ({
        id: item.id,
        label: item.title,
        path: `/app/library/subject-summaries/cases/${item.id}`,
        subtitle: `${item.subject.name} / ${item.topic.name}`,
        type: "case" as const
      }))
    ].slice(0, query.limit)
  };
}

export async function createSubjectSummarySubject(input: SubjectSummarySubjectInput, actorUserId: string) {
  const subject = await prisma.subjectSummarySubject.create({
    data: {
      deletedAt: null,
      description: nullIfBlank(input.description),
      displayOrder: input.displayOrder,
      name: input.name,
      status: input.status
    },
    include: {
      _count: {
        select: {
          cases: true,
          topics: true
        }
      }
    }
  });

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.subject.created", subject.id, {
    name: subject.name,
    status: subject.status
  });

  return mapSubject(subject);
}

export async function updateSubjectSummarySubject(subjectId: string, input: SubjectSummarySubjectInput, actorUserId: string) {
  const existing = await prisma.subjectSummarySubject.findFirst({
    where: {
      deletedAt: null,
      id: subjectId
    }
  });

  if (!existing) {
    return null;
  }

  const subject = await prisma.subjectSummarySubject.update({
    where: {
      id: subjectId
    },
    data: {
      archivedAt: input.status === SubjectSummaryStatus.ARCHIVED ? new Date() : null,
      description: nullIfBlank(input.description),
      displayOrder: input.displayOrder,
      name: input.name,
      status: input.status
    },
    include: {
      _count: {
        select: {
          cases: {
            where: {
              deletedAt: null
            }
          },
          topics: {
            where: {
              deletedAt: null
            }
          }
        }
      }
    }
  });

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.subject.updated", subject.id, {
    name: subject.name,
    status: subject.status
  });

  return mapSubject(subject);
}

export async function deleteSubjectSummarySubject(subjectId: string, actorUserId: string) {
  const existing = await prisma.subjectSummarySubject.findFirst({
    where: {
      deletedAt: null,
      id: subjectId
    }
  });

  if (!existing) {
    return null;
  }

  const deletedAt = new Date();

  await runBatchTransaction([
    prisma.subjectSummarySubject.update({
      where: {
        id: subjectId
      },
      data: {
        deletedAt
      }
    }),
    prisma.subjectSummaryTopic.updateMany({
      where: {
        deletedAt: null,
        subjectId
      },
      data: {
        deletedAt
      }
    }),
    prisma.subjectSummaryCase.updateMany({
      where: {
        deletedAt: null,
        subjectId
      },
      data: {
        deletedAt
      }
    })
  ]);

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.subject.deleted", subjectId, {
    name: existing.name
  });

  return {
    id: subjectId,
    success: true
  };
}

export async function createSubjectSummaryTopic(input: SubjectSummaryTopicInput, actorUserId: string) {
  const subject = await prisma.subjectSummarySubject.findFirst({
    where: {
      deletedAt: null,
      id: input.subjectId
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!subject) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Choose a valid subject before saving the topic.",
        path: ["subjectId"]
      }
    ]);
  }

  const topic = await prisma.subjectSummaryTopic.create({
    data: {
      deletedAt: null,
      description: nullIfBlank(input.description),
      displayOrder: input.displayOrder,
      name: input.name,
      status: input.status,
      subjectId: input.subjectId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          cases: true
        }
      }
    }
  });

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.topic.created", topic.id, {
    name: topic.name,
    subjectId: topic.subjectId
  });

  return mapTopic(topic);
}

export async function updateSubjectSummaryTopic(topicId: string, input: SubjectSummaryTopicInput, actorUserId: string) {
  const existing = await prisma.subjectSummaryTopic.findFirst({
    where: {
      deletedAt: null,
      id: topicId
    }
  });

  if (!existing) {
    return null;
  }

  const subject = await prisma.subjectSummarySubject.findFirst({
    where: {
      deletedAt: null,
      id: input.subjectId
    },
    select: {
      id: true
    }
  });

  if (!subject) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Choose a valid subject before saving the topic.",
        path: ["subjectId"]
      }
    ]);
  }

  const topic = await prisma.subjectSummaryTopic.update({
    where: {
      id: topicId
    },
    data: {
      archivedAt: input.status === SubjectSummaryStatus.ARCHIVED ? new Date() : null,
      description: nullIfBlank(input.description),
      displayOrder: input.displayOrder,
      name: input.name,
      status: input.status,
      subjectId: input.subjectId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          cases: {
            where: {
              deletedAt: null
            }
          }
        }
      }
    }
  });

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.topic.updated", topic.id, {
    name: topic.name,
    subjectId: topic.subjectId
  });

  return mapTopic(topic);
}

export async function deleteSubjectSummaryTopic(topicId: string, actorUserId: string) {
  const existing = await prisma.subjectSummaryTopic.findFirst({
    where: {
      deletedAt: null,
      id: topicId
    }
  });

  if (!existing) {
    return null;
  }

  const deletedAt = new Date();

  await runBatchTransaction([
    prisma.subjectSummaryTopic.update({
      where: {
        id: topicId
      },
      data: {
        deletedAt
      }
    }),
    prisma.subjectSummaryCase.updateMany({
      where: {
        deletedAt: null,
        topicId
      },
      data: {
        deletedAt
      }
    })
  ]);

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.topic.deleted", topicId, {
    name: existing.name,
    subjectId: existing.subjectId
  });

  return {
    id: topicId,
    success: true
  };
}

export async function createSubjectSummaryCase(
  input: SubjectSummaryCaseInput,
  actorUserId: string,
  actorRoleCodes: string[] = []
) {
  await assertTopicBelongsToSubject(input.subjectId, input.topicId);
  const resolvedStatus = resolveCaseStatus(input.status, actorRoleCodes);

  const item = await prisma.subjectSummaryCase.create({
    data: {
      attachments: normalizeStringList(input.attachments),
      caseSummary: nullIfBlank(input.caseSummary),
      citation: nullIfBlank(input.citation),
      court: nullIfBlank(input.court),
      deletedAt: null,
      decisionHolding: nullIfBlank(input.decisionHolding),
      externalReferences: normalizeStringList(input.externalReferences),
      facts: nullIfBlank(input.facts),
      issues: nullIfBlank(input.issues),
      judges: normalizeStringList(input.judges),
      jurisdiction: nullIfBlank(input.jurisdiction),
      keywords: normalizeStringList(input.keywords),
      legalPrinciples: normalizeStringList(input.legalPrinciples),
      obiterDicta: nullIfBlank(input.obiterDicta),
      ratioDecidendi: nullIfBlank(input.ratioDecidendi),
      relatedCases: normalizeStringList(input.relatedCases),
      relatedStatutes: normalizeStringList(input.relatedStatutes),
      reviewFeedback: null,
      status: resolvedStatus,
      subjectId: input.subjectId,
      title: input.title,
      topicId: input.topicId,
      year: input.year ?? null
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      topic: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.case.created", item.id, {
    status: item.status,
    subjectId: item.subjectId,
    title: item.title,
    topicId: item.topicId
  });

  return mapCase(item);
}

export async function updateSubjectSummaryCase(
  caseId: string,
  input: SubjectSummaryCaseInput,
  actorUserId: string,
  actorRoleCodes: string[] = []
) {
  const existing = await prisma.subjectSummaryCase.findFirst({
    where: {
      deletedAt: null,
      id: caseId
    }
  });

  if (!existing) {
    return null;
  }

  await assertTopicBelongsToSubject(input.subjectId, input.topicId);

  const resolvedStatus = resolveCaseStatus(input.status, actorRoleCodes);

  const item = await prisma.subjectSummaryCase.update({
    where: {
      id: caseId
    },
    data: {
      archivedAt: resolvedStatus === SubjectSummaryCaseStatus.ARCHIVED ? new Date() : null,
      attachments: normalizeStringList(input.attachments),
      caseSummary: nullIfBlank(input.caseSummary),
      citation: nullIfBlank(input.citation),
      court: nullIfBlank(input.court),
      decisionHolding: nullIfBlank(input.decisionHolding),
      externalReferences: normalizeStringList(input.externalReferences),
      facts: nullIfBlank(input.facts),
      issues: nullIfBlank(input.issues),
      judges: normalizeStringList(input.judges),
      jurisdiction: nullIfBlank(input.jurisdiction),
      keywords: normalizeStringList(input.keywords),
      legalPrinciples: normalizeStringList(input.legalPrinciples),
      obiterDicta: nullIfBlank(input.obiterDicta),
      ratioDecidendi: nullIfBlank(input.ratioDecidendi),
      relatedCases: normalizeStringList(input.relatedCases),
      relatedStatutes: normalizeStringList(input.relatedStatutes),
      reviewFeedback: null,
      status: resolvedStatus,
      subjectId: input.subjectId,
      title: input.title,
      topicId: input.topicId,
      year: input.year ?? null
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      topic: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.case.updated", item.id, {
    status: item.status,
    subjectId: item.subjectId,
    title: item.title,
    topicId: item.topicId
  });

  return mapCase(item);
}

export async function deleteSubjectSummaryCase(caseId: string, actorUserId: string) {
  const existing = await prisma.subjectSummaryCase.findFirst({
    where: {
      deletedAt: null,
      id: caseId
    }
  });

  if (!existing) {
    return null;
  }

  await prisma.subjectSummaryCase.update({
    where: {
      id: caseId
    },
    data: {
      deletedAt: new Date()
    }
  });

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.case.deleted", caseId, {
    subjectId: existing.subjectId,
    title: existing.title,
    topicId: existing.topicId
  });

  return {
    id: caseId,
    success: true
  };
}

export async function bulkUpdateSubjectSummarySubjects(action: SubjectSummarySubjectBulkAction, actorUserId: string) {
  const now = new Date();

  if (action.action === "delete") {
    await runBatchTransaction([
      prisma.subjectSummarySubject.updateMany({
        where: {
          deletedAt: null,
          id: {
            in: action.ids
          }
        },
        data: {
          deletedAt: now
        }
      }),
      prisma.subjectSummaryTopic.updateMany({
        where: {
          deletedAt: null,
          subjectId: {
            in: action.ids
          }
        },
        data: {
          deletedAt: now
        }
      }),
      prisma.subjectSummaryCase.updateMany({
        where: {
          deletedAt: null,
          subjectId: {
            in: action.ids
          }
        },
        data: {
          deletedAt: now
        }
      })
    ]);
  } else {
    const status =
      action.action === "activate"
        ? SubjectSummaryStatus.ACTIVE
        : action.action === "deactivate"
          ? SubjectSummaryStatus.INACTIVE
          : SubjectSummaryStatus.ARCHIVED;

    await prisma.subjectSummarySubject.updateMany({
      where: {
        deletedAt: null,
        id: {
          in: action.ids
        }
      },
      data: {
        archivedAt: status === SubjectSummaryStatus.ARCHIVED ? now : null,
        status
      }
    });
  }

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.subject.bulk-updated", action.ids.join(","), action);

  return {
    success: true
  };
}

export async function bulkUpdateSubjectSummaryTopics(action: SubjectSummaryTopicBulkAction, actorUserId: string) {
  const now = new Date();

  if (action.action === "delete") {
    await runBatchTransaction([
      prisma.subjectSummaryTopic.updateMany({
        where: {
          deletedAt: null,
          id: {
            in: action.ids
          }
        },
        data: {
          deletedAt: now
        }
      }),
      prisma.subjectSummaryCase.updateMany({
        where: {
          deletedAt: null,
          topicId: {
            in: action.ids
          }
        },
        data: {
          deletedAt: now
        }
      })
    ]);
  } else {
    const status =
      action.action === "activate"
        ? SubjectSummaryStatus.ACTIVE
        : action.action === "deactivate"
          ? SubjectSummaryStatus.INACTIVE
          : SubjectSummaryStatus.ARCHIVED;

    await prisma.subjectSummaryTopic.updateMany({
      where: {
        deletedAt: null,
        id: {
          in: action.ids
        }
      },
      data: {
        archivedAt: status === SubjectSummaryStatus.ARCHIVED ? now : null,
        status
      }
    });
  }

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.topic.bulk-updated", action.ids.join(","), action);

  return {
    success: true
  };
}

export async function bulkUpdateSubjectSummaryCases(
  action: SubjectSummaryCaseBulkAction,
  actorUserId: string,
  actorRoleCodes: string[] = []
) {
  const now = new Date();

  if (action.action === "delete") {
    await prisma.subjectSummaryCase.updateMany({
      where: {
        deletedAt: null,
        id: {
          in: action.ids
        }
      },
      data: {
        deletedAt: now
      }
    });
  } else {
    const status =
      action.action === "publish"
        ? actorRoleCodes.includes("content_admin")
          ? SubjectSummaryCaseStatus.PENDING_APPROVAL
          : SubjectSummaryCaseStatus.PUBLISHED
        : action.action === "draft"
          ? SubjectSummaryCaseStatus.DRAFT
          : SubjectSummaryCaseStatus.ARCHIVED;

    await prisma.subjectSummaryCase.updateMany({
      where: {
        deletedAt: null,
        id: {
          in: action.ids
        }
      },
      data:
        action.action === "publish"
          ? {
              archivedAt: status === SubjectSummaryCaseStatus.ARCHIVED ? now : null,
              reviewFeedback: null,
              status
            }
          : {
              archivedAt: status === SubjectSummaryCaseStatus.ARCHIVED ? now : null,
              status
            }
    });
  }

  await createSubjectSummaryAuditLog(actorUserId, "admin.subject-summary.case.bulk-updated", action.ids.join(","), action);

  return {
    success: true
  };
}
