import { CbtStatus, DifficultyLevel, QuestionType, type Prisma } from "@prisma/client";
import { z } from "zod";

import { recordIdSchema } from "./lib/record-id.js";
import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";

const cbtFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).default(""),
  sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.union([z.nativeEnum(CbtStatus), z.literal("all")]).default("all"),
});

const questionFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).default(""),
  sortBy: z.enum(["createdAt", "updatedAt", "displayOrder"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  subjectId: recordIdSchema.optional().nullable(),
  topicId: recordIdSchema.optional().nullable(),
  questionType: z.union([z.nativeEnum(QuestionType), z.literal("all")]).default("all"),
  difficulty: z.union([z.nativeEnum(DifficultyLevel), z.literal("all")]).default("all"),
  onlyQuestionBank: z.coerce.boolean().default(false),
});

const cbtInputSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(3000).optional().default(""),
    instructions: z.string().trim().max(5000).optional().default(""),
    courseId: recordIdSchema.optional().nullable(),
    subjectId: recordIdSchema.optional().nullable(),
    topicId: recordIdSchema.optional().nullable(),
    learningMaterialId: recordIdSchema.optional().nullable(),
    durationSeconds: z.coerce.number().int().min(0).default(0),
    totalQuestions: z.coerce.number().int().min(0).default(0),
    questionsToAnswer: z.coerce.number().int().min(0).nullable().default(null),
    passPercentage: z.coerce.number().min(0).max(100).default(50),
    maxAttempts: z.coerce.number().int().min(1).default(1),
    startsAt: z.coerce.date().nullable().optional().default(null),
    endsAt: z.coerce.date().nullable().optional().default(null),
    isEnabled: z.coerce.boolean().default(true),
    showScoreOnCompletion: z.coerce.boolean().default(true),
    showCorrectAnswersOnCompletion: z.coerce.boolean().default(false),
    showExplanationsOnCompletion: z.coerce.boolean().default(false),
    status: z.nativeEnum(CbtStatus).default(CbtStatus.DRAFT),
    randomizeQuestions: z.coerce.boolean().default(true),
    randomizeAnswers: z.coerce.boolean().default(true),
  })
  .strict();

const questionInputSchema = z
  .object({
    prompt: z.string().trim().min(1),
    type: z.nativeEnum(QuestionType),
    difficulty: z.nativeEnum(DifficultyLevel).default(DifficultyLevel.INTERMEDIATE),
    points: z.coerce.number().min(0).default(1),
    explanation: z.string().trim().max(3000).optional().default(""),
    subjectId: recordIdSchema.optional().nullable(),
    topicId: recordIdSchema.optional().nullable(),
    displayOrder: z.coerce.number().int().min(0).default(0),
    isInQuestionBank: z.coerce.boolean().default(true),
    imageUrl: z.string().trim().max(500).nullable().optional().default(null),
    attachmentUrls: z.array(z.string().trim().max(500)).max(10).default([]),
    options: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(50),
          text: z.string().trim().min(1).optional().default(""),
          isCorrect: z.coerce.boolean().default(false),
          displayOrder: z.coerce.number().int().min(0).default(0),
        })
      )
      .default([]),
  })
  .strict();

export type CbtFilters = z.infer<typeof cbtFiltersSchema>;
export type QuestionFilters = z.infer<typeof questionFiltersSchema>;
export type CbtInput = z.infer<typeof cbtInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;

const notDeletedCbtWhere: Prisma.CbtWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedQuestionWhere: Prisma.CbtQuestionWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedQuestionOptionWhere: Prisma.CbtQuestionOptionWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedAttemptWhere: Prisma.CbtAttemptWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

function nullIfBlank(value: string) {
  return value.trim() ? value.trim() : null;
}

