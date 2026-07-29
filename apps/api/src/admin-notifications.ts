import type { Prisma } from "@prisma/client";
import { ContentPublicationStatus, SubjectSummaryCaseStatus } from "@prisma/client";

import { prisma } from "./lib/prisma.js";
import { runInTransaction } from "./lib/transactions.js";

export type AdminNotificationItemType = "library_material" | "subject_summary_case" | "subject_summary_entry" | "user_notification";

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
  const [pendingLibraryMaterials, pendingCases, pendingEntries] = await Promise.all([
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
      title: item.question,
      type: "subject_summary_entry"
    }))
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function getSuperAdminApprovalQueue(): Promise<AdminApprovalQueueSnapshot> {
  const [pendingLibraryMaterials, pendingCases, pendingEntries] = await Promise.all([
    prisma.studyMaterial.findMany({
      where: {
        deletedAt: null,
        publicationStatus: ContentPublicationStatus.PENDING_APPROVAL
      },
      orderBy: {
        updatedAt: "desc"
      },
      select: {
        category: {
          select: {
            name: true,
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

  const libraryItems = await Promise.all(
    pendingLibraryMaterials.map(async (item): Promise<AdminApprovalQueueItem> => {
      const actor = await findLatestContentAdminActorDetails(item.id, ["admin.library.material.created", "admin.library.material.updated"]);

      return {
        actionPath: `/app/admin/library/${item.category?.slug ?? "law-reports"}`,
        contentTypeLabel: item.category?.name ?? "Library material",
        createdAt: (actor.createdAt ?? item.updatedAt).toISOString(),
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
    })
  );

  const caseItems = await Promise.all(
    pendingCases.map(async (item): Promise<AdminApprovalQueueItem> => {
      const actor = await findLatestContentAdminActorDetails(item.id, ["admin.subject-summary.case.created", "admin.subject-summary.case.updated"]);

      return {
        actionPath: "/app/admin/library/subject-summaries/cases",
        contentTypeLabel: "Subject Summary Case",
        createdAt: (actor.createdAt ?? item.updatedAt).toISOString(),
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
    })
  );

  const entryItems = await Promise.all(
    pendingEntries.map(async (item): Promise<AdminApprovalQueueItem> => {
      const actor = await findLatestContentAdminActorDetails(item.id, ["subject_summary_entry_created", "subject_summary_entry_updated"]);

      return {
        actionPath: "/app/admin/library/cases-and-ratios",
        contentTypeLabel: "Subject Summary",
        createdAt: (actor.createdAt ?? item.updatedAt).toISOString(),
        editPath: `/app/admin/library/cases-and-ratios?editEntry=${item.id}`,
        id: `subject-summary-entry-${item.id}`,
        reviewPath: `/app/admin/library/cases-and-ratios?editEntry=${item.id}`,
        resourceId: item.id,
        submittedBy: actor.fullName,
        submittedRoleLabel: "Content Admin",
        subtitle: `${item.subject.name} revision guide`,
        title: item.question,
        type: "subject_summary_entry"
      };
    })
  );

  const items = [...libraryItems, ...caseItems, ...entryItems].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return {
    items,
    summary: {
      itemsSubmittedToday: items.filter((item) => new Date(item.createdAt).getTime() >= startOfToday.getTime()).length,
      libraryMaterials: libraryItems.length,
      oldestPendingHours: items.length
        ? Math.max(1, Math.round((now - Math.min(...items.map((item) => new Date(item.createdAt).getTime()))) / (1000 * 60 * 60)))
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
