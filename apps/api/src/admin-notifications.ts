import type { Prisma } from "@prisma/client";
import { BarFinalExamQuestionStatus, ContentPublicationStatus, SubjectSummaryCaseStatus } from "@prisma/client";

import { prisma } from "./lib/prisma.js";
import { runInTransaction } from "./lib/transactions.js";

export type AdminNotificationItemType =
  | "library_material"
  | "subject_summary_case"
  | "subject_summary_entry"
  | "bar_final_exam_question"
  | "bar_final_exam_mcq_question"
  | "user_notification";

export type AdminNotificationCenterItem = {
  actionPath: string;
  body: string;
  canApprove: boolean;
  createdAt: string;
  id: string;
  resourceId: string | null;
  title: string;
  type: AdminNotificationItemType;
};

export type AdminApprovalQueueItem = {
  actionPath: string;
  contentTypeLabel: string;
  createdAt: string;
  editPath: string;
  id: string;
  reviewPath: string;
  resourceId: string;
  submittedBy: string;
  submittedRoleLabel: string;
  subtitle: string;
  title: string;
  type: Exclude<AdminNotificationItemType, "user_notification">;
};

export type AdminApprovalQueueSnapshot = {
  items: AdminApprovalQueueItem[];
  summary: {
    itemsSubmittedToday: number;
    barFinalExamQuestions: number;
    libraryMaterials: number;
    oldestPendingHours: number;
    subjectSummaryCases: number;
    subjectSummaryEntries: number;
    totalPending: number;
  };
};

function hasRole(roleCodes: string[], targetRoleCode: string) {
  return roleCodes.includes(targetRoleCode);
}

function isSuperAdmin(roleCodes: string[]) {
  return hasRole(roleCodes, "super_admin");
}

