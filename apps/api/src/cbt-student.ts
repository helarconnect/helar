import { CbtStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { recordIdSchema } from "./lib/record-id.js";
import { prisma } from "./lib/prisma.js";

const startAttemptSchema = z.object({
  cbtId: recordIdSchema,
});

const saveAnswerSchema = z.object({
  attemptId: recordIdSchema,
  questionId: recordIdSchema,
  selectedOptionIds: z.array(recordIdSchema).default([]),
  answerText: z.string().trim().optional().default(""),
  markedForReview: z.coerce.boolean().default(false),
});

const submitAttemptSchema = z.object({
  attemptId: recordIdSchema,
});

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

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

const notDeletedAnswerWhere: Prisma.CbtStudentAnswerWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedResultWhere: Prisma.CbtResultWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

export function parseStartAttemptInput(body: unknown) {
  return startAttemptSchema.parse(body);
}

export function parseSaveAnswerInput(body: unknown) {
  return saveAnswerSchema.parse(body);
}

export function parseSubmitAttemptInput(body: unknown) {
  return submitAttemptSchema.parse(body);
}

function normalizeAnswerText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function hashString(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getConfiguredQuestionCount(totalQuestions: number, questionsToAnswer: number | null | undefined) {
  if (!questionsToAnswer || questionsToAnswer <= 0) {
    return totalQuestions;
  }

  return Math.min(totalQuestions, questionsToAnswer);
}

type AttemptQuestionOptionLike = {
  id: string;
  displayOrder: number;
};

type AttemptQuestionLike<TOption extends AttemptQuestionOptionLike = AttemptQuestionOptionLike> = {
  id: string;
  displayOrder: number;
  options: TOption[];
};

function prepareAttemptQuestions<TOption extends AttemptQuestionOptionLike, TQuestion extends AttemptQuestionLike<TOption>>(
  attemptId: string,
  cbt: {
    questionsToAnswer?: number | null;
    randomizeAnswers?: boolean;
    randomizeQuestions?: boolean;
    questions: TQuestion[];
  }
) : TQuestion[] {
  const orderedQuestions = [...cbt.questions].sort((left, right) => {
    if (cbt.randomizeQuestions) {
      const leftHash = hashString(`${attemptId}:question:${left.id}`);
      const rightHash = hashString(`${attemptId}:question:${right.id}`);

      if (leftHash !== rightHash) {
        return leftHash - rightHash;
      }
    }

    return left.displayOrder - right.displayOrder;
  });

  const selectedQuestions = orderedQuestions
    .slice(0, getConfiguredQuestionCount(orderedQuestions.length, cbt.questionsToAnswer))
    .map((question) => ({
      ...question,
      options: [...question.options].sort((left, right) => {
        if (cbt.randomizeAnswers) {
          const leftHash = hashString(`${attemptId}:question:${question.id}:option:${left.id}`);
          const rightHash = hashString(`${attemptId}:question:${question.id}:option:${right.id}`);

          if (leftHash !== rightHash) {
            return leftHash - rightHash;
          }
        }

        return left.displayOrder - right.displayOrder;
      })
    }));

  return selectedQuestions;
}

function getAvailabilityStatus(
  cbt: {
    endsAt: Date | null;
    maxAttempts: number;
    startsAt: Date | null;
  },
  now: Date,
  attemptCount: number
): "upcoming" | "active" | "completed" {
  if (cbt.startsAt && cbt.startsAt > now) {
    return "upcoming";
  }

  if ((cbt.endsAt && cbt.endsAt < now) || attemptCount >= cbt.maxAttempts) {
    return "completed";
  }

  return "active";
}

function getQuestionReviewStatus(
  question: {
    options: Array<{ id: string; isCorrect: boolean; label?: string | null; text?: string | null }>;
    type: string;
  },
  answer:
    | {
        answerText?: string | null;
        selectedOptionIds: string[];
      }
    | null
) {
  if (!answer || (!answer.answerText?.trim() && answer.selectedOptionIds.length === 0)) {
    return "unanswered" as const;
  }

  if (question.type === "MULTIPLE_CHOICE" || question.type === "TRUE_FALSE") {
    const correctOption = question.options.find((option) => option.isCorrect);
    return correctOption && answer.selectedOptionIds.includes(correctOption.id) ? ("correct" as const) : ("incorrect" as const);
  }

  if (question.type === "MULTIPLE_SELECT") {
    const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
    const hasAllCorrect = correctOptionIds.every((optionId) => answer.selectedOptionIds.includes(optionId));
    const hasOnlyCorrect = answer.selectedOptionIds.every((optionId) => correctOptionIds.includes(optionId));
    return hasAllCorrect && hasOnlyCorrect ? ("correct" as const) : ("incorrect" as const);
  }

  if (question.type === "SHORT_ANSWER") {
    const acceptedAnswers = question.options
      .filter((option) => option.isCorrect)
      .map((option) => normalizeAnswerText(option.text ?? option.label))
      .filter(Boolean);

    return acceptedAnswers.includes(normalizeAnswerText(answer.answerText)) ? ("correct" as const) : ("incorrect" as const);
  }

  return "pending_review" as const;
}

type StudentCbtSummaryRecord = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  durationSeconds: number;
  totalQuestions: number;
  questionsToAnswer: number | null;
  passPercentage: number;
  maxAttempts: number;
  startsAt: Date | null;
  endsAt: Date | null;
  status: CbtStatus;
  isEnabled: boolean;
  questions?: Array<{ id: string }>;
};

type StudentAnswerMap = Record<
  string,
  {
    selectedOptionIds: string[];
    answerText: string;
    markedForReview: boolean;
  }
>;

function mapCbtForStudent(cbt: StudentCbtSummaryRecord, attemptCount: number, availabilityStatus: "upcoming" | "active" | "completed") {
  const attachedQuestionCount = cbt.questions?.length ?? cbt.totalQuestions;

  return {
    id: cbt.id,
    title: cbt.title,
    description: cbt.description ?? "",
    instructions: cbt.instructions ?? "",
    subject: cbt.subject ? { id: cbt.subject.id, name: cbt.subject.name } : null,
    topic: cbt.topic ? { id: cbt.topic.id, name: cbt.topic.name } : null,
    durationSeconds: cbt.durationSeconds,
    totalQuestions: getConfiguredQuestionCount(attachedQuestionCount, cbt.questionsToAnswer),
    passPercentage: cbt.passPercentage,
    maxAttempts: cbt.maxAttempts,
    startsAt: cbt.startsAt?.toISOString() ?? null,
    endsAt: cbt.endsAt?.toISOString() ?? null,
    status: cbt.status,
    availabilityStatus,
    isEnabled: cbt.isEnabled,
    attemptsRemaining: Math.max(0, cbt.maxAttempts - attemptCount),
  };
}

export async function listStudentCbts(userId: string) {
  const now = new Date();
  const [cbts, userAttempts] = await Promise.all([
    prisma.cbt.findMany({
      where: {
        ...notDeletedCbtWhere,
        status: CbtStatus.PUBLISHED,
        isEnabled: true,
      },
      include: {
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        questions: {
          where: notDeletedQuestionWhere,
          select: { id: true }
        }
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cbtAttempt.findMany({
      where: { ...notDeletedAttemptWhere, userId },
      select: { cbtId: true, id: true },
    }),
  ]);

  const attemptCounts = userAttempts.reduce((acc, a) => {
    acc[a.cbtId] = (acc[a.cbtId] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const publishedCbtsWithQuestions = cbts.filter((cbt) => getConfiguredQuestionCount(cbt.questions.length, cbt.questionsToAnswer) > 0);

  const upcoming = publishedCbtsWithQuestions.filter((cbt) => getAvailabilityStatus(cbt, now, attemptCounts[cbt.id] ?? 0) === "upcoming");
  const active = publishedCbtsWithQuestions.filter((cbt) => getAvailabilityStatus(cbt, now, attemptCounts[cbt.id] ?? 0) === "active");
  const completed = publishedCbtsWithQuestions.filter((cbt) => getAvailabilityStatus(cbt, now, attemptCounts[cbt.id] ?? 0) === "completed");

  return {
    upcoming: upcoming.map((cbt) => mapCbtForStudent(cbt, attemptCounts[cbt.id] ?? 0, "upcoming")),
    active: active.map((cbt) => mapCbtForStudent(cbt, attemptCounts[cbt.id] ?? 0, "active")),
    completed: completed.map((cbt) => mapCbtForStudent(cbt, attemptCounts[cbt.id] ?? 0, "completed")),
  };
}

export async function getCbtForStudent(cbtId: string, userId: string) {
  const cbt = await prisma.cbt.findFirst({
    where: { ...notDeletedCbtWhere, id: cbtId, status: CbtStatus.PUBLISHED, isEnabled: true },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      questions: {
        where: notDeletedQuestionWhere,
        select: { id: true }
      }
    },
  });
  if (!cbt) return null;
  if (getConfiguredQuestionCount(cbt.questions.length, cbt.questionsToAnswer) <= 0) return null;

  const attemptCount = await prisma.cbtAttempt.count({
    where: { ...notDeletedAttemptWhere, cbtId, userId },
  });

  const now = new Date();
  const availabilityStatus = getAvailabilityStatus(cbt, now, attemptCount);

  return mapCbtForStudent(cbt, attemptCount, availabilityStatus);
}

export async function startCbtAttempt(input: StartAttemptInput, userId: string) {
  const cbt = await prisma.cbt.findFirst({
    where: { ...notDeletedCbtWhere, id: input.cbtId, status: CbtStatus.PUBLISHED, isEnabled: true },
    include: {
      questions: {
        where: notDeletedQuestionWhere,
        select: { id: true }
      }
    }
  });
  if (!cbt) throw new Error("CBT not found or not available");

  const now = new Date();
  if (cbt.startsAt && cbt.startsAt > now) throw new Error("This CBT is not yet available.");
  if (cbt.endsAt && cbt.endsAt < now) throw new Error("This CBT is no longer available.");

  const existingAttemptCount = await prisma.cbtAttempt.count({
    where: { ...notDeletedAttemptWhere, cbtId: input.cbtId, userId },
  });
  if (existingAttemptCount >= cbt.maxAttempts) throw new Error("Maximum attempts exceeded");
  if (getConfiguredQuestionCount(cbt.questions.length, cbt.questionsToAnswer) <= 0) {
    throw new Error("This CBT does not have any available questions yet.");
  }

  const attempt = await prisma.cbtAttempt.create({
    data: {
      cbtId: input.cbtId,
      userId,
      attemptNumber: existingAttemptCount + 1,
      startedAt: new Date(),
    },
  });

  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    cbtId: attempt.cbtId,
    startedAt: attempt.startedAt.toISOString(),
  };
}

export async function getCbtAttemptForStudent(attemptId: string, userId: string) {
  const attempt = await prisma.cbtAttempt.findFirst({
    where: { ...notDeletedAttemptWhere, id: attemptId, userId },
    include: {
      cbt: {
        include: {
          questions: {
            where: notDeletedQuestionWhere,
            orderBy: { displayOrder: "asc" },
            include: {
              options: {
                where: notDeletedQuestionOptionWhere,
                orderBy: { displayOrder: "asc" }
              }
            }
          }
        }
      },
      answers: true,
      results: { where: notDeletedResultWhere, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!attempt) return null;
  const preparedQuestions = prepareAttemptQuestions(attempt.id, attempt.cbt);
  const latestResult = attempt.results[0] ?? null;

  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    cbtId: attempt.cbtId,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    cbt: {
      id: attempt.cbt.id,
      title: attempt.cbt.title,
      durationSeconds: attempt.cbt.durationSeconds,
      questions: preparedQuestions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        points: q.points,
        displayOrder: q.displayOrder,
        imageUrl: q.imageUrl,
        attachmentUrls: q.attachmentUrls,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          text: o.text ?? "",
        })),
      })),
    },
    answers: attempt.answers.reduce<StudentAnswerMap>((acc, a) => {
      acc[a.questionId] = {
        selectedOptionIds: a.selectedOptionIds,
        answerText: a.answerText ?? "",
        markedForReview: a.markedForReview,
      };
      return acc;
    }, {}),
    result: latestResult
      ? {
          totalQuestions: latestResult.totalQuestions,
          answeredCount: latestResult.answeredCount,
          correctCount: latestResult.correctCount,
          totalPoints: latestResult.totalPoints,
          earnedPoints: latestResult.earnedPoints,
          percentageScore: latestResult.percentageScore,
          passed: latestResult.passed,
        }
      : null,
  };
}

export async function saveCbtAnswer(input: SaveAnswerInput, userId: string) {
  const attempt = await prisma.cbtAttempt.findFirst({
    where: { ...notDeletedAttemptWhere, id: input.attemptId, userId },
    include: {
      cbt: {
        include: {
          questions: {
            where: notDeletedQuestionWhere,
            include: {
              options: {
                where: notDeletedQuestionOptionWhere
              }
            }
          }
        }
      }
    }
  });
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.submittedAt) throw new Error("Attempt already submitted");

  const preparedQuestions = prepareAttemptQuestions(attempt.id, attempt.cbt);
  const question = preparedQuestions.find((entry) => entry.id === input.questionId);
  if (!question) throw new Error("Question not found");
  const allowedOptionIds = new Set(question.options.map((option) => option.id));
  const hasInvalidOption = input.selectedOptionIds.some((optionId) => !allowedOptionIds.has(optionId));

  if (hasInvalidOption) {
    throw new Error("One or more selected answers are invalid for this question.");
  }

  const existingAnswer = await prisma.cbtStudentAnswer.findFirst({
    where: { ...notDeletedAnswerWhere, attemptId: input.attemptId, questionId: input.questionId },
  });

  const answer = existingAnswer
    ? await prisma.cbtStudentAnswer.update({
        where: { id: existingAnswer.id },
        data: {
          selectedOptionIds: input.selectedOptionIds,
          answerText: input.answerText,
          markedForReview: input.markedForReview,
        },
      })
    : await prisma.cbtStudentAnswer.create({
        data: {
          attemptId: input.attemptId,
          questionId: input.questionId,
          selectedOptionIds: input.selectedOptionIds,
          answerText: input.answerText,
          markedForReview: input.markedForReview,
        },
      });

  return {
    id: answer.id,
    questionId: answer.questionId,
    selectedOptionIds: answer.selectedOptionIds,
    answerText: answer.answerText ?? "",
    markedForReview: answer.markedForReview,
  };
}

