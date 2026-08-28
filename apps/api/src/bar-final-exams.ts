import { BarFinalExamQuestionStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { recordIdSchema } from "./lib/record-id.js";
import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";
import {
  type PremiumContentAccess,
  PREMIUM_PREVIEW_WORD_LIMIT,
  createPreviewHtml,
  getPremiumContentAccess,
  truncateWords
} from "./premium-access.js";

// --- Case-insensitive + punctuation-tolerant search helpers (same semantics as portal-search) ---

function stripHtmlForSearch(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeBarSearchText(value: string): string {
  const withoutHtml = stripHtmlForSearch(value);
  const lower = withoutHtml.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized;
}

function tokenizeBarSearchQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalized = normalizeBarSearchText(trimmed);
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

function matchesBarSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const terms = tokenizeBarSearchQuery(query);
  if (terms.length === 0) return true;

  const rawHaystack = fields.filter((f): f is string => typeof f === "string" && f.length > 0).join(" ");
  const haystack = normalizeBarSearchText(rawHaystack);
  const collapsedHaystack = rawHaystack.toLowerCase().replace(/[^a-z0-9]/g, "");

  return terms.every((term) => haystack.includes(term) || collapsedHaystack.includes(term));
}

// Generic deterministic sort helper with tiebreaks
function barCompareWithTiebreak<T>(
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

const adminQuestionFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().max(160).default(""),
  status: z.union([z.nativeEnum(BarFinalExamQuestionStatus), z.literal("all")]).default("all"),
  subjectId: recordIdSchema.optional()
});

const questionInputSchema = z
  .object({
    answer: z.string().trim().min(2),
    examDate: z.string().trim().optional().or(z.literal("")),
    question: z.string().trim().min(2),
    status: z.nativeEnum(BarFinalExamQuestionStatus).default(BarFinalExamQuestionStatus.DRAFT),
    subjectId: recordIdSchema
  })
  .strict();

const studentSubjectsQuerySchema = z.object({
  search: z.string().trim().max(120).default("")
});

const studentQuestionsQuerySchema = z.object({
  subjectId: recordIdSchema
});

const adminMcqQuestionFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().max(160).default(""),
  status: z.union([z.nativeEnum(BarFinalExamQuestionStatus), z.literal("all")]).default("all"),
  subjectId: recordIdSchema.optional()
});

const mcqQuestionInputSchema = z
  .object({
    correctOptionIndex: z.coerce.number().int().min(0).max(10),
    examDate: z.string().trim().optional().or(z.literal("")),
    options: z
      .array(z.string().trim().min(1))
      .min(2)
      .max(6)
      .transform((items) => items.map((item) => item.trim()).filter(Boolean)),
    question: z.string().trim().min(2),
    status: z.nativeEnum(BarFinalExamQuestionStatus).default(BarFinalExamQuestionStatus.DRAFT),
    subjectId: recordIdSchema
  })
  .strict()
  .refine((value) => value.correctOptionIndex >= 0 && value.correctOptionIndex < value.options.length, {
    message: "Correct option must be within the options list."
  });

const studentMcqQuestionsQuerySchema = z.object({
  subjectId: recordIdSchema
});

const studentMcqAttemptSchema = z
  .object({
    selectedOptionIndex: z.coerce.number().int().min(0).max(10)
  })
  .strict();

export type AdminBarFinalExamQuestionFilters = z.infer<typeof adminQuestionFiltersSchema>;
export type BarFinalExamQuestionInput = z.infer<typeof questionInputSchema>;
export type StudentBarFinalExamSubjectsQuery = z.infer<typeof studentSubjectsQuerySchema>;
export type StudentBarFinalExamQuestionsQuery = z.infer<typeof studentQuestionsQuerySchema>;
export type AdminBarFinalExamMcqQuestionFilters = z.infer<typeof adminMcqQuestionFiltersSchema>;
export type BarFinalExamMcqQuestionInput = z.infer<typeof mcqQuestionInputSchema>;
export type StudentBarFinalExamMcqQuestionsQuery = z.infer<typeof studentMcqQuestionsQuerySchema>;
export type StudentBarFinalExamMcqAttemptInput = z.infer<typeof studentMcqAttemptSchema>;