function decodeHtmlEntities(value: string) {
  if (!value) {
    return "";
  }

  const replaced = value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  return replaced
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPreviewTitle(value: string | null | undefined) {
  const normalized = stripHtml(decodeHtmlEntities(value ?? ""));

  if (!normalized) {
    return "Untitled";
  }

  const maxLength = 180;
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}…`;
}

async function createNotification(
  userId: string,
  title: string,
  body: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  await db.notification.create({
    data: {
      body,
      title,
      userId
    }
  });
}

async function runApprovalMutation<T>({
  buildNotification,
  createResult,
  loadPendingItem,
  notificationActions,
  updatePendingItem
}: {
  buildNotification: (item: T) => { body: string; title: string };
  createResult: (item: T) => { id: string; success: true };
  loadPendingItem: (tx: Prisma.TransactionClient) => Promise<T | null>;
  notificationActions: string[];
  updatePendingItem: (tx: Prisma.TransactionClient, item: T) => Promise<void>;
}) {
  return runInTransaction(async (tx) => {
    const item = await loadPendingItem(tx);

    if (!item) {
      return null;
    }

    await updatePendingItem(tx, item);

    const recipientUserId = await findLatestContentAdminActor(createResult(item).id, notificationActions);

    if (recipientUserId) {
      const notification = buildNotification(item);
      await createNotification(recipientUserId, notification.title, notification.body, tx);
    }

    return createResult(item);
  });
}

async function findLatestContentAdminActor(resourceId: string, actions: string[]) {
  const log = await prisma.auditLog.findFirst({
    where: {
      action: {
        in: actions
      },
      deletedAt: null,
      resource: resourceId,
      user: {
        deletedAt: null,
        roles: {
          some: {
            deletedAt: null,
            role: {
              code: "content_admin",
              deletedAt: null
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      userId: true
    }
  });

  return log?.userId ?? null;
}

async function findLatestContentAdminActorDetails(resourceId: string, actions: string[]) {
  const log = await prisma.auditLog.findFirst({
    where: {
      action: {
        in: actions
      },
      deletedAt: null,
      resource: resourceId,
      user: {
        deletedAt: null,
        roles: {
          some: {
            deletedAt: null,
            role: {
              code: "content_admin",
              deletedAt: null
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      createdAt: true,
      user: {
        select: {
          fullName: true
        }
      },
      userId: true
    }
  });

  return {
    createdAt: log?.createdAt ?? null,
    fullName: log?.user?.fullName ?? "Content admin",
    userId: log?.userId ?? null
  };
}

async function listPendingApprovalItems() {
  const [pendingLibraryMaterials, pendingCases, pendingEntries, pendingBarFinalExamQuestions] = await Promise.all([
    prisma.studyMaterial.findMany({
      where: {
        deletedAt: null,
        publicationStatus: ContentPublicationStatus.PENDING_APPROVAL
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 8,
      select: {
        category: {
          select: {
            slug: true
          }
        },
        id: true,
        title: true,
        updatedAt: true
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.PENDING_APPROVAL
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 8,
      select: {
        id: true,
        subject: {
          select: {
            name: true
          }
        },
        title: true,
        topic: {
          select: {
            name: true
          }
        },
        updatedAt: true
      }
    }),
    prisma.subjectSummaryEntry.findMany({
      where: {
        deletedAt: null,
        status: SubjectSummaryCaseStatus.PENDING_APPROVAL
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 8,
      select: {
        id: true,
        question: true,
        subject: {
          select: {
            name: true
          }
        },
        updatedAt: true
      }
    }),
    prisma.barFinalExamQuestion.findMany({
      where: {
        deletedAt: null,
        status: BarFinalExamQuestionStatus.PENDING_APPROVAL
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 8,
      select: {
        id: true,
        question: true,
        subject: {
          select: {
            name: true
          }
        },
        updatedAt: true
      }
    })
  ]);

  return [
    ...pendingLibraryMaterials.map<AdminNotificationCenterItem>((item) => ({
      actionPath: `/app/admin/library/${item.category?.slug ?? "law-reports"}`,
      body: "A content admin submission is waiting for super admin approval.",
      canApprove: true,
      createdAt: item.updatedAt.toISOString(),
      id: `library-material-${item.id}`,
      resourceId: item.id,
      title: item.title,
      type: "library_material"
    })),
    ...pendingCases.map<AdminNotificationCenterItem>((item) => ({
      actionPath: "/app/admin/library/subject-summaries/cases",
      body: `${item.subject.name} / ${item.topic.name} is waiting for approval.`,
      canApprove: true,
      createdAt: item.updatedAt.toISOString(),
      id: `subject-summary-case-${item.id}`,
      resourceId: item.id,
      title: item.title,
      type: "subject_summary_case"
    })),
    ...pendingEntries.map<AdminNotificationCenterItem>((item) => ({
      actionPath: "/app/admin/library/cases-and-ratios",
      body: `${item.subject.name} revision content is waiting for approval.`,
      canApprove: true,
      createdAt: item.updatedAt.toISOString(),
      id: `subject-summary-entry-${item.id}`,
      resourceId: item.id,
      title: buildPreviewTitle(item.question),
      type: "subject_summary_entry"
    })),
    ...pendingBarFinalExamQuestions.map<AdminNotificationCenterItem>((item) => ({
      actionPath: "/app/admin/bar-final-exams-nls-mcq",
      body: `${item.subject.name} bar final exam question is waiting for approval.`,
      canApprove: true,
      createdAt: item.updatedAt.toISOString(),
      id: `bar-final-exam-question-${item.id}`,
      resourceId: item.id,
      title: buildPreviewTitle(item.question),
      type: "bar_final_exam_question"
    }))
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function getSuperAdminApprovalQueue(): Promise<AdminApprovalQueueSnapshot> {
  // Fetch all pending items across 5 content tables in parallel. Includes MCQ questions
  // which were previously excluded from the approval queue/counts.
  const [
    pendingLibraryMaterials,
    pendingCases,
    pendingEntries,
    pendingBarFinalExamQuestions,
    pendingBarFinalExamMcqQuestions
  ] = await Promise.all([
    prisma.studyMaterial.findMany({
      where: {
        deletedAt: null,
        publicationStatus: ContentPublicationStatus.PENDING_APPROVAL
      },
      orderBy: { updatedAt: "desc" },
      select: {
        category: { select: { name: true, slug: true } },
        createdAt: true,
        createdBy: true,
        id: true,
        title: true,
        updatedAt: true
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.PENDING_APPROVAL },
      orderBy: { updatedAt: "desc" },
      select: {
        createdAt: true,
        id: true,
        subject: { select: { name: true } },
        title: true,
        topic: { select: { name: true } },
        updatedAt: true
      }
    }),
    prisma.subjectSummaryEntry.findMany({
      where: { deletedAt: null, status: SubjectSummaryCaseStatus.PENDING_APPROVAL },
      orderBy: { updatedAt: "desc" },
      select: {
        createdAt: true,
        createdBy: true,
        id: true,
        question: true,
        subject: { select: { name: true } },
        updatedAt: true
      }
    }),
    prisma.barFinalExamQuestion.findMany({
      where: { deletedAt: null, status: BarFinalExamQuestionStatus.PENDING_APPROVAL },
      orderBy: { updatedAt: "desc" },
      select: {
        createdAt: true,
        id: true,
        question: true,
        subject: { select: { name: true } },
        updatedAt: true
      }
    }),
    prisma.barFinalExamMcqQuestion.findMany({
      where: { deletedAt: null, status: BarFinalExamQuestionStatus.PENDING_APPROVAL },
      orderBy: { updatedAt: "desc" },
      select: {
        createdAt: true,
        id: true,
        question: true,
        subject: { select: { name: true } },
        updatedAt: true
      }
    })
  ]);

  // (1) Direct createdBy-based creators (these tables store createdBy on the row).
  const directUserIds = Array.from(
    new Set(
      [
        ...pendingLibraryMaterials.map((r) => r.createdBy),
        ...pendingEntries.map((r) => r.createdBy)
      ].filter((v): v is string => Boolean(v))
    )
  );

  // (2) Subject-summary cases / bar exam theory / bar exam MCQ rows do not have a createdBy
  // column on the model, so we resolve submitters via a SINGLE bulk audit-log query
  // (resourceIds IN ...) for a bounded set of audit actions per resource type.
  // This is O(1) queries instead of N+1 per item, and stays fast even with large queues.
  const caseIds = pendingCases.map((c) => c.id);
  const barQuestionIds = pendingBarFinalExamQuestions.map((q) => q.id);
  const barMcqIds = pendingBarFinalExamMcqQuestions.map((q) => q.id);
  const caseActions = ["admin.subject-summary.case.created", "admin.subject-summary.case.updated"];
  const barTheoryActions = ["admin.bar-final-exams.question.created", "admin.bar-final-exams.question.updated"];
  const barMcqActions = ["admin.bar-final-exams.mcq-question.created", "admin.bar-final-exams.mcq-question.updated"];

  const auditResourceIds = [...caseIds, ...barQuestionIds, ...barMcqIds];
  const auditActions = [...caseActions, ...barTheoryActions, ...barMcqActions];

  type AuditLookupRow = {
    action: string;
    createdAt: Date;
    resource: string | null;
    userId: string | null;
    user: { fullName: string } | null;
  };
  const auditMatches: AuditLookupRow[] = auditResourceIds.length
    ? await prisma.auditLog.findMany({
        where: {
          deletedAt: null,
          action: { in: auditActions },
          resource: { in: auditResourceIds },
          user: {
            deletedAt: null,
            roles: {
              some: {
                deletedAt: null,
                role: {
                  code: "content_admin",
                  deletedAt: null
                }
              }
            }
          }
        },
        // Order newest-first so when we iterate + group, the first entry per resource is the latest.
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          createdAt: true,
          resource: true,
          userId: true,
          user: { select: { fullName: true } }
        }
      })
    : [];

  // Latest audit actor grouped by resource id. Cases/theory/mcq share ids only within their own
  // id-space (Prisma ObjectIds are globally unique enough), but a single AuditLog.resource value
  // only ever refers to one table type per-query (it's the primary key for that content record).
  const auditByResourceId = new Map<string, AuditLookupRow>();
  for (const row of auditMatches) {
    if (!row.resource || auditByResourceId.has(row.resource)) {
      continue;
    }
    auditByResourceId.set(row.resource, row);
  }
  // Collect distinct user ids referenced by the audit matches, then bulk-lookup names once.
  const auditUserIds = Array.from(
    new Set(auditMatches.map((r) => r.userId).filter((v): v is string => Boolean(v)))
  );
  // Also union directUserIds so we run just ONE user lookup for both paths.
  const allDistinctUserIds = Array.from(new Set([...directUserIds, ...auditUserIds]));

  const userNamesById = new Map<string, string>();
  if (allDistinctUserIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { deletedAt: null, id: { in: allDistinctUserIds } },
      select: { id: true, fullName: true }
    });
    for (const user of users) {
      userNamesById.set(user.id, user.fullName);
    }
  }

  // Helper: given a pending item (with optional createdBy) and optional fallback audit row,
  // return { createdAt, fullName } for the submitter.
  const defaultActor = (
    item: { createdAt: Date; updatedAt: Date; createdBy?: string | null },
    auditRow?: AuditLookupRow | undefined
  ) => {
    const directName =
      item.createdBy && userNamesById.has(item.createdBy)
        ? (userNamesById.get(item.createdBy) as string)
        : null;
    const auditName =
      auditRow?.userId && userNamesById.has(auditRow.userId)
        ? (userNamesById.get(auditRow.userId) as string)
        : auditRow?.user?.fullName ?? null;
    return {
      createdAt: auditRow?.createdAt ?? item.createdAt ?? item.updatedAt,
      fullName: directName ?? auditName ?? "Content admin"
    };
  };

  const libraryItems: AdminApprovalQueueItem[] = pendingLibraryMaterials.map((item) => {
    const actor = defaultActor(item);
    return {
      actionPath: `/app/admin/library/${item.category?.slug ?? "law-reports"}`,
      contentTypeLabel: item.category?.name ?? "Library material",
      createdAt: actor.createdAt.toISOString(),
      editPath: `/app/admin/library/${item.category?.slug ?? "law-reports"}?edit=${item.id}`,
      id: `library-material-${item.id}`,
      reviewPath:
        item.category?.slug === "law-reports"
          ? `/app/admin/library/law-reports/${item.id}`
          : `/app/admin/library/${item.category?.slug ?? "law-reports"}?edit=${item.id}`,
      resourceId: item.id,
      submittedBy: actor.fullName,
      submittedRoleLabel: "Content Admin",
      subtitle: "Awaiting publication approval from super admin.",
      title: item.title,
      type: "library_material"
    };
  });

  const caseItems: AdminApprovalQueueItem[] = pendingCases.map((item) => {
    const actor = defaultActor(item, auditByResourceId.get(item.id));
    return {
      actionPath: "/app/admin/library/subject-summaries/cases",
      contentTypeLabel: "Subject Summary Case",
      createdAt: actor.createdAt.toISOString(),
      editPath: `/app/admin/library/subject-summaries/cases?editCase=${item.id}`,
      id: `subject-summary-case-${item.id}`,
      reviewPath: `/app/admin/library/subject-summaries/cases/${item.id}`,
      resourceId: item.id,
      submittedBy: actor.fullName,
      submittedRoleLabel: "Content Admin",
      subtitle: `${item.subject.name} / ${item.topic.name}`,
      title: item.title,
      type: "subject_summary_case"
    };
  });

  const entryItems: AdminApprovalQueueItem[] = pendingEntries.map((item) => {
    const actor = defaultActor(item);
    return {
      actionPath: "/app/admin/library/cases-and-ratios",
      contentTypeLabel: "Subject Summary",
      createdAt: actor.createdAt.toISOString(),
      editPath: `/app/admin/library/cases-and-ratios?editEntry=${item.id}`,
      id: `subject-summary-entry-${item.id}`,
      reviewPath: `/app/admin/library/cases-and-ratios?editEntry=${item.id}`,
      resourceId: item.id,
      submittedBy: actor.fullName,
      submittedRoleLabel: "Content Admin",
      subtitle: `${item.subject.name} revision guide`,
      title: buildPreviewTitle(item.question),
      type: "subject_summary_entry"
    };
  });

  const barFinalExamItems: AdminApprovalQueueItem[] = pendingBarFinalExamQuestions.map((item) => {
    const actor = defaultActor(item, auditByResourceId.get(item.id));
    return {
      actionPath: "/app/admin/bar-final-exams-nls-mcq",
      contentTypeLabel: "Bar Final Exam Question",
      createdAt: actor.createdAt.toISOString(),
      editPath: "/app/admin/bar-final-exams-nls-mcq",
      id: `bar-final-exam-question-${item.id}`,
      reviewPath: "/app/admin/bar-final-exams-nls-mcq",
      resourceId: item.id,
      submittedBy: actor.fullName,
      submittedRoleLabel: "Content Admin",
      subtitle: `${item.subject.name} bar final exams`,
      title: buildPreviewTitle(item.question),
      type: "bar_final_exam_question"
    };
  });

  // MCQ questions use the same review path (both theory + MCQ share the bar final exams nav entry).
  const barFinalExamMcqItems: AdminApprovalQueueItem[] = pendingBarFinalExamMcqQuestions.map((item) => {
    const actor = defaultActor(item, auditByResourceId.get(item.id));
    return {
      actionPath: "/app/admin/bar-final-exams-mcq",
      contentTypeLabel: "Bar Final Exam MCQ",
      createdAt: actor.createdAt.toISOString(),
      editPath: "/app/admin/bar-final-exams-mcq",
      id: `bar-final-exam-mcq-${item.id}`,
      reviewPath: "/app/admin/bar-final-exams-mcq",
      resourceId: item.id,
      submittedBy: actor.fullName,
      submittedRoleLabel: "Content Admin",
      subtitle: `${item.subject.name} bar final exams MCQ`,
      title: buildPreviewTitle(item.question),
      type: "bar_final_exam_mcq_question"
    };
  });

  const items = [
    ...libraryItems,
    ...caseItems,
    ...entryItems,
    ...barFinalExamItems,
    ...barFinalExamMcqItems
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return {
    items,
    summary: {
      itemsSubmittedToday: items.filter((item) => new Date(item.createdAt).getTime() >= startOfToday.getTime()).length,
      // barFinalExamQuestions summary now includes both NLS theory + MCQ pending items so the
      // hero counters match the total that the "Approve all pending" button will process.
      barFinalExamQuestions: barFinalExamItems.length + barFinalExamMcqItems.length,
      libraryMaterials: libraryItems.length,
      oldestPendingHours: items.length
        ? Math.max(
            1,
            Math.round((now - Math.min(...items.map((item) => new Date(item.createdAt).getTime()))) / (1000 * 60 * 60))
          )
        : 0,
      subjectSummaryCases: caseItems.length,
      subjectSummaryEntries: entryItems.length,
      totalPending: items.length
    }
  };
}

async function listUserNotifications(userId: string) {
  const notifications = await prisma.notification.findMany({
    where: {
      deletedAt: null,
      userId
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 12,
    select: {
      body: true,
      createdAt: true,
      id: true,
      title: true
    }
  });

  return notifications.map<AdminNotificationCenterItem>((item) => ({
    actionPath: "/app/dashboard",
    body: item.body,
    canApprove: false,
    createdAt: item.createdAt.toISOString(),
    id: item.id,
    resourceId: null,
    title: item.title,
    type: "user_notification"
  }));
}

export async function getAdminNotificationCenter(userId: string, roleCodes: string[]) {
  const [pendingItems, userNotifications, unreadCount] = await Promise.all([
    isSuperAdmin(roleCodes) ? listPendingApprovalItems() : Promise.resolve<AdminNotificationCenterItem[]>([]),
    listUserNotifications(userId),
    prisma.notification.count({
      where: {
        deletedAt: null,
        readAt: null,
        userId
      }
    })
  ]);

  const items = [...pendingItems, ...userNotifications].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

  return {
    items,
    unreadCount: unreadCount + pendingItems.length
  };
}

export async function markAdminNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: {
      deletedAt: null,
      readAt: null,
      userId
    },
    data: {
      readAt: new Date()
    }
  });

  return {
    success: true
  };
}

export async function approveLibraryMaterial(materialId: string, approverUserId: string) {
  return runApprovalMutation<{ id: string; title: string }>({
    buildNotification: (material) => ({
      body: `Your library item "${material.title}" was approved by the super admin and is now published.`,
      title: "Content approved"
    }),
    createResult: (material) => ({
      id: material.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.studyMaterial.findFirst({
        where: {
          deletedAt: null,
          id: materialId,
          publicationStatus: ContentPublicationStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          title: true
        }
      }),
    notificationActions: ["admin.library.material.created", "admin.library.material.updated"],
    updatePendingItem: async (tx, material) => {
      await tx.studyMaterial.update({
        where: {
          id: material.id
        },
        data: {
          approvedAt: new Date(),
          approvedBy: approverUserId,
          publicationStatus: ContentPublicationStatus.PUBLISHED,
          reviewFeedback: null
        }
      });
    }
  });
}

export async function approveSubjectSummaryCase(caseId: string) {
  return runApprovalMutation<{ id: string; title: string }>({
    buildNotification: (item) => ({
      body: `Your subject summary case "${item.title}" was approved by the super admin and is now published.`,
      title: "Case approved"
    }),
    createResult: (item) => ({
      id: item.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.subjectSummaryCase.findFirst({
        where: {
          deletedAt: null,
          id: caseId,
          status: SubjectSummaryCaseStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          title: true
        }
      }),
    notificationActions: ["admin.subject-summary.case.created", "admin.subject-summary.case.updated"],
    updatePendingItem: async (tx, item) => {
      await tx.subjectSummaryCase.update({
        where: {
          id: item.id
        },
        data: {
          archivedAt: null,
          reviewFeedback: null,
          status: SubjectSummaryCaseStatus.PUBLISHED
        }
      });
    }
  });
}

export async function approveSubjectSummaryEntry(entryId: string) {
  return runApprovalMutation<{ id: string; question: string }>({
    buildNotification: (entry) => ({
      body: `Your subject summary "${entry.question}" was approved by the super admin and is now published.`,
      title: "Subject summary approved"
    }),
    createResult: (entry) => ({
      id: entry.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.subjectSummaryEntry.findFirst({
        where: {
          deletedAt: null,
          id: entryId,
          status: SubjectSummaryCaseStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          question: true
        }
      }),
    notificationActions: ["subject_summary_entry_created", "subject_summary_entry_updated"],
    updatePendingItem: async (tx, entry) => {
      await tx.subjectSummaryEntry.update({
        where: {
          id: entry.id
        },
        data: {
          reviewFeedback: null,
          status: SubjectSummaryCaseStatus.PUBLISHED
        }
      });
    }
  });
}

export async function declineLibraryMaterial(materialId: string, reason: string) {
  return runApprovalMutation<{ id: string; title: string }>({
    buildNotification: (material) => ({
      body: `Your library item "${material.title}" was returned for revision by the super admin. Reason: ${reason}`,
      title: "Content declined"
    }),
    createResult: (material) => ({
      id: material.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.studyMaterial.findFirst({
        where: {
          deletedAt: null,
          id: materialId,
          publicationStatus: ContentPublicationStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          title: true
        }
      }),
    notificationActions: ["admin.library.material.created", "admin.library.material.updated"],
    updatePendingItem: async (tx, material) => {
      await tx.studyMaterial.update({
        where: {
          id: material.id
        },
        data: {
          approvedAt: null,
          approvedBy: null,
          publicationStatus: ContentPublicationStatus.DRAFT,
          reviewFeedback: reason
        }
      });
    }
  });
}

export async function declineSubjectSummaryCase(caseId: string, reason: string) {
  return runApprovalMutation<{ id: string; title: string }>({
    buildNotification: (item) => ({
      body: `Your subject summary case "${item.title}" was returned for revision by the super admin. Reason: ${reason}`,
      title: "Case declined"
    }),
    createResult: (item) => ({
      id: item.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.subjectSummaryCase.findFirst({
        where: {
          deletedAt: null,
          id: caseId,
          status: SubjectSummaryCaseStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          title: true
        }
      }),
    notificationActions: ["admin.subject-summary.case.created", "admin.subject-summary.case.updated"],
    updatePendingItem: async (tx, item) => {
      await tx.subjectSummaryCase.update({
        where: {
          id: item.id
        },
        data: {
          archivedAt: null,
          reviewFeedback: reason,
          status: SubjectSummaryCaseStatus.DRAFT
        }
      });
    }
  });
}

export async function declineSubjectSummaryEntry(entryId: string, reason: string) {
  return runApprovalMutation<{ id: string; question: string }>({
    buildNotification: (entry) => ({
      body: `Your subject summary "${entry.question}" was returned for revision by the super admin. Reason: ${reason}`,
      title: "Subject summary declined"
    }),
    createResult: (entry) => ({
      id: entry.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.subjectSummaryEntry.findFirst({
        where: {
          deletedAt: null,
          id: entryId,
          status: SubjectSummaryCaseStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          question: true
        }
      }),
    notificationActions: ["subject_summary_entry_created", "subject_summary_entry_updated"],
    updatePendingItem: async (tx, entry) => {
      await tx.subjectSummaryEntry.update({
        where: {
          id: entry.id
        },
        data: {
          reviewFeedback: reason,
          status: SubjectSummaryCaseStatus.DRAFT
        }
      });
    }
  });
}

export async function approveBarFinalExamQuestion(questionId: string, approverUserId: string) {
  return runApprovalMutation<{ id: string; question: string }>({
    buildNotification: (item) => ({
      body: `Your bar final exam question "${item.question}" was approved by the super admin and is now published.`,
      title: "Bar final exam approved"
    }),
    createResult: (item) => ({
      id: item.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.barFinalExamQuestion.findFirst({
        where: {
          deletedAt: null,
          id: questionId,
          status: BarFinalExamQuestionStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          question: true
        }
      }),
    notificationActions: ["admin.bar-final-exams.question.created", "admin.bar-final-exams.question.updated"],
    updatePendingItem: async (tx, item) => {
      await tx.barFinalExamQuestion.update({
        where: {
          id: item.id
        },
        data: {
          approvedAt: new Date(),
          approvedBy: approverUserId,
          reviewFeedback: null,
          status: BarFinalExamQuestionStatus.PUBLISHED
        }
      });
    }
  });
}

// Approves every pending content item across all content types (including MCQ) immediately via bulk updates.
// This avoids N per-record transactions and N+1 audit lookups, making the bulk action complete quickly.
// Notifications for the last content-admin submitter of each batch are still produced but batched to avoid extra queries.
export async function approveAllPendingContent(approverUserId: string) {
  const startedAt = new Date();

  // Bulk status updates first (immediate): a single updateMany per table moves all pending rows to PUBLISHED
  // and nulls out review feedback; this is what makes the action "instant".
  const counts = await runInTransaction(async (tx) => {
    const approvedAt = new Date();
    const [
      libraryMaterials,
      subjectSummaryCases,
      subjectSummaryEntries,
      barFinalExamQuestions,
      barFinalExamMcqQuestions
    ] = await Promise.all([
      tx.studyMaterial.updateMany({
        where: {
          deletedAt: null,
          publicationStatus: ContentPublicationStatus.PENDING_APPROVAL
        },
        data: {
          approvedAt,
          approvedBy: approverUserId,
          publicationStatus: ContentPublicationStatus.PUBLISHED,
          reviewFeedback: null
        }
      }),
      tx.subjectSummaryCase.updateMany({
        where: {
          deletedAt: null,
          status: SubjectSummaryCaseStatus.PENDING_APPROVAL
        },
        data: {
          archivedAt: null,
          reviewFeedback: null,
          status: SubjectSummaryCaseStatus.PUBLISHED
        }
      }),
      tx.subjectSummaryEntry.updateMany({
        where: {
          deletedAt: null,
          status: SubjectSummaryCaseStatus.PENDING_APPROVAL
        },
        data: {
          reviewFeedback: null,
          status: SubjectSummaryCaseStatus.PUBLISHED
        }
      }),
      tx.barFinalExamQuestion.updateMany({
        where: {
          deletedAt: null,
          status: BarFinalExamQuestionStatus.PENDING_APPROVAL
        },
        data: {
          approvedAt,
          approvedBy: approverUserId,
          reviewFeedback: null,
          status: BarFinalExamQuestionStatus.PUBLISHED
        }
      }),
      tx.barFinalExamMcqQuestion.updateMany({
        where: {
          deletedAt: null,
          status: BarFinalExamQuestionStatus.PENDING_APPROVAL
        },
        data: {
          approvedAt,
          approvedBy: approverUserId,
          reviewFeedback: null,
          status: BarFinalExamQuestionStatus.PUBLISHED
        }
      })
    ]);

    return {
      barFinalExamMcqQuestions: barFinalExamMcqQuestions.count,
      barFinalExamQuestions: barFinalExamQuestions.count,
      libraryMaterials: libraryMaterials.count,
      subjectSummaryCases: subjectSummaryCases.count,
      subjectSummaryEntries: subjectSummaryEntries.count
    };
  });

  const approvedCount =
    counts.barFinalExamMcqQuestions +
    counts.barFinalExamQuestions +
    counts.libraryMaterials +
    counts.subjectSummaryCases +
    counts.subjectSummaryEntries;

  // Create one summary notification per distinct content-admin submitter type instead of per-item
  // (avoids N+1 audit queries while still surfacing visibility to the content team).
  try {
    const notificationRecipients = await loadBulkApprovalNotificationRecipients();
    const distinctUserIds = Array.from(
      new Set(Object.values(notificationRecipients).filter((v): v is string => Boolean(v)))
    );

    if (distinctUserIds.length > 0 && approvedCount > 0) {
      const message = `${approvedCount} pending content items were approved in bulk by the super admin.`;
      await Promise.all(
        distinctUserIds.map((userId) => createNotification(userId, "Content bulk-approved", message))
      );
    }
  } catch (notifyError) {
    // Never let notification failures break the already-successful bulk approval.
    console.warn("Bulk approval notifications failed; statuses are already updated.", notifyError);
  }

  return {
    approvedCount,
    counts,
    finishedAt: new Date().toISOString(),
    skippedCount: 0,
    startedAt: startedAt.toISOString(),
    success: true as const
  };
}

// Loads one latest content-admin actor per resource type using a single aggregated audit-log query
// grouped by a discriminant (resource action prefix) instead of N per-item lookups.
async function loadBulkApprovalNotificationRecipients(): Promise<{
  barFinalExamMcqQuestions: string | null;
  barFinalExamQuestions: string | null;
  libraryMaterials: string | null;
  subjectSummaryCases: string | null;
  subjectSummaryEntries: string | null;
}> {
  const contentAdminUserWhere: Prisma.UserWhereInput = {
    deletedAt: null,
    roles: {
      some: {
        deletedAt: null,
        role: {
          code: "content_admin",
          deletedAt: null
        }
      }
    }
  };

  const typeBuckets: Array<{
    actions: string[];
    key:
      | "barFinalExamMcqQuestions"
      | "barFinalExamQuestions"
      | "libraryMaterials"
      | "subjectSummaryCases"
      | "subjectSummaryEntries";
  }> = [
    {
      key: "libraryMaterials",
      actions: ["admin.library.material.created", "admin.library.material.updated"]
    },
    {
      key: "subjectSummaryCases",
      actions: ["admin.subject-summary.case.created", "admin.subject-summary.case.updated"]
    },
    {
      key: "subjectSummaryEntries",
      actions: ["subject_summary_entry_created", "subject_summary_entry_updated"]
    },
    {
      key: "barFinalExamQuestions",
      actions: ["admin.bar-final-exams.question.created", "admin.bar-final-exams.question.updated"]
    },
    {
      key: "barFinalExamMcqQuestions",
      actions: [
        "admin.bar-final-exams.mcq-question.created",
        "admin.bar-final-exams.mcq-question.updated"
      ]
    }
  ];

  const results = await Promise.all(
    typeBuckets.map(async (bucket) => {
      const latest = await prisma.auditLog.findFirst({
        where: {
          action: { in: bucket.actions },
          deletedAt: null,
          user: contentAdminUserWhere
        },
        orderBy: { createdAt: "desc" },
        select: { userId: true }
      });

      return [bucket.key, latest?.userId ?? null] as const;
    })
  );

  return Object.fromEntries(results) as Awaited<
    ReturnType<typeof loadBulkApprovalNotificationRecipients>
  >;
}

// Approves a single pending MCQ question (NLS MCQ module) using the same transaction/notification pattern
// used for NLS theory questions. Uses the correct audit-log action strings for MCQ records.
export async function approveBarFinalExamMcqQuestion(questionId: string, approverUserId: string) {
  return runApprovalMutation<{ id: string; question: string }>({
    buildNotification: (item) => ({
      body: `Your bar final exam MCQ question "${item.question}" was approved by the super admin and is now published.`,
      title: "Bar final exam MCQ approved"
    }),
    createResult: (item) => ({
      id: item.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.barFinalExamMcqQuestion.findFirst({
        where: {
          deletedAt: null,
          id: questionId,
          status: BarFinalExamQuestionStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          question: true
        }
      }),
    notificationActions: [
      "admin.bar-final-exams.mcq-question.created",
      "admin.bar-final-exams.mcq-question.updated"
    ],
    updatePendingItem: async (tx, item) => {
      await tx.barFinalExamMcqQuestion.update({
        where: {
          id: item.id
        },
        data: {
          approvedAt: new Date(),
          approvedBy: approverUserId,
          reviewFeedback: null,
          status: BarFinalExamQuestionStatus.PUBLISHED
        }
      });
    }
  });
}

export async function declineBarFinalExamQuestion(questionId: string, approverUserId: string, reason: string) {
  return runApprovalMutation<{ id: string; question: string }>({
    buildNotification: (item) => ({
      body: `Your bar final exam question "${item.question}" was returned for revision by the super admin. Reason: ${reason}`,
      title: "Bar final exam declined"
    }),
    createResult: (item) => ({
      id: item.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.barFinalExamQuestion.findFirst({
        where: {
          deletedAt: null,
          id: questionId,
          status: BarFinalExamQuestionStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          question: true
        }
      }),
    notificationActions: ["admin.bar-final-exams.question.created", "admin.bar-final-exams.question.updated"],
    updatePendingItem: async (tx, item) => {
      await tx.barFinalExamQuestion.update({
        where: {
          id: item.id
        },
        data: {
          approvedAt: null,
          approvedBy: null,
          reviewFeedback: reason,
          status: BarFinalExamQuestionStatus.DRAFT
        }
      });
    }
  });
}

export async function declineBarFinalExamMcqQuestion(questionId: string, approverUserId: string, reason: string) {
  return runApprovalMutation<{ id: string; question: string }>({
    buildNotification: (item) => ({
      body: `Your bar final exam MCQ "${item.question}" was returned for revision by the super admin. Reason: ${reason}`,
      title: "Bar final exam MCQ declined"
    }),
    createResult: (item) => ({
      id: item.id,
      success: true as const
    }),
    loadPendingItem: (tx) =>
      tx.barFinalExamMcqQuestion.findFirst({
        where: {
          deletedAt: null,
          id: questionId,
          status: BarFinalExamQuestionStatus.PENDING_APPROVAL
        },
        select: {
          id: true,
          question: true
        }
      }),
    notificationActions: ["admin.bar-final-exams.mcq-question.created", "admin.bar-final-exams.mcq-question.updated"],
    updatePendingItem: async (tx, item) => {
      await tx.barFinalExamMcqQuestion.update({
        where: {
          id: item.id
        },
        data: {
          approvedAt: null,
          approvedBy: null,
          reviewFeedback: reason,
          status: BarFinalExamQuestionStatus.DRAFT
        }
      });
    }
  });
}