function validateQuestionInput(input: QuestionInput) {
  if (input.type === QuestionType.TRUE_FALSE) {
    if (input.options.length !== 2) {
      throw new Error("TRUE_FALSE_QUESTIONS_REQUIRE_TWO_OPTIONS");
    }

    const normalizedLabels = input.options.map((option) => option.label.trim().toLowerCase()).sort();
    const hasRequiredLabels = normalizedLabels[0] === "false" && normalizedLabels[1] === "true";

    if (!hasRequiredLabels) {
      throw new Error("TRUE_FALSE_QUESTIONS_MUST_USE_TRUE_AND_FALSE_OPTIONS");
    }
  }

  if (input.type === QuestionType.MULTIPLE_CHOICE || input.type === QuestionType.TRUE_FALSE) {
    if (input.options.length < 2) {
      throw new Error("CHOICE_QUESTIONS_REQUIRE_AT_LEAST_TWO_OPTIONS");
    }

    const correctCount = input.options.filter((option) => option.isCorrect).length;

    if (correctCount !== 1) {
      throw new Error("SINGLE_ANSWER_QUESTIONS_REQUIRE_ONE_CORRECT_OPTION");
    }
  }

  if (input.type === QuestionType.MULTIPLE_SELECT) {
    if (input.options.length < 2) {
      throw new Error("MULTIPLE_SELECT_QUESTIONS_REQUIRE_AT_LEAST_TWO_OPTIONS");
    }

    if (!input.options.some((option) => option.isCorrect)) {
      throw new Error("MULTIPLE_SELECT_QUESTIONS_REQUIRE_A_CORRECT_OPTION");
    }
  }

  if (input.type === QuestionType.SHORT_ANSWER) {
    const acceptedAnswers = input.options.filter((option) => option.isCorrect && (option.text.trim() || option.label.trim()));

    if (acceptedAnswers.length === 0) {
      throw new Error("SHORT_ANSWER_QUESTIONS_REQUIRE_ACCEPTED_ANSWERS");
    }
  }
}

type CbtAdminQuestionOptionRecord = {
  id: string;
  label: string;
  text: string | null;
  isCorrect: boolean;
  displayOrder: number;
};

type CbtAdminQuestionRecord = {
  id: string;
  cbtId: string | null;
  prompt: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  points: number;
  explanation: string | null;
  subjectId: string | null;
  topicId: string | null;
  displayOrder: number;
  isInQuestionBank: boolean;
  imageUrl: string | null;
  attachmentUrls: string[];
  createdAt: Date;
  updatedAt: Date;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  options?: CbtAdminQuestionOptionRecord[];
};

type CbtAdminRecord = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  courseId: string | null;
  subjectId: string | null;
  topicId: string | null;
  learningMaterialId: string | null;
  durationSeconds: number;
  totalQuestions: number;
  questionsToAnswer: number | null;
  passPercentage: number;
  maxAttempts: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isEnabled: boolean;
  showScoreOnCompletion: boolean;
  showCorrectAnswersOnCompletion: boolean;
  showExplanationsOnCompletion: boolean;
  status: CbtStatus;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  _count?: { questions: number; attempts: number };
  questions?: CbtAdminQuestionRecord[];
};

function mapCbt(cbt: CbtAdminRecord) {
  return {
    id: cbt.id,
    title: cbt.title,
    description: cbt.description ?? "",
    instructions: cbt.instructions ?? "",
    courseId: cbt.courseId,
    subjectId: cbt.subjectId,
    topicId: cbt.topicId,
    learningMaterialId: cbt.learningMaterialId,
    durationSeconds: cbt.durationSeconds,
    totalQuestions: cbt.totalQuestions,
    questionsToAnswer: cbt.questionsToAnswer,
    passPercentage: cbt.passPercentage,
    maxAttempts: cbt.maxAttempts,
    startsAt: cbt.startsAt?.toISOString() ?? null,
    endsAt: cbt.endsAt?.toISOString() ?? null,
    isEnabled: cbt.isEnabled,
    showScoreOnCompletion: cbt.showScoreOnCompletion,
    showCorrectAnswersOnCompletion: cbt.showCorrectAnswersOnCompletion,
    showExplanationsOnCompletion: cbt.showExplanationsOnCompletion,
    status: cbt.status,
    randomizeQuestions: cbt.randomizeQuestions,
    randomizeAnswers: cbt.randomizeAnswers,
    createdAt: cbt.createdAt.toISOString(),
    updatedAt: cbt.updatedAt.toISOString(),
    createdBy: cbt.createdBy,
    subject: cbt.subject ? { id: cbt.subject.id, name: cbt.subject.name } : null,
    topic: cbt.topic ? { id: cbt.topic.id, name: cbt.topic.name } : null,
    _count: cbt._count ?? { questions: 0, attempts: 0 },
    questions: cbt.questions ? cbt.questions.map(mapQuestion) : []
  };
}