export function parseAdminBarFinalExamQuestionFilters(query: Record<string, string | string[] | undefined>) {
  return adminQuestionFiltersSchema.parse(query);
}

export function parseBarFinalExamQuestionInput(payload: unknown) {
  return questionInputSchema.parse(payload);
}

export function parseStudentBarFinalExamSubjectsQuery(query: Record<string, string | string[] | undefined>) {
  return studentSubjectsQuerySchema.parse(query);
}

export function parseStudentBarFinalExamQuestionsQuery(query: Record<string, string | string[] | undefined>) {
  return studentQuestionsQuerySchema.parse(query);
}

function resolveQuestionStatus(inputStatus: BarFinalExamQuestionStatus, actorRoleCodes: string[] = []) {
  if (actorRoleCodes.includes("content_admin") && inputStatus === BarFinalExamQuestionStatus.PUBLISHED) {
    return BarFinalExamQuestionStatus.PENDING_APPROVAL;
  }

  return inputStatus;
}

function parseExamDate(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function parseAdminBarFinalExamMcqQuestionFilters(query: Record<string, string | string[] | undefined>) {
  return adminMcqQuestionFiltersSchema.parse(query);
}

export function parseBarFinalExamMcqQuestionInput(payload: unknown) {
  return mcqQuestionInputSchema.parse(payload);
}

export function parseStudentBarFinalExamMcqQuestionsQuery(query: Record<string, string | string[] | undefined>) {
  return studentMcqQuestionsQuerySchema.parse(query);
}

export function parseStudentBarFinalExamMcqAttemptInput(payload: unknown) {
  return studentMcqAttemptSchema.parse(payload);
}

function buildAdminWhere(filters: AdminBarFinalExamQuestionFilters): Prisma.BarFinalExamQuestionWhereInput {
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
            { question: containsText(filters.search) },
            { answer: containsText(filters.search) },
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

// Broad variant: keeps scoping filters but drops the search OR-clause for fallback candidate fetch
function buildBroadAdminWhere(filters: AdminBarFinalExamQuestionFilters): Prisma.BarFinalExamQuestionWhereInput {
  return {
    deletedAt: null,
    subject: {
      deletedAt: null
    },
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status === "all" ? {} : { status: filters.status })
  };
}

function mapQuestion(item: {
  id: string;
  subjectId: string;
  question: string;
  answer: string;
  examDate: Date | null;
  status: BarFinalExamQuestionStatus;
  createdAt: Date;
  updatedAt: Date;
  subject: {
    id: string;
    name: string;
  };
}) {
  return {
    answer: item.answer,
    createdAt: item.createdAt.toISOString(),
    examDate: item.examDate?.toISOString() ?? null,
    id: item.id,
    question: item.question,
    status: item.status,
    subject: item.subject,
    subjectId: item.subjectId,
    updatedAt: item.updatedAt.toISOString()
  };
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

function buildAdminMcqWhere(filters: AdminBarFinalExamMcqQuestionFilters): Prisma.BarFinalExamMcqQuestionWhereInput {
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
            { question: containsText(filters.search) },
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

// Broad variant for MCQ: drops search OR, keeps scoping
function buildBroadAdminMcqWhere(
  filters: AdminBarFinalExamMcqQuestionFilters
): Prisma.BarFinalExamMcqQuestionWhereInput {
  return {
    deletedAt: null,
    subject: {
      deletedAt: null
    },
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status === "all" ? {} : { status: filters.status })
  };
}

function mapMcqQuestion(item: {
  id: string;
  subjectId: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  examDate: Date | null;
  status: BarFinalExamQuestionStatus;
  createdAt: Date;
  updatedAt: Date;
  subject: {
    id: string;
    name: string;
  };
}) {
  return {
    correctOptionIndex: item.correctOptionIndex,
    createdAt: item.createdAt.toISOString(),
    examDate: item.examDate?.toISOString() ?? null,
    id: item.id,
    options: item.options,
    question: item.question,
    status: item.status,
    subject: item.subject,
    subjectId: item.subjectId,
    updatedAt: item.updatedAt.toISOString()
  };
}

// --- Subscription gating / preview helpers ---

type SerializedPremiumContentAccess = Omit<PremiumContentAccess, "activeSubscriptionEndsAt"> & {
  activeSubscriptionEndsAt: string | null;
};

function serializeContentAccess(access: PremiumContentAccess): SerializedPremiumContentAccess {
  return {
    ...access,
    activeSubscriptionEndsAt: access.activeSubscriptionEndsAt?.toISOString() ?? null
  };
}

// Strips the full answer down to a 150-word preview paragraph
function buildRestrictedQuestionPreview<T extends Record<string, unknown> & { answer: string }>(item: T): T {
  const previewText = truncateWords(item.answer, PREMIUM_PREVIEW_WORD_LIMIT).text;
  return {
    ...item,
    answer: createPreviewHtml(previewText, PREMIUM_PREVIEW_WORD_LIMIT) as unknown as T["answer"]
  };
}

// For MCQ questions: keep question + options; NULLIFY correctOptionIndex
function buildRestrictedMcqQuestionPreview<T extends Record<string, unknown>>(
  item: T
): T {
  return { ...item, correctOptionIndex: null } as T;
}

// Simple types for actual student question items (question list items are returned directly from DB select)
type StudentQuestionListItem = {
  id: string;
  question: string;
  answer: string;
  examDate: Date | null;
};

type StudentMcqQuestionListItem = {
  id: string;
  question: string;
  options: string[];
  examDate: Date | null;
};

export async function fetchBarFinalExamFormOptions() {
  const subjects = await prisma.subjectSummarySubject.findMany({
    where: {
      deletedAt: null
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true
    }
  });

  return { subjects };
}

export async function listAdminBarFinalExamQuestions(filters: AdminBarFinalExamQuestionFilters) {
  const where = buildAdminWhere(filters);
  const broadWhere = buildBroadAdminWhere(filters);
  const hasActiveSearch = filters.search.trim().length >= 2;
  const skip = (filters.page - 1) * filters.pageSize;

  const subjectsPromise = prisma.subjectSummarySubject.findMany({
    where: { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true }
  });

  if (!hasActiveSearch) {
    // Fast path: no search, use native Prisma count + pagination
    const [items, totalItems, subjects] = await Promise.all([
      prisma.barFinalExamQuestion.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: filters.pageSize,
        include: { subject: { select: { id: true, name: true } } }
      }),
      prisma.barFinalExamQuestion.count({ where }),
      subjectsPromise
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
    return {
      items: items.map(mapQuestion),
      pagination: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages },
      subjects
    };
  }

  // Memory pipeline: merge strict+broad candidates → filter by matchesSearch → sort → paginate → hydrate
  type CandidateRow = {
    id: string;
    question: string;
    answer: string;
    createdAt: Date;
    updatedAt: Date;
    subject: { id: string; name: string };
  };
  const candidateSelect = {
    id: true,
    question: true,
    answer: true,
    createdAt: true,
    updatedAt: true,
    subject: { select: { id: true, name: true } }
  } as const;

  const [dbStrictRows, dbBroadRows, subjects] = await Promise.all([
    prisma.barFinalExamQuestion.findMany({ select: candidateSelect, where }),
    prisma.barFinalExamQuestion.findMany({ select: candidateSelect, where: broadWhere }),
    subjectsPromise
  ]);

  const merged = new Map<string, CandidateRow>();
  for (const row of dbBroadRows as unknown as CandidateRow[]) merged.set(row.id, row);
  for (const row of dbStrictRows as unknown as CandidateRow[]) merged.set(row.id, row);
  const candidates = Array.from(merged.values());

  // Apply in-memory authoritative search (case-insensitive, punctuation-tolerant, AND semantics)
  const matched = candidates.filter((row) =>
    matchesBarSearch(filters.search, row.question, row.answer, row.subject.name)
  );

  // Deterministic sort: updatedAt DESC → createdAt DESC → id ASC
  matched.sort((a, b) => barCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt));

  const totalItems = matched.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
  const pageIds = matched.slice(skip, skip + filters.pageSize).map((r) => r.id);

  // Hydrate the exact page with full relations
  const hydrated = await prisma.barFinalExamQuestion.findMany({
    where: { id: { in: pageIds } },
    include: { subject: { select: { id: true, name: true } } }
  });

  // Reorder to match pageIds (Prisma `IN` does not preserve order)
  const hydratedById = new Map(hydrated.map((item) => [item.id, item]));
  const items = pageIds.map((id) => hydratedById.get(id)).filter(Boolean) as typeof hydrated;

  return {
    items: items.map(mapQuestion),
    pagination: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages },
    subjects
  };
}

