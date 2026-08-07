import { BarFinalExamQuestionStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { recordIdSchema } from "./lib/record-id.js";
import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";

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
  const skip = (filters.page - 1) * filters.pageSize;

  const [items, totalItems, subjects] = await Promise.all([
    prisma.barFinalExamQuestion.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: filters.pageSize,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.barFinalExamQuestion.count({ where }),
    prisma.subjectSummarySubject.findMany({
      where: {
        deletedAt: null
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true
      }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));

  return {
    items: items.map(mapQuestion),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages
    },
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

export async function listStudentBarFinalExamSubjects(query: StudentBarFinalExamSubjectsQuery) {
  const questions = await prisma.barFinalExamQuestion.findMany({
    where: {
      deletedAt: null,
      status: BarFinalExamQuestionStatus.PUBLISHED,
      subject: {
        deletedAt: null,
        ...(query.search ? { name: containsText(query.search) } : {})
      }
    },
    distinct: ["subjectId"],
    orderBy: [{ subjectId: "asc" }],
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  const subjects = questions
    .map((item) => item.subject)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { subjects };
}

export async function listStudentBarFinalExamQuestions(query: StudentBarFinalExamQuestionsQuery) {
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

  return { items: questions };
}

export async function listAdminBarFinalExamMcqQuestions(filters: AdminBarFinalExamMcqQuestionFilters) {
  const where = buildAdminMcqWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;

  const [items, totalItems, subjects] = await Promise.all([
    prisma.barFinalExamMcqQuestion.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: filters.pageSize,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.barFinalExamMcqQuestion.count({ where }),
    prisma.subjectSummarySubject.findMany({
      where: {
        deletedAt: null
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true
      }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));

  return {
    items: items.map(mapMcqQuestion),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages
    },
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

export async function listStudentBarFinalExamMcqSubjects(query: StudentBarFinalExamSubjectsQuery) {
  const questions = await prisma.barFinalExamMcqQuestion.findMany({
    where: {
      deletedAt: null,
      status: BarFinalExamQuestionStatus.PUBLISHED,
      subject: {
        deletedAt: null,
        ...(query.search ? { name: containsText(query.search) } : {})
      }
    },
    distinct: ["subjectId"],
    orderBy: [{ subjectId: "asc" }],
    include: {
      subject: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  const subjects = questions
    .map((item) => item.subject)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { subjects };
}

export async function listStudentBarFinalExamMcqQuestions(query: StudentBarFinalExamMcqQuestionsQuery) {
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
      examDate: true,
      id: true,
      options: true,
      question: true
    }
  });

  return { items: questions.map((item) => ({ ...item, examDate: item.examDate?.toISOString() ?? null })) };
}

export async function submitStudentBarFinalExamMcqAttempt(
  userId: string,
  questionId: string,
  input: StudentBarFinalExamMcqAttemptInput
) {
  const question = await prisma.barFinalExamMcqQuestion.findFirst({
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
  });

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
    correctOptionIndex: question.correctOptionIndex,
    id: savedAttempt.id,
    isCorrect: savedAttempt.isCorrect,
    selectedOptionIndex: savedAttempt.selectedOptionIndex
  };
}