function mapQuestion(question: CbtAdminQuestionRecord) {
  const options = question.options ?? [];
  return {
    id: question.id,
    cbtId: question.cbtId,
    prompt: question.prompt,
    type: question.type,
    difficulty: question.difficulty,
    points: question.points,
    explanation: question.explanation ?? "",
    subjectId: question.subjectId,
    topicId: question.topicId,
    displayOrder: question.displayOrder,
    isInQuestionBank: question.isInQuestionBank,
    imageUrl: question.imageUrl,
    attachmentUrls: question.attachmentUrls,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
    subject: question.subject ? { id: question.subject.id, name: question.subject.name } : null,
    topic: question.topic ? { id: question.topic.id, name: question.topic.name } : null,
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      text: option.text ?? "",
      isCorrect: option.isCorrect,
      displayOrder: option.displayOrder
    }))
  };
}

function buildCbtWhere(filters: CbtFilters): Prisma.CbtWhereInput {
  return {
    ...notDeletedCbtWhere,
    ...(filters.status === "all" ? {} : { status: filters.status }),
    ...(filters.search
      ? {
          OR: [
            { title: containsText(filters.search) },
            { description: containsText(filters.search) },
            { instructions: containsText(filters.search) },
          ],
        }
      : {}),
  };
}

function buildQuestionWhere(filters: QuestionFilters): Prisma.CbtQuestionWhereInput {
  return {
    ...notDeletedQuestionWhere,
    ...(filters.onlyQuestionBank ? { isInQuestionBank: true } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.topicId ? { topicId: filters.topicId } : {}),
    ...(filters.questionType === "all" ? {} : { type: filters.questionType }),
    ...(filters.difficulty === "all" ? {} : { difficulty: filters.difficulty }),
    ...(filters.search
      ? {
          OR: [{ prompt: containsText(filters.search) }, { explanation: containsText(filters.search) }],
        }
      : {}),
  };
}

export function parseCbtFilters(query: Record<string, string | string[] | undefined>) {
  return cbtFiltersSchema.parse({
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    sortBy: Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy,
    sortOrder: Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder,
    status: Array.isArray(query.status) ? query.status[0] : query.status,
  });
}

export function parseQuestionFilters(query: Record<string, string | string[] | undefined>) {
  return questionFiltersSchema.parse({
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    sortBy: Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy,
    sortOrder: Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder,
    subjectId: Array.isArray(query.subjectId) ? query.subjectId[0] : query.subjectId,
    topicId: Array.isArray(query.topicId) ? query.topicId[0] : query.topicId,
    questionType: Array.isArray(query.questionType) ? query.questionType[0] : query.questionType,
    difficulty: Array.isArray(query.difficulty) ? query.difficulty[0] : query.difficulty,
    onlyQuestionBank: Array.isArray(query.onlyQuestionBank) ? query.onlyQuestionBank[0] : query.onlyQuestionBank,
  });
}

export function parseCbtInput(body: unknown) {
  return cbtInputSchema.parse(body);
}

export function parseQuestionInput(body: unknown) {
  return questionInputSchema.parse(body);
}

export async function listCbts(filters: CbtFilters) {
  const where = buildCbtWhere(filters);
  const [items, totalItems, subjects, topics] = await Promise.all([
    prisma.cbt.findMany({
      where,
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    }),
    prisma.cbt.count({ where }),
    prisma.subjectSummarySubject.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.subjectSummaryTopic.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, subjectId: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return {
    cbts: items.map(mapCbt),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize)),
    },
    subjects,
    topics,
  };
}