export async function submitCbtAttempt(input: SubmitAttemptInput, userId: string) {
  const attempt = await prisma.cbtAttempt.findFirst({
    where: { ...notDeletedAttemptWhere, id: input.attemptId, userId },
    include: {
      cbt: { include: { questions: { where: notDeletedQuestionWhere, include: { options: { where: notDeletedQuestionOptionWhere } } } } },
      answers: true,
    },
  });
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.submittedAt) throw new Error("Attempt already submitted");

  const questions = prepareAttemptQuestions(attempt.id, attempt.cbt);
  const answers = attempt.answers;

  const totalQuestions = questions.length;
  const answeredCount = answers.length;
  let correctCount = 0;
  let totalPoints = 0;
  let earnedPoints = 0;
  let needsManualGrading = false;

  questions.forEach((q) => {
    totalPoints += q.points;
    const answer = answers.find((a) => a.questionId === q.id);
    if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") {
      const correctOption = q.options.find((o) => o.isCorrect);
      if (answer && correctOption && answer.selectedOptionIds.includes(correctOption.id)) {
        correctCount++;
        earnedPoints += q.points;
      }
    } else if (q.type === "MULTIPLE_SELECT") {
      const correctOptions = q.options.filter((o) => o.isCorrect);
      const correctIds = correctOptions.map((o) => o.id);
      if (answer) {
        const hasAllCorrect = correctIds.every((id) => answer.selectedOptionIds.includes(id));
        const hasNoIncorrect = answer.selectedOptionIds.every((id) => correctIds.includes(id));
        if (hasAllCorrect && hasNoIncorrect) {
          correctCount++;
          earnedPoints += q.points;
        }
      }
    } else if (q.type === "SHORT_ANSWER" || q.type === "ESSAY") {
      if (q.type === "SHORT_ANSWER") {
        const acceptedAnswers = q.options
          .filter((option) => option.isCorrect)
          .map((option) => normalizeAnswerText(option.text ?? option.label))
          .filter(Boolean);

        if (answer && acceptedAnswers.includes(normalizeAnswerText(answer.answerText))) {
          correctCount++;
          earnedPoints += q.points;
        }
      } else {
        needsManualGrading = true;
      }
    }
  });

  const percentageScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  const passed = percentageScore >= attempt.cbt.passPercentage;

  const now = new Date();

  await prisma.cbtAttempt.update({
    where: { id: attempt.id },
    data: { submittedAt: now, completedAt: now },
  });

  const existingResult = await prisma.cbtResult.findFirst({
    where: { ...notDeletedResultWhere, attemptId: attempt.id },
    orderBy: { createdAt: "desc" }
  });

  if (existingResult) {
    await prisma.cbtResult.update({
      where: { id: existingResult.id },
      data: {
        totalQuestions,
        answeredCount,
        correctCount,
        totalPoints,
        earnedPoints,
        percentageScore,
        passed,
        needsManualGrading
      }
    });
  } else {
    await prisma.cbtResult.create({
      data: {
        attemptId: attempt.id,
        totalQuestions,
        answeredCount,
        correctCount,
        totalPoints,
        earnedPoints,
        percentageScore,
        passed,
        needsManualGrading
      }
    });
  }

  return {
    result: {
      totalQuestions,
      answeredCount,
      correctCount,
      totalPoints,
      earnedPoints,
      percentageScore,
      passed,
      needsManualGrading,
    },
  };
}

