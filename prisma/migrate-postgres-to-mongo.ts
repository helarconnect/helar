import { createHash } from "node:crypto";

import { PrismaClient as MongoPrismaClient } from "@prisma/client";
import dotenv from "dotenv";

import { PrismaClient as PostgresPrismaClient } from "../generated/postgres-archive-client/index.js";

dotenv.config({
  path: ".env"
});

type Nullable<T> = T | null | undefined;

const postgres = new PostgresPrismaClient();
const mongo = new MongoPrismaClient();

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Use a deterministic 24-char hex string so UUID-based relations stay stable in Mongo.
function toObjectId(value: Nullable<string>) {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function logSection(title: string) {
  console.log(`\n== ${title} ==`);
}

async function migrateRows<TSource, TCreateInput extends { id: string }>(params: {
  createInput: (row: TSource) => TCreateInput;
  label: string;
  rows: TSource[];
  target: any;
  updateInput?: (row: TSource) => Partial<TCreateInput>;
}) {
  console.log(`Migrating ${params.label}: ${params.rows.length} row(s)`);

  for (const row of params.rows) {
    const create = params.createInput(row);

    await params.target.upsert({
      where: { id: create.id },
      update: params.updateInput ? params.updateInput(row) : create,
      create
    } as never);
  }
}

async function main() {
  requireEnv("DATABASE_URL");
  requireEnv("LEGACY_POSTGRES_DATABASE_URL");

  logSection("Reading PostgreSQL source data");

  const [
    users,
    roles,
    permissions,
    userRoles,
    rolePermissions,
    students,
    tutors,
    notifications,
    subscriptionPlans,
    subscriptions,
    payments,
    transactions,
    coupons,
    categories,
    studyMaterials,
    readingHistory,
    bookmarks,
    studyProgress,
    studyBookmarks,
    studyNotes,
    studyDownloads,
    subjects,
    topics,
    cases,
    entries,
    entryCases,
    caseViews,
    activityLogs,
    auditLogs,
    sessions,
    devices,
    courses,
    courseCategories,
    modules,
    lessons,
    enrollments,
    assignments,
    assignmentSubmissions,
    exams,
    cbtQuestions,
    cbtAnswers,
    examAttempts,
    examResults,
    progressTracking,
    discussionTopics,
    discussionAnswers,
    comments,
    discussionTopicVotes,
    replies,
    announcements,
    certificates,
    liveSessions
  ] = await Promise.all([
    postgres.user.findMany(),
    postgres.role.findMany(),
    postgres.permission.findMany(),
    postgres.userRole.findMany(),
    postgres.rolePermission.findMany(),
    postgres.student.findMany(),
    postgres.tutor.findMany(),
    postgres.notification.findMany(),
    postgres.subscriptionPlan.findMany(),
    postgres.subscription.findMany(),
    postgres.payment.findMany(),
    postgres.transaction.findMany(),
    postgres.coupon.findMany(),
    postgres.category.findMany(),
    postgres.studyMaterial.findMany(),
    postgres.readingHistory.findMany(),
    postgres.bookmark.findMany(),
    postgres.studentStudyProgress.findMany(),
    postgres.studentStudyBookmark.findMany(),
    postgres.studentStudyNote.findMany(),
    postgres.studentStudyDownload.findMany(),
    postgres.subjectSummarySubject.findMany(),
    postgres.subjectSummaryTopic.findMany(),
    postgres.subjectSummaryCase.findMany(),
    postgres.subjectSummaryEntry.findMany(),
    postgres.subjectSummaryEntryCase.findMany(),
    postgres.subjectSummaryCaseView.findMany(),
    postgres.activityLog.findMany(),
    postgres.auditLog.findMany(),
    postgres.session.findMany(),
    postgres.device.findMany(),
    postgres.course.findMany(),
    postgres.courseCategory.findMany(),
    postgres.module.findMany(),
    postgres.lesson.findMany(),
    postgres.enrollment.findMany(),
    postgres.assignment.findMany(),
    postgres.assignmentSubmission.findMany(),
    postgres.exam.findMany(),
    postgres.cbtQuestion.findMany(),
    postgres.cbtAnswer.findMany(),
    postgres.examAttempt.findMany(),
    postgres.examResult.findMany(),
    postgres.progressTracking.findMany(),
    postgres.discussionTopic.findMany(),
    postgres.discussionAnswer.findMany(),
    postgres.comment.findMany(),
    postgres.discussionTopicVote.findMany(),
    postgres.reply.findMany(),
    postgres.announcement.findMany(),
    postgres.certificate.findMany(),
    postgres.liveSession.findMany()
  ]);

  logSection("Writing MongoDB target data");

  await migrateRows({
    label: "roles",
    rows: roles,
    target: mongo.role,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      code: row.code,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "permissions",
    rows: permissions,
    target: mongo.permission,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      code: row.code,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "users",
    rows: users,
    target: mongo.user,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      email: row.email,
      passwordHash: row.passwordHash,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
      phoneNumber: row.phoneNumber,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
      status: row.status,
      emailVerifiedAt: row.emailVerifiedAt,
      sessionsRevokedAt: (row as { sessionsRevokedAt?: Date | null }).sessionsRevokedAt ?? null,
      twoFactorEnabled: row.twoFactorEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "user roles",
    rows: userRoles,
    target: mongo.userRole,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      roleId: toObjectId(row.roleId)!,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "role permissions",
    rows: rolePermissions,
    target: mongo.rolePermission,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      roleId: toObjectId(row.roleId)!,
      permissionId: toObjectId(row.permissionId)!,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "students",
    rows: students,
    target: mongo.student,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      headline: row.headline,
      studyHours: row.studyHours,
      streakDays: row.streakDays,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "tutors",
    rows: tutors,
    target: mongo.tutor,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      bio: row.bio,
      specialty: row.specialty,
      rating: row.rating,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "notifications",
    rows: notifications,
    target: mongo.notification,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      title: row.title,
      body: row.body,
      readAt: row.readAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "subscription plans",
    rows: subscriptionPlans,
    target: mongo.subscriptionPlan,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      code: row.code,
      name: row.name,
      interval: row.interval,
      priceMinor: row.priceMinor,
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "subscriptions",
    rows: subscriptions,
    target: mongo.subscription,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      planId: toObjectId(row.planId)!,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      autoRenew: row.autoRenew,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "payments",
    rows: payments,
    target: mongo.payment,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      subscriptionId: toObjectId(row.subscriptionId),
      provider: row.provider,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "transactions",
    rows: transactions,
    target: mongo.transaction,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      paymentId: toObjectId(row.paymentId)!,
      reference: row.reference,
      rawPayload: row.rawPayload,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "coupons",
    rows: coupons,
    target: mongo.coupon,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      code: row.code,
      description: row.description,
      percentOff: row.percentOff,
      amountOff: row.amountOff,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "categories",
    rows: categories,
    target: mongo.category,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      name: row.name,
      slug: row.slug,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "courses",
    rows: courses,
    target: mongo.course,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      description: row.description,
      level: row.level,
      thumbnailUrl: row.thumbnailUrl,
      tutorId: toObjectId(row.tutorId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "course categories",
    rows: courseCategories,
    target: mongo.courseCategory,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      courseId: toObjectId(row.courseId)!,
      categoryId: toObjectId(row.categoryId)!,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "modules",
    rows: modules,
    target: mongo.module,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      courseId: toObjectId(row.courseId)!,
      title: row.title,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "lessons",
    rows: lessons,
    target: mongo.lesson,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      moduleId: toObjectId(row.moduleId)!,
      title: row.title,
      content: row.content,
      durationMin: row.durationMin,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "enrollments",
    rows: enrollments,
    target: mongo.enrollment,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      courseId: toObjectId(row.courseId)!,
      studentId: toObjectId(row.studentId)!,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "study materials",
    rows: studyMaterials,
    target: mongo.studyMaterial,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      courseId: toObjectId(row.courseId),
      categoryId: toObjectId(row.categoryId),
      title: row.title,
      materialType: row.materialType,
      storageUrl: row.storageUrl,
      reportNumber: row.reportNumber,
      reportDate: row.reportDate,
      summary: row.summary,
      body: row.body,
      downloadable: row.downloadable,
      estimatedMins: row.estimatedMins,
      publicationStatus: row.publicationStatus,
      reviewFeedback: row.reviewFeedback,
      createdBy: toObjectId(row.createdBy),
      approvedBy: toObjectId(row.approvedBy),
      approvedAt: row.approvedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "assignments",
    rows: assignments,
    target: mongo.assignment,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      courseId: toObjectId(row.courseId)!,
      title: row.title,
      instructions: row.instructions,
      dueAt: row.dueAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "assignment submissions",
    rows: assignmentSubmissions,
    target: mongo.assignmentSubmission,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      assignmentId: toObjectId(row.assignmentId)!,
      userId: toObjectId(row.userId)!,
      fileUrl: row.fileUrl,
      score: row.score,
      feedback: row.feedback,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "exams",
    rows: exams,
    target: mongo.exam,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      courseId: toObjectId(row.courseId)!,
      title: row.title,
      durationMinutes: row.durationMinutes,
      randomQuestions: row.randomQuestions,
      randomAnswers: row.randomAnswers,
      negativeMarking: row.negativeMarking,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "CBT questions",
    rows: cbtQuestions,
    target: mongo.cbtQuestion,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      examId: toObjectId(row.examId)!,
      prompt: row.prompt,
      type: row.type,
      difficulty: row.difficulty,
      points: row.points,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "CBT answers",
    rows: cbtAnswers,
    target: mongo.cbtAnswer,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      questionId: toObjectId(row.questionId)!,
      label: row.label,
      isCorrect: row.isCorrect,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "exam attempts",
    rows: examAttempts,
    target: mongo.examAttempt,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      examId: toObjectId(row.examId)!,
      userId: toObjectId(row.userId)!,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "exam results",
    rows: examResults,
    target: mongo.examResult,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      attemptId: toObjectId(row.attemptId)!,
      score: row.score,
      passed: row.passed,
      gradedAt: row.gradedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "progress tracking",
    rows: progressTracking,
    target: mongo.progressTracking,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      lessonId: toObjectId(row.lessonId)!,
      completed: row.completed,
      progressPct: row.progressPct,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "reading history",
    rows: readingHistory,
    target: mongo.readingHistory,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      materialId: toObjectId(row.materialId)!,
      progressPct: row.progressPct,
      timeSpentSeconds: row.timeSpentSeconds,
      lastOpenedAt: row.lastOpenedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "bookmarks",
    rows: bookmarks,
    target: mongo.bookmark,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      materialId: toObjectId(row.materialId)!,
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "student study progress",
    rows: studyProgress,
    target: mongo.studentStudyProgress,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      contentType: row.contentType,
      contentKey: row.contentKey,
      title: row.title,
      path: row.path,
      subjectName: row.subjectName,
      topicName: row.topicName,
      lastPositionLabel: row.lastPositionLabel,
      scrollProgressPct: row.scrollProgressPct,
      readingProgressPct: row.readingProgressPct,
      timeSpentSeconds: row.timeSpentSeconds,
      completed: row.completed,
      lastOpenedAt: row.lastOpenedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "student study bookmarks",
    rows: studyBookmarks,
    target: mongo.studentStudyBookmark,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      contentType: row.contentType,
      contentKey: row.contentKey,
      title: row.title,
      path: row.path,
      subjectName: row.subjectName,
      topicName: row.topicName,
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "student study notes",
    rows: studyNotes,
    target: mongo.studentStudyNote,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      contentType: row.contentType,
      contentKey: row.contentKey,
      title: row.title,
      path: row.path,
      subjectName: row.subjectName,
      topicName: row.topicName,
      referenceTitle: row.referenceTitle,
      contentHtml: row.contentHtml,
      contentPlainText: row.contentPlainText,
      attachmentUrls: row.attachmentUrls,
      isDraft: row.isDraft,
      isFavorite: row.isFavorite,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "student study downloads",
    rows: studyDownloads,
    target: mongo.studentStudyDownload,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      contentType: row.contentType,
      contentKey: row.contentKey,
      fileName: row.fileName,
      path: row.path,
      subjectName: row.subjectName,
      topicName: row.topicName,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "subject summary subjects",
    rows: subjects,
    target: mongo.subjectSummarySubject,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      name: row.name,
      description: row.description,
      displayOrder: row.displayOrder,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "subject summary topics",
    rows: topics,
    target: mongo.subjectSummaryTopic,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      subjectId: toObjectId(row.subjectId)!,
      name: row.name,
      description: row.description,
      displayOrder: row.displayOrder,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "subject summary cases",
    rows: cases,
    target: mongo.subjectSummaryCase,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      subjectId: toObjectId(row.subjectId)!,
      topicId: toObjectId(row.topicId)!,
      title: row.title,
      citation: row.citation,
      court: row.court,
      judges: row.judges,
      year: row.year,
      jurisdiction: row.jurisdiction,
      caseSummary: row.caseSummary,
      facts: row.facts,
      issues: row.issues,
      decisionHolding: row.decisionHolding,
      ratioDecidendi: row.ratioDecidendi,
      obiterDicta: row.obiterDicta,
      legalPrinciples: row.legalPrinciples,
      relatedStatutes: row.relatedStatutes,
      relatedCases: row.relatedCases,
      keywords: row.keywords,
      attachments: row.attachments,
      externalReferences: row.externalReferences,
      status: row.status,
      reviewFeedback: row.reviewFeedback,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "subject summary entries",
    rows: entries,
    target: mongo.subjectSummaryEntry,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      subjectId: toObjectId(row.subjectId)!,
      question: row.question,
      answer: row.answer,
      keyPrinciple: row.keyPrinciple,
      examTip: row.examTip,
      relatedStatutes: row.relatedStatutes,
      tags: row.tags,
      difficulty: row.difficulty,
      estimatedReadingTime: row.estimatedReadingTime,
      displayOrder: row.displayOrder,
      status: row.status,
      reviewFeedback: row.reviewFeedback,
      createdBy: toObjectId(row.createdBy),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "subject summary entry links",
    rows: entryCases,
    target: mongo.subjectSummaryEntryCase,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      summaryId: toObjectId(row.summaryId)!,
      caseId: toObjectId(row.caseId)!,
      createdAt: row.createdAt
    })
  });

  await migrateRows({
    label: "subject summary case views",
    rows: caseViews,
    target: mongo.subjectSummaryCaseView,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      caseId: toObjectId(row.caseId)!,
      subjectId: toObjectId(row.subjectId)!,
      topicId: toObjectId(row.topicId)!,
      userId: toObjectId(row.userId)!,
      createdAt: row.createdAt
    })
  });

  await migrateRows({
    label: "activity logs",
    rows: activityLogs,
    target: mongo.activityLog,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId),
      action: row.action,
      context: row.context,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "audit logs",
    rows: auditLogs,
    target: mongo.auditLog,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId),
      action: row.action,
      resource: row.resource,
      payload: row.payload,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "sessions",
    rows: sessions,
    target: mongo.session,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      refreshHash: row.refreshHash,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "devices",
    rows: devices,
    target: mongo.device,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      name: row.name,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "discussion topics",
    rows: discussionTopics,
    target: mongo.discussionTopic,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      authorId: toObjectId(row.authorId)!,
      title: row.title,
      body: row.body,
      tags: row.tags,
      kind: row.kind,
      viewCount: row.viewCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "discussion answers",
    rows: discussionAnswers,
    target: mongo.discussionAnswer,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      topicId: toObjectId(row.topicId)!,
      authorId: toObjectId(row.authorId)!,
      body: row.body,
      accepted: row.accepted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "comments",
    rows: comments,
    target: mongo.comment,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      authorId: toObjectId(row.authorId)!,
      topicId: toObjectId(row.topicId),
      answerId: toObjectId(row.answerId),
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "discussion topic votes",
    rows: discussionTopicVotes,
    target: mongo.discussionTopicVote,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      topicId: toObjectId(row.topicId)!,
      userId: toObjectId(row.userId)!,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "replies",
    rows: replies,
    target: mongo.reply,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      authorId: toObjectId(row.authorId)!,
      commentId: toObjectId(row.commentId)!,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "announcements",
    rows: announcements,
    target: mongo.announcement,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      title: row.title,
      body: row.body,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "certificates",
    rows: certificates,
    target: mongo.certificate,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      userId: toObjectId(row.userId)!,
      courseId: toObjectId(row.courseId)!,
      certificateNo: row.certificateNo,
      qrCodeUrl: row.qrCodeUrl,
      issuedAt: row.issuedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  await migrateRows({
    label: "live sessions",
    rows: liveSessions,
    target: mongo.liveSession,
    createInput: (row) => ({
      id: toObjectId(row.id)!,
      courseId: toObjectId(row.courseId)!,
      provider: row.provider,
      sessionUrl: row.sessionUrl,
      startsAt: row.startsAt,
      recordingUrl: row.recordingUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    })
  });

  logSection("MongoDB counts");

  const counts = await Promise.all([
    mongo.user.count(),
    mongo.role.count(),
    mongo.permission.count(),
    mongo.course.count(),
    mongo.studyMaterial.count(),
    mongo.subjectSummarySubject.count(),
    mongo.subjectSummaryCase.count(),
    mongo.subjectSummaryEntry.count(),
    mongo.studentStudyNote.count(),
    mongo.notification.count(),
    mongo.session.count(),
    mongo.discussionTopic.count(),
    mongo.exam.count(),
    mongo.announcement.count()
  ]);

  console.log(
    JSON.stringify(
      {
        notifications: counts[8],
        permissions: counts[2],
        courses: counts[3],
        roles: counts[1],
        sessions: counts[10],
        studentStudyNotes: counts[7],
        studyMaterials: counts[4],
        subjectSummaryCases: counts[5],
        subjectSummaryEntries: counts[6],
        subjectSummarySubjects: counts[5],
        discussionTopics: counts[11],
        exams: counts[12],
        announcements: counts[13],
        users: counts[0]
      },
      null,
      2
    )
  );
}

main()
  .then(async () => {
    await Promise.all([postgres.$disconnect(), mongo.$disconnect()]);
  })
  .catch(async (error) => {
    console.error(error);
    await Promise.allSettled([postgres.$disconnect(), mongo.$disconnect()]);
    process.exit(1);
  });