export async function getCbtDetail(cbtId: string) {
  const cbt = await prisma.cbt.findFirst({
    where: { ...notDeletedCbtWhere, id: cbtId },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      questions: {
        where: notDeletedQuestionWhere,
        include: { options: { where: notDeletedQuestionOptionWhere, orderBy: { displayOrder: "asc" } } },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  return cbt ? mapCbt({ ...cbt, _count: { questions: cbt.questions.length, attempts: 0 } }) : null;
}

export async function createCbt(input: CbtInput, actorUserId: string) {
  const cbt = await prisma.cbt.create({
    data: {
      title: input.title,
      description: nullIfBlank(input.description),
      instructions: nullIfBlank(input.instructions),
      courseId: input.courseId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      learningMaterialId: input.learningMaterialId,
      durationSeconds: input.durationSeconds,
      totalQuestions: input.totalQuestions,
      questionsToAnswer: input.questionsToAnswer,
      passPercentage: input.passPercentage,
      maxAttempts: input.maxAttempts,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isEnabled: input.isEnabled,
      showScoreOnCompletion: input.showScoreOnCompletion,
      showCorrectAnswersOnCompletion: input.showCorrectAnswersOnCompletion,
      showExplanationsOnCompletion: input.showExplanationsOnCompletion,
      status: input.status,
      randomizeQuestions: input.randomizeQuestions,
      randomizeAnswers: input.randomizeAnswers,
      createdBy: actorUserId,
    },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return mapCbt(cbt);
}

export async function updateCbt(cbtId: string, input: CbtInput) {
  const existing = await prisma.cbt.findFirst({ where: { ...notDeletedCbtWhere, id: cbtId } });
  if (!existing) return null;

  const cbt = await prisma.cbt.update({
    where: { id: cbtId },
    data: {
      title: input.title,
      description: nullIfBlank(input.description),
      instructions: nullIfBlank(input.instructions),
      courseId: input.courseId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      learningMaterialId: input.learningMaterialId,
      durationSeconds: input.durationSeconds,
      totalQuestions: input.totalQuestions,
      questionsToAnswer: input.questionsToAnswer,
      passPercentage: input.passPercentage,
      maxAttempts: input.maxAttempts,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isEnabled: input.isEnabled,
      showScoreOnCompletion: input.showScoreOnCompletion,
      showCorrectAnswersOnCompletion: input.showCorrectAnswersOnCompletion,
      showExplanationsOnCompletion: input.showExplanationsOnCompletion,
      status: input.status,
      randomizeQuestions: input.randomizeQuestions,
      randomizeAnswers: input.randomizeAnswers,
    },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return mapCbt(cbt);
}

export async function deleteCbt(cbtId: string) {
  const existing = await prisma.cbt.findFirst({ where: { ...notDeletedCbtWhere, id: cbtId } });
  if (!existing) return null;

  const deletedAt = new Date();
  await prisma.cbt.update({ where: { id: cbtId }, data: { deletedAt } });

  return { id: cbtId, success: true };
}

export async function listQuestions(filters: QuestionFilters) {
  const where = buildQuestionWhere(filters);
  const [items, totalItems, subjects, topics] = await Promise.all([
    prisma.cbtQuestion.findMany({
      where,
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        options: { where: notDeletedQuestionOptionWhere, orderBy: { displayOrder: "asc" } },
      },
    }),
    prisma.cbtQuestion.count({ where }),
    prisma.subjectSummarySubject.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.subjectSummaryTopic.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, subjectId: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return {
    questions: items.map(mapQuestion),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize)),
    },
    subjects,
    topics,
  };
}

export async function getQuestionDetail(questionId: string) {
  const question = await prisma.cbtQuestion.findFirst({
    where: { ...notDeletedQuestionWhere, id: questionId },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      options: { where: notDeletedQuestionOptionWhere, orderBy: { displayOrder: "asc" } },
    },
  });

  return question ? mapQuestion(question) : null;
}

export async function createQuestion(input: QuestionInput, cbtId?: string) {
  validateQuestionInput(input);

  const question = await prisma.cbtQuestion.create({
    data: {
      cbtId,
      prompt: input.prompt,
      type: input.type,
      difficulty: input.difficulty,
      points: input.points,
      explanation: nullIfBlank(input.explanation),
      subjectId: input.subjectId,
      topicId: input.topicId,
      displayOrder: input.displayOrder,
      isInQuestionBank: input.isInQuestionBank,
      imageUrl: input.imageUrl,
      attachmentUrls: input.attachmentUrls,
      options: {
        create: input.options.map((option) => ({
          label: option.label,
          text: nullIfBlank(option.text),
          isCorrect: option.isCorrect,
          displayOrder: option.displayOrder,
        })),
      },
    },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      options: { where: notDeletedQuestionOptionWhere, orderBy: { displayOrder: "asc" } },
    },
  });

  return mapQuestion(question);
}

export async function updateQuestion(questionId: string, input: QuestionInput) {
  const existing = await prisma.cbtQuestion.findFirst({ where: { ...notDeletedQuestionWhere, id: questionId } });
  if (!existing) return null;

  validateQuestionInput(input);

  await prisma.cbtQuestionOption.deleteMany({ where: { questionId } });

  const question = await prisma.cbtQuestion.update({
    where: { id: questionId },
    data: {
      prompt: input.prompt,
      type: input.type,
      difficulty: input.difficulty,
      points: input.points,
      explanation: nullIfBlank(input.explanation),
      subjectId: input.subjectId,
      topicId: input.topicId,
      displayOrder: input.displayOrder,
      isInQuestionBank: input.isInQuestionBank,
      imageUrl: input.imageUrl,
      attachmentUrls: input.attachmentUrls,
      options: {
        create: input.options.map((option) => ({
          label: option.label,
          text: nullIfBlank(option.text),
          isCorrect: option.isCorrect,
          displayOrder: option.displayOrder,
        })),
      },
    },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      options: { where: notDeletedQuestionOptionWhere, orderBy: { displayOrder: "asc" } },
    },
  });

  return mapQuestion(question);
}

export async function deleteQuestion(questionId: string) {
  const existing = await prisma.cbtQuestion.findFirst({ where: { ...notDeletedQuestionWhere, id: questionId } });
  if (!existing) return null;

  const deletedAt = new Date();
  await prisma.cbtQuestion.update({ where: { id: questionId }, data: { deletedAt } });

  return { id: questionId, success: true };
}

export async function addQuestionToCbt(cbtId: string, questionId: string, displayOrder?: number) {
  const [cbt, question, siblingCount] = await Promise.all([
    prisma.cbt.findFirst({ where: { ...notDeletedCbtWhere, id: cbtId }, select: { id: true } }),
    prisma.cbtQuestion.findFirst({
      where: { ...notDeletedQuestionWhere, id: questionId },
      include: {
        options: {
          where: notDeletedQuestionOptionWhere,
          orderBy: { displayOrder: "asc" }
        }
      }
    }),
    prisma.cbtQuestion.count({ where: { ...notDeletedQuestionWhere, cbtId } })
  ]);

  if (!cbt) {
    throw new Error("CBT_NOT_FOUND");
  }

  if (!question) {
    throw new Error("QUESTION_NOT_FOUND");
  }

  await prisma.cbtQuestion.create({
    data: {
      cbtId,
      prompt: question.prompt,
      type: question.type,
      difficulty: question.difficulty,
      points: question.points,
      explanation: question.explanation,
      subjectId: question.subjectId,
      topicId: question.topicId,
      displayOrder: displayOrder ?? siblingCount + 1,
      isInQuestionBank: false,
      imageUrl: question.imageUrl,
      attachmentUrls: question.attachmentUrls,
      options: {
        create: question.options.map((option) => ({
          label: option.label,
          text: option.text,
          isCorrect: option.isCorrect,
          displayOrder: option.displayOrder
        }))
      }
    }
  });

  await prisma.cbt.update({
    where: { id: cbtId },
    data: {
      totalQuestions: await prisma.cbtQuestion.count({ where: { ...notDeletedQuestionWhere, cbtId } })
    }
  });

  return getCbtDetail(cbtId);
}

export async function removeQuestionFromCbt(cbtId: string, questionId: string) {
  const question = await prisma.cbtQuestion.findFirst({
    where: { ...notDeletedQuestionWhere, id: questionId, cbtId },
    select: { id: true, isInQuestionBank: true }
  });

  if (!question) {
    throw new Error("QUESTION_NOT_FOUND");
  }

  if (question.isInQuestionBank) {
    await prisma.cbtQuestion.update({
      where: { id: questionId },
      data: { cbtId: null }
    });
  } else {
    await prisma.cbtQuestion.update({
      where: { id: questionId },
      data: { deletedAt: new Date() }
    });
  }

  await prisma.cbt.update({
    where: { id: cbtId },
    data: {
      totalQuestions: await prisma.cbtQuestion.count({ where: { ...notDeletedQuestionWhere, cbtId } })
    }
  });

  return getCbtDetail(cbtId);
}

export async function duplicateCbt(cbtId: string, actorUserId: string) {
  const original = await prisma.cbt.findFirst({
    where: { ...notDeletedCbtWhere, id: cbtId },
    include: {
      questions: {
        where: notDeletedQuestionWhere,
        include: { options: { where: notDeletedQuestionOptionWhere } }
      }
    },
  });
  if (!original) return null;

  const duplicated = await prisma.cbt.create({
    data: {
      title: `${original.title} (Copy)`,
      description: original.description,
      instructions: original.instructions,
      courseId: original.courseId,
      subjectId: original.subjectId,
      topicId: original.topicId,
      learningMaterialId: original.learningMaterialId,
      durationSeconds: original.durationSeconds,
      totalQuestions: original.totalQuestions,
      questionsToAnswer: original.questionsToAnswer,
      passPercentage: original.passPercentage,
      maxAttempts: original.maxAttempts,
      startsAt: original.startsAt,
      endsAt: original.endsAt,
      isEnabled: original.isEnabled,
      showScoreOnCompletion: original.showScoreOnCompletion,
      showCorrectAnswersOnCompletion: original.showCorrectAnswersOnCompletion,
      showExplanationsOnCompletion: original.showExplanationsOnCompletion,
      status: CbtStatus.DRAFT,
      randomizeQuestions: original.randomizeQuestions,
      randomizeAnswers: original.randomizeAnswers,
      createdBy: actorUserId,
      questions: {
        create: original.questions.map((q) => ({
          prompt: q.prompt,
          type: q.type,
          difficulty: q.difficulty,
          points: q.points,
          explanation: q.explanation,
          subjectId: q.subjectId,
          topicId: q.topicId,
          displayOrder: q.displayOrder,
          isInQuestionBank: q.isInQuestionBank,
          imageUrl: q.imageUrl,
          attachmentUrls: q.attachmentUrls,
          options: {
            create: q.options.map((o) => ({
              label: o.label,
              text: o.text,
              isCorrect: o.isCorrect,
              displayOrder: o.displayOrder,
            })),
          },
        })),
      },
    },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return mapCbt(duplicated);
}

export async function publishCbt(cbtId: string) {
  const existing = await prisma.cbt.findFirst({ where: { ...notDeletedCbtWhere, id: cbtId } });

  if (!existing) {
    return null;
  }

  const questionCount = await prisma.cbtQuestion.count({
    where: { ...notDeletedQuestionWhere, cbtId }
  });

  if (questionCount <= 0) {
    throw new Error("Add at least one question before publishing this CBT.");
  }

  const cbt = await prisma.cbt.update({
    where: { id: cbtId },
    data: {
      isEnabled: true,
      status: CbtStatus.PUBLISHED,
      totalQuestions: questionCount
    },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      _count: { select: { questions: true, attempts: true } }
    }
  });

  return mapCbt(cbt);
}

export async function unpublishCbt(cbtId: string) {
  const existing = await prisma.cbt.findFirst({ where: { ...notDeletedCbtWhere, id: cbtId } });

  if (!existing) {
    return null;
  }

  const cbt = await prisma.cbt.update({
    where: { id: cbtId },
    data: {
      isEnabled: false,
      status: CbtStatus.DRAFT
    },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      _count: { select: { questions: true, attempts: true } }
    }
  });

  return mapCbt(cbt);
}

export async function getCbtResults(cbtId: string) {
  const [cbt, attempts] = await Promise.all([
    prisma.cbt.findFirst({ where: { ...notDeletedCbtWhere, id: cbtId } }),
    prisma.cbtAttempt.findMany({
      where: { ...notDeletedAttemptWhere, cbtId, submittedAt: { not: null } },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        results: { where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }, orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  if (!cbt) return null;

  const totalAttempts = attempts.length;
  const passedAttempts = attempts.filter((a) => a.results[0]?.passed).length;
  const averageScore =
    attempts.length > 0
      ? attempts.reduce((sum, a) => sum + (a.results[0]?.percentageScore ?? 0), 0) / attempts.length
      : 0;

  return {
    cbt: mapCbt({ ...cbt, _count: { questions: 0, attempts: totalAttempts } }),
    totalAttempts,
    passedAttempts,
    failedAttempts: totalAttempts - passedAttempts,
    averageScore: Math.round(averageScore * 100) / 100,
    highestScore: attempts.length
      ? Math.max(...attempts.map((a) => a.results[0]?.percentageScore ?? 0))
      : 0,
    lowestScore: attempts.length
      ? Math.min(...attempts.map((a) => a.results[0]?.percentageScore ?? 0))
      : 0,
    attempts: attempts.map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      userId: a.userId,
      user: a.user,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      result: a.results[0]
        ? {
            totalQuestions: a.results[0].totalQuestions,
            answeredCount: a.results[0].answeredCount,
            correctCount: a.results[0].correctCount,
            totalPoints: a.results[0].totalPoints,
            earnedPoints: a.results[0].earnedPoints,
            percentageScore: a.results[0].percentageScore,
            passed: a.results[0].passed,
          }
        : null,
    })),
  };
}