export async function createAdminBarFinalExamQuestion(
  input: BarFinalExamQuestionInput,
  actorRoleCodes: string[] = [],
  actorUserId: string
) {
  const resolvedStatus = resolveQuestionStatus(input.status, actorRoleCodes);
  const resolvedExamDate = parseExamDate(input.examDate);

  const created = await prisma.barFinalExamQuestion.create({
    data: {
      answer: input.answer,
      deletedAt: null,
      examDate: resolvedExamDate,
      question: input.question,
      reviewFeedback: null,
      status: resolvedStatus,
      subjectId: input.subjectId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await createAuditLog(actorUserId, "admin.bar-final-exams.question.created", created.id, {
    status: created.status,
    subjectId: created.subjectId
  });

  return mapQuestion(created);
}

export async function getAdminBarFinalExamQuestion(questionId: string) {
  const question = await prisma.barFinalExamQuestion.findFirst({
    where: {
      deletedAt: null,
      id: questionId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!question) {
    return null;
  }

  return mapQuestion(question);
}

export async function updateAdminBarFinalExamQuestion(
  questionId: string,
  input: BarFinalExamQuestionInput,
  actorRoleCodes: string[] = [],
  actorUserId: string
) {
  const resolvedStatus = resolveQuestionStatus(input.status, actorRoleCodes);
  const resolvedExamDate = parseExamDate(input.examDate);

  const updated = await prisma.barFinalExamQuestion.update({
    where: {
      id: questionId
    },
    data: {
      answer: input.answer,
      examDate: resolvedExamDate,
      question: input.question,
      reviewFeedback: null,
      status: resolvedStatus,
      subjectId: input.subjectId,
      deletedAt: null
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await createAuditLog(actorUserId, "admin.bar-final-exams.question.updated", updated.id, {
    status: updated.status,
    subjectId: updated.subjectId
  });

  return mapQuestion(updated);
}

export async function deleteAdminBarFinalExamQuestion(questionId: string) {
  await prisma.barFinalExamQuestion.update({
    where: {
      id: questionId
    },
    data: {
      deletedAt: new Date()
    }
  });

  return { id: questionId, success: true };
}

export async function listStudentBarFinalExamSubjects(
  userId: string | null,
  query: StudentBarFinalExamSubjectsQuery
) {
  const hasActiveSearch = query.search.trim().length >= 2;
  const contentAccess = userId ? await getPremiumContentAccess(userId) : null;
  const gatedAccess = contentAccess ?? {
    activeSubscriptionEndsAt: null,
    activeSubscriptionId: null,
    hasFullAccess: false,
    isPreview: true,
    previewWordLimit: PREMIUM_PREVIEW_WORD_LIMIT,
    requiresSubscription: true,
    upgradeMessage:
      "Subscribe to unlock every Bar Final subject and the complete model answers. Your preview access is limited until your subscription is active."
  };

  const baseWhere: Prisma.BarFinalExamQuestionWhereInput = {
    deletedAt: null,
    status: BarFinalExamQuestionStatus.PUBLISHED,
    subject: { deletedAt: null }
  };

  const strictWhere: Prisma.BarFinalExamQuestionWhereInput = hasActiveSearch
    ? { ...baseWhere, subject: { deletedAt: null, name: containsText(query.search) } }
    : baseWhere;

  const questions = await prisma.barFinalExamQuestion.findMany({
    where: strictWhere,
    distinct: ["subjectId"],
    orderBy: [{ subjectId: "asc" }],
    include: { subject: { select: { id: true, name: true } } }
  });

  const subjectMap = new Map<string, { id: string; name: string }>();
  for (const q of questions) subjectMap.set(q.subject.id, q.subject);

  if (hasActiveSearch) {
    const broadQuestions = await prisma.barFinalExamQuestion.findMany({
      where: baseWhere,
      distinct: ["subjectId"],
      orderBy: [{ subjectId: "asc" }],
      include: { subject: { select: { id: true, name: true } } }
    });
    for (const q of broadQuestions) {
      if (matchesBarSearch(query.search, q.subject.name)) {
        subjectMap.set(q.subject.id, q.subject);
      }
    }
  }

  const subjects = Array.from(subjectMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  return {
    subjects,
    contentAccess: serializeContentAccess(gatedAccess)
  };
}

export async function listStudentBarFinalExamQuestions(
  userId: string | null,
  query: StudentBarFinalExamQuestionsQuery
) {
  const contentAccess = userId ? await getPremiumContentAccess(userId) : null;
  const gatedAccess = contentAccess ?? {
    activeSubscriptionEndsAt: null,
    activeSubscriptionId: null,
    hasFullAccess: false,
    isPreview: true,
    previewWordLimit: PREMIUM_PREVIEW_WORD_LIMIT,
    requiresSubscription: true,
    upgradeMessage:
      "Subscribe to unlock the complete model answers for every Bar Final exam question. Preview shows only the first portion of each answer."
  };

  const questions = await prisma.barFinalExamQuestion.findMany({
    where: {
      deletedAt: null,
      status: BarFinalExamQuestionStatus.PUBLISHED,
      subjectId: query.subjectId,
      subject: {
        deletedAt: null
      }
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      answer: true,
      examDate: true,
      id: true,
      question: true
    }
  });

  const items = questions.map((item) => {
    const serialized = { ...item, examDate: item.examDate?.toISOString() ?? null };
    return gatedAccess.hasFullAccess ? serialized : buildRestrictedQuestionPreview(serialized);
  });

  return {
    items,
    contentAccess: serializeContentAccess(gatedAccess)
  };
}

export async function listAdminBarFinalExamMcqQuestions(filters: AdminBarFinalExamMcqQuestionFilters) {
  const where = buildAdminMcqWhere(filters);
  const broadWhere = buildBroadAdminMcqWhere(filters);
  const hasActiveSearch = filters.search.trim().length >= 2;
  const skip = (filters.page - 1) * filters.pageSize;

  const subjectsPromise = prisma.subjectSummarySubject.findMany({
    where: { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true }
  });

  if (!hasActiveSearch) {
    // Fast path: no search, use native Prisma count + pagination
    const [items, totalItems, subjects] = await Promise.all([
      prisma.barFinalExamMcqQuestion.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: filters.pageSize,
        include: { subject: { select: { id: true, name: true } } }
      }),
      prisma.barFinalExamMcqQuestion.count({ where }),
      subjectsPromise
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
    return {
      items: items.map(mapMcqQuestion),
      pagination: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages },
      subjects
    };
  }

  // Memory pipeline
  type McqCandidateRow = {
    id: string;
    question: string;
    createdAt: Date;
    updatedAt: Date;
    subject: { id: string; name: string };
  };
  const mcqCandidateSelect = {
    id: true,
    question: true,
    createdAt: true,
    updatedAt: true,
    subject: { select: { id: true, name: true } }
  } as const;

  const [dbStrictRows, dbBroadRows, subjects] = await Promise.all([
    prisma.barFinalExamMcqQuestion.findMany({ select: mcqCandidateSelect, where }),
    prisma.barFinalExamMcqQuestion.findMany({ select: mcqCandidateSelect, where: broadWhere }),
    subjectsPromise
  ]);

  const merged = new Map<string, McqCandidateRow>();
  for (const row of dbBroadRows as unknown as McqCandidateRow[]) merged.set(row.id, row);
  for (const row of dbStrictRows as unknown as McqCandidateRow[]) merged.set(row.id, row);
  const candidates = Array.from(merged.values());

  // Apply in-memory search: question + subject.name
  const matched = candidates.filter((row) =>
    matchesBarSearch(filters.search, row.question, row.subject.name)
  );

  // Deterministic sort: updatedAt DESC → createdAt DESC → id ASC
  matched.sort((a, b) => barCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt));

  const totalItems = matched.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
  const pageIds = matched.slice(skip, skip + filters.pageSize).map((r) => r.id);

  const hydrated = await prisma.barFinalExamMcqQuestion.findMany({
    where: { id: { in: pageIds } },
    include: { subject: { select: { id: true, name: true } } }
  });

  const hydratedById = new Map(hydrated.map((item) => [item.id, item]));
  const items = pageIds.map((id) => hydratedById.get(id)).filter(Boolean) as typeof hydrated;

  return {
    items: items.map(mapMcqQuestion),
    pagination: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages },
    subjects
  };
}

export async function createAdminBarFinalExamMcqQuestion(
  input: BarFinalExamMcqQuestionInput,
  actorRoleCodes: string[] = [],
  actorUserId: string
) {
  const resolvedStatus = resolveQuestionStatus(input.status, actorRoleCodes);
  const resolvedExamDate = parseExamDate(input.examDate);

  const created = await prisma.barFinalExamMcqQuestion.create({
    data: {
      correctOptionIndex: input.correctOptionIndex,
      deletedAt: null,
      examDate: resolvedExamDate,
      options: input.options,
      question: input.question,
      reviewFeedback: null,
      status: resolvedStatus,
      subjectId: input.subjectId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await createAuditLog(actorUserId, "admin.bar-final-exams.mcq-question.created", created.id, {
    status: created.status,
    subjectId: created.subjectId
  });

  return mapMcqQuestion(created);
}

export async function getAdminBarFinalExamMcqQuestion(questionId: string) {
  const question = await prisma.barFinalExamMcqQuestion.findFirst({
    where: {
      deletedAt: null,
      id: questionId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!question) {
    return null;
  }

  return mapMcqQuestion(question);
}

export async function updateAdminBarFinalExamMcqQuestion(
  questionId: string,
  input: BarFinalExamMcqQuestionInput,
  actorRoleCodes: string[] = [],
  actorUserId: string
) {
  const resolvedStatus = resolveQuestionStatus(input.status, actorRoleCodes);
  const resolvedExamDate = parseExamDate(input.examDate);

  const updated = await prisma.barFinalExamMcqQuestion.update({
    where: {
      id: questionId
    },
    data: {
      correctOptionIndex: input.correctOptionIndex,
      deletedAt: null,
      examDate: resolvedExamDate,
      options: input.options,
      question: input.question,
      reviewFeedback: null,
      status: resolvedStatus,
      subjectId: input.subjectId
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await createAuditLog(actorUserId, "admin.bar-final-exams.mcq-question.updated", updated.id, {
    status: updated.status,
    subjectId: updated.subjectId
  });

  return mapMcqQuestion(updated);
}

export async function deleteAdminBarFinalExamMcqQuestion(questionId: string) {
  await prisma.barFinalExamMcqQuestion.update({
    where: {
      id: questionId
    },
    data: {
      deletedAt: new Date()
    }
  });

  return { id: questionId, success: true };
}

export async function listStudentBarFinalExamMcqSubjects(
  userId: string | null,
  query: StudentBarFinalExamSubjectsQuery
) {
  const hasActiveSearch = query.search.trim().length >= 2;
  const contentAccess = userId ? await getPremiumContentAccess(userId) : null;
  const gatedAccess = contentAccess ?? {
    activeSubscriptionEndsAt: null,
    activeSubscriptionId: null,
    hasFullAccess: false,
    isPreview: true,
    previewWordLimit: PREMIUM_PREVIEW_WORD_LIMIT,
    requiresSubscription: true,
    upgradeMessage:
      "Subscribe to unlock every Bar Final MCQ subject and reveal the correct answers. Preview access hides the answer key until your subscription is active."
  };

  const baseWhere: Prisma.BarFinalExamMcqQuestionWhereInput = {
    deletedAt: null,
    status: BarFinalExamQuestionStatus.PUBLISHED,
    subject: { deletedAt: null }
  };

  const strictWhere: Prisma.BarFinalExamMcqQuestionWhereInput = hasActiveSearch
    ? { ...baseWhere, subject: { deletedAt: null, name: containsText(query.search) } }
    : baseWhere;

  const questions = await prisma.barFinalExamMcqQuestion.findMany({
    where: strictWhere,
    distinct: ["subjectId"],
    orderBy: [{ subjectId: "asc" }],
    include: { subject: { select: { id: true, name: true } } }
  });

  const subjectMap = new Map<string, { id: string; name: string }>();
  for (const q of questions) subjectMap.set(q.subject.id, q.subject);

  if (hasActiveSearch) {
    const broadQuestions = await prisma.barFinalExamMcqQuestion.findMany({
      where: baseWhere,
      distinct: ["subjectId"],
      orderBy: [{ subjectId: "asc" }],
      include: { subject: { select: { id: true, name: true } } }
    });
    for (const q of broadQuestions) {
      if (matchesBarSearch(query.search, q.subject.name)) {
        subjectMap.set(q.subject.id, q.subject);
      }
    }
  }

  const subjects = Array.from(subjectMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  return {
    subjects,
    contentAccess: serializeContentAccess(gatedAccess)
  };
}

export async function listStudentBarFinalExamMcqQuestions(
  userId: string | null,
  query: StudentBarFinalExamMcqQuestionsQuery
) {
  const contentAccess = userId ? await getPremiumContentAccess(userId) : null;
  const gatedAccess = contentAccess ?? {
    activeSubscriptionEndsAt: null,
    activeSubscriptionId: null,
    hasFullAccess: false,
    isPreview: true,
    previewWordLimit: PREMIUM_PREVIEW_WORD_LIMIT,
    requiresSubscription: true,
    upgradeMessage:
      "Subscribe to unlock the answer key for every Bar Final MCQ question. Preview access hides the correct option index until your subscription is active."
  };

  const questions = await prisma.barFinalExamMcqQuestion.findMany({
    where: {
      deletedAt: null,
      status: BarFinalExamQuestionStatus.PUBLISHED,
      subjectId: query.subjectId,
      subject: {
        deletedAt: null
      }
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      correctOptionIndex: true,
      examDate: true,
      id: true,
      options: true,
      question: true
    }
  });

  const items = questions.map((item) => {
    const serialized = { ...item, examDate: item.examDate?.toISOString() ?? null };
    return gatedAccess.hasFullAccess ? serialized : buildRestrictedMcqQuestionPreview(serialized);
  });

  return {
    items,
    contentAccess: serializeContentAccess(gatedAccess)
  };
}

export async function submitStudentBarFinalExamMcqAttempt(
  userId: string,
  questionId: string,
  input: StudentBarFinalExamMcqAttemptInput
) {
  const [question, contentAccess] = await Promise.all([
    prisma.barFinalExamMcqQuestion.findFirst({
      where: {
        id: questionId,
        deletedAt: null,
        status: BarFinalExamQuestionStatus.PUBLISHED,
        subject: {
          deletedAt: null
        }
      },
      select: {
        correctOptionIndex: true,
        options: true,
        subjectId: true
      }
    }),
    getPremiumContentAccess(userId)
  ]);

  if (!question) {
    return null;
  }

  if (input.selectedOptionIndex < 0 || input.selectedOptionIndex >= question.options.length) {
    throw new Error("INVALID_OPTION");
  }

  const isCorrect = input.selectedOptionIndex === question.correctOptionIndex;

  const savedAttempt = await prisma.barFinalExamMcqAttempt.upsert({
    where: {
      userId_questionId: {
        userId,
        questionId
      }
    },
    create: {
      isCorrect,
      questionId,
      selectedOptionIndex: input.selectedOptionIndex,
      subjectId: question.subjectId,
      userId
    },
    update: {
      isCorrect,
      selectedOptionIndex: input.selectedOptionIndex,
      subjectId: question.subjectId
    }
  });

  return {
    correctOptionIndex: contentAccess.hasFullAccess ? question.correctOptionIndex : null,
    id: savedAttempt.id,
    isCorrect: contentAccess.hasFullAccess ? savedAttempt.isCorrect : null,
    selectedOptionIndex: savedAttempt.selectedOptionIndex,
    contentAccess: serializeContentAccess(contentAccess)
  };
}