export async function getStudentCbtResults(userId: string) {
  const attempts = await prisma.cbtAttempt.findMany({
    where: { ...notDeletedAttemptWhere, userId, submittedAt: { not: null } },
    include: { cbt: true, results: { where: notDeletedResultWhere, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { submittedAt: "desc" },
  });

  return {
    results: attempts.map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      cbtId: a.cbtId,
      cbtTitle: a.cbt.title,
      submittedAt: a.submittedAt!.toISOString(),
      result: a.results[0]
        ? {
            totalQuestions: a.results[0].totalQuestions,
            correctCount: a.results[0].correctCount,
            percentageScore: a.results[0].percentageScore,
            passed: a.results[0].passed
          }
        : null
    }))
  };
}

export async function getCbtAttemptResult(attemptId: string, userId: string) {
  const attempt = await prisma.cbtAttempt.findFirst({
    where: { ...notDeletedAttemptWhere, id: attemptId, userId },
    include: {
      cbt: {
        include: {
          questions: {
            where: notDeletedQuestionWhere,
            include: { options: { where: notDeletedQuestionOptionWhere }, subject: { select: { id: true, name: true } }, topic: { select: { id: true, name: true } } },
            orderBy: { displayOrder: "asc" },
          },
        },
      },
      answers: true,
      results: { where: notDeletedResultWhere, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!attempt) return null;
  const preparedQuestions = prepareAttemptQuestions(attempt.id, attempt.cbt);
  const latestResult = attempt.results[0] ?? null;

  return {
    cbt: {
      id: attempt.cbt.id,
      title: attempt.cbt.title,
      showScoreOnCompletion: attempt.cbt.showScoreOnCompletion,
      showCorrectAnswersOnCompletion: true,
      showExplanationsOnCompletion: attempt.cbt.showExplanationsOnCompletion,
    },
    result: latestResult
      ? {
          totalQuestions: latestResult.totalQuestions,
          answeredCount: latestResult.answeredCount,
          correctCount: latestResult.correctCount,
          totalPoints: latestResult.totalPoints,
          earnedPoints: latestResult.earnedPoints,
          percentageScore: latestResult.percentageScore,
          passed: latestResult.passed,
          needsManualGrading: latestResult.needsManualGrading,
        }
      : null,
    questions: preparedQuestions.map((q) => {
      const answer = attempt.answers.find((a) => a.questionId === q.id);
      const reviewStatus = getQuestionReviewStatus(q, answer ?? null);

      return {
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        points: q.points,
        explanation: q.explanation ?? "",
        reviewStatus,
        subject: q.subject,
        topic: q.topic,
        acceptedAnswers:
          q.type === "SHORT_ANSWER"
            ? q.options
                .filter((option) => option.isCorrect)
                .map((option) => (option.text ?? option.label ?? "").trim())
                .filter(Boolean)
            : [],
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          text: o.text ?? "",
          isCorrect: o.isCorrect,
        })),
        studentAnswer: answer
          ? {
              selectedOptionIds: answer.selectedOptionIds,
              answerText: answer.answerText ?? "",
              markedForReview: answer.markedForReview,
            }
          : null,
      };
    }),
  };
}
