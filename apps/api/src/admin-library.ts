import { randomUUID } from "node:crypto";
import { ContentPublicationStatus, MaterialType, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";
import { createPreviewHtml, getPremiumContentAccess, PREMIUM_PREVIEW_WORD_LIMIT } from "./premium-access.js";
import { runInTransaction } from "./lib/transactions.js";

const adminLibrarySectionSchema = z.enum(["law-reports", "subject-summaries", "cases-and-ratios"]);

const adminLibraryFiltersSchema = z.object({
  materialType: z.union([z.nativeEnum(MaterialType), z.literal("all")]).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  search: z.string().trim().max(120).optional().default(""),
  sortBy: z.enum(["createdAt", "estimatedMins", "title", "updatedAt"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

const adminLibrarySearchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(12),
  query: z.string().trim().min(2).max(120)
});

const adminLibraryMaterialInputSchema = z
  .object({
    body: z.string().optional().default(""),
    downloadable: z.boolean(),
    estimatedMins: z.coerce.number().int().min(0).max(20_000).optional().default(0),
    materialType: z.nativeEnum(MaterialType),
    reportDate: z.string().trim().optional().default(""),
    reportNumber: z.string().trim().optional().default(""),
    sharingEnabled: z.boolean().optional().default(false),
    storageUrl: z.string().trim().min(2).max(2_000),
    summary: z.string().optional().default(""),
    title: z.string().trim().min(2)
  })
  .strict();

export type AdminLibrarySection = z.infer<typeof adminLibrarySectionSchema>;
export type AdminLibraryFilters = z.infer<typeof adminLibraryFiltersSchema>;
export type AdminLibraryMaterialInput = z.infer<typeof adminLibraryMaterialInputSchema>;
export type AdminLibrarySearchQuery = z.infer<typeof adminLibrarySearchSchema>;
export type AdminLibrarySearchScope = "body" | "reportNumber" | "storageUrl" | "summary" | "title";
type LibrarySearchAudience = "admin" | "student";

const standardMaterialTypes = [
  MaterialType.PDF,
  MaterialType.DOCX,
  MaterialType.EPUB,
  MaterialType.PPT,
  MaterialType.VIDEO,
  MaterialType.AUDIO,
  MaterialType.IMAGE
] as const;

const lawReportCourtTypes = [
  MaterialType.COURT_OF_APPEAL,
  MaterialType.FEDERAL_HIGH_COURT,
  MaterialType.HIGH_COURT,
  MaterialType.SUPREME_COURT,
  MaterialType.TRIBUNAL
] as const;

const adminLibrarySectionConfig: Record<
  AdminLibrarySection,
  {
    description: string;
    name: string;
    slug: string;
  }
> = {
  "cases-and-ratios": {
    description: "Manage curated case records, leading authorities, and ratio notes for serious legal study.",
    name: "Cases And Ratios",
    slug: "cases-and-ratios"
  },
  "law-reports": {
    description: "Manage report archives, citations, and downloadable legal report resources.",
    name: "Law Reports",
    slug: "law-reports"
  },
  "subject-summaries": {
    description: "Manage concise subject revision notes, outlines, and exam-focused learning summaries.",
    name: "Subject Summaries",
    slug: "subject-summaries"
  }
};

function getSectionConfig(section: AdminLibrarySection) {
  return adminLibrarySectionConfig[section];
}

function getSectionFromCategorySlug(slug: string): AdminLibrarySection | null {
  const matchingEntry = (Object.entries(adminLibrarySectionConfig) as Array<[AdminLibrarySection, { slug: string }]>).find(
    ([, config]) => config.slug === slug
  );

  return matchingEntry?.[0] ?? null;
}

function isLawReportsSection(section: AdminLibrarySection) {
  return section === "law-reports";
}

function getAllowedMaterialTypes(section: AdminLibrarySection) {
  return isLawReportsSection(section) ? [...lawReportCourtTypes] : [...standardMaterialTypes];
}

function isLawReportMaterialType(materialType: MaterialType) {
  return (lawReportCourtTypes as readonly MaterialType[]).includes(materialType);
}

function normalizeRichText(value: string | undefined) {
  return (value ?? "").trim();
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateEstimatedMinutesFromBody(body: string) {
  const plainText = stripHtml(body);

  if (!plainText) {
    return 0;
  }

  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

function estimateMinutesFromReadingProgress(estimatedMins: number, progressPct: number) {
  if (estimatedMins <= 0) {
    return 0;
  }

  const boundedProgress = Math.max(0, Math.min(progressPct, 100));

  if (boundedProgress === 0) {
    return 1;
  }

  return Math.max(1, Math.round((estimatedMins * boundedProgress) / 100));
}

function toRoundedHoursFromSeconds(value: number) {
  return Number((value / 3600).toFixed(1));
}

function assertSectionMaterialType(section: AdminLibrarySection, materialType: MaterialType) {
  if ((getAllowedMaterialTypes(section) as MaterialType[]).includes(materialType)) {
    return;
  }

  throw new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      message: isLawReportsSection(section)
        ? "Law reports must use one of the supported court values."
        : "This library section does not support the selected material type.",
      path: ["materialType"]
    }
  ]);
}

async function ensureAdminLibraryCategories() {
  return Promise.all(
    Object.values(adminLibrarySectionConfig).map((section) =>
      prisma.category.upsert({
        where: {
          slug: section.slug
        },
        update: {
          description: section.description,
          name: section.name
        },
        create: {
          description: section.description,
          name: section.name,
          slug: section.slug
        }
      })
    )
  );
}

async function getSectionCategory(section: AdminLibrarySection) {
  const categories = await ensureAdminLibraryCategories();
  return categories.find((category) => category.slug === getSectionConfig(section).slug) ?? null;
}

function createLibraryMaterialWhere(
  categoryId: string,
  filters: AdminLibraryFilters,
  audience: LibrarySearchAudience = "admin"
): Prisma.StudyMaterialWhereInput {
  return {
    categoryId,
    deletedAt: null,
    ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {}),
    ...(filters.materialType === "all" ? {} : { materialType: filters.materialType }),
    ...(filters.search
      ? {
          OR: [
            {
              title: containsText(filters.search)
            },
            {
              storageUrl: containsText(filters.search)
            },
            {
              reportNumber: containsText(filters.search)
            }
          ]
        }
      : {})
  };
}

function mapLibraryMaterial(material: {
  _count: {
    bookmarks: number;
    readingHistory: number;
  };
  body: string | null;
  createdAt: Date;
  downloadable: boolean;
  estimatedMins: number;
  id: string;
  materialType: MaterialType;
  publicationStatus: ContentPublicationStatus;
  approvedAt: Date | null;
  reviewFeedback: string | null;
  reportNumber: string | null;
  reportDate: Date | null;
  sharingEnabled: boolean | null;
  storageUrl: string;
  summary: string | null;
  title: string;
  updatedAt: Date;
}) {
  return {
    bookmarkCount: material._count.bookmarks,
    body: material.body ?? "",
    createdAt: material.createdAt.toISOString(),
    downloadable: material.downloadable,
    estimatedMins: material.estimatedMins,
    id: material.id,
    lastUpdatedAt: material.updatedAt.toISOString(),
    materialType: material.materialType,
    publicationStatus: material.publicationStatus,
    approvedAt: material.approvedAt?.toISOString() ?? null,
    reviewFeedback: material.reviewFeedback ?? "",
    readerCount: material._count.readingHistory,
    reportDate: material.reportDate?.toISOString() ?? null,
    reportNumber: isLawReportMaterialType(material.materialType) ? material.reportNumber : null,
    sharingEnabled: material.sharingEnabled ?? false,
    storageUrl: material.storageUrl,
    summary: material.summary ?? "",
    title: material.title
  };
}

function buildRestrictedLibraryMaterial(material: ReturnType<typeof mapLibraryMaterial>) {
  const combinedPreviewSource = [material.summary, material.body].filter(Boolean).join(" ");

  return {
    ...material,
    body: "",
    downloadable: false,
    summary: createPreviewHtml(combinedPreviewSource, PREMIUM_PREVIEW_WORD_LIMIT)
  };
}

function resolvePublicationStatus(actorRoleCodes: string[], currentStatus?: ContentPublicationStatus) {
  if (actorRoleCodes.includes("content_admin")) {
    return ContentPublicationStatus.PENDING_APPROVAL;
  }

  if (currentStatus === ContentPublicationStatus.ARCHIVED || currentStatus === ContentPublicationStatus.DRAFT) {
    return currentStatus;
  }

  return ContentPublicationStatus.PUBLISHED;
}

function buildSearchSnippet(material: {
  body: string | null;
  reportNumber: string | null;
  storageUrl: string;
  summary: string | null;
  title: string;
}, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const queryText = query.trim().toLowerCase();
  const sources = [
    { scope: "title", text: material.title },
    { scope: "reportNumber", text: material.reportNumber ?? "" },
    { scope: "storageUrl", text: material.storageUrl },
    { scope: "summary", text: stripHtml(material.summary ?? "") },
    { scope: "body", text: stripHtml(material.body ?? "") }
  ] satisfies Array<{ scope: AdminLibrarySearchScope; text: string }>;

  for (const source of sources) {
    const haystack = source.text.toLowerCase();
    const foundAt = haystack.indexOf(queryText);

    if (foundAt === -1) {
      continue;
    }

    const start = Math.max(0, foundAt - 70);
    const end = Math.min(source.text.length, foundAt + queryText.length + 110);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < source.text.length ? "..." : "";

    return {
      matchedIn: source.scope,
      snippet: `${prefix}${source.text.slice(start, end).trim()}${suffix}`
    };
  }

  return {
    matchedIn: normalizedQuery ? "summary" : "title",
    snippet: stripHtml(material.summary ?? "") || stripHtml(material.body ?? "") || material.storageUrl
  };
}

function parseReportDate(value: string, section: AdminLibrarySection) {
  if (!isLawReportsSection(section)) {
    return null;
  }

  if (!value.trim()) {
    return null;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Law report date must be a valid calendar date.",
        path: ["reportDate"]
      }
    ]);
  }

  return parsedDate;
}

async function createLibraryAuditLog(
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

async function buildNextLawReportNumber(
  db: Prisma.TransactionClient | typeof prisma,
  categoryId: string
) {
  const currentYear = new Date().getFullYear();
  const prefix = `Helar-${currentYear}-`;

  const reports = await db.studyMaterial.findMany({
    where: {
      categoryId,
      deletedAt: null,
      reportNumber: {
        startsWith: prefix
      }
    },
    select: {
      reportNumber: true
    }
  });

  const highestSequence = reports.reduce((currentHighest, material) => {
    const rawValue = material.reportNumber?.slice(prefix.length) ?? "";
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue)) {
      return currentHighest;
    }

    return Math.max(currentHighest, parsedValue);
  }, 500);

  return `${prefix}${highestSequence + 1}`;
}

async function runSerializableWrite<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isRetriable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034");

      if (!isRetriable || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("SERIALIZABLE_WRITE_FAILED");
}

async function runLibraryWriteTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return runInTransaction(operation);
}

export function parseAdminLibrarySection(value: string) {
  return adminLibrarySectionSchema.parse(value);
}

export function parseAdminLibraryFilters(query: Record<string, string | string[] | undefined>) {
  return adminLibraryFiltersSchema.parse({
    materialType: Array.isArray(query.materialType) ? query.materialType[0] : query.materialType,
    page: Array.isArray(query.page) ? query.page[0] : query.page,
    pageSize: Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize,
    search: Array.isArray(query.search) ? query.search[0] : query.search,
    sortBy: Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy,
    sortOrder: Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder
  });
}

export function parseAdminLibrarySearchQuery(query: Record<string, string | string[] | undefined>) {
  return adminLibrarySearchSchema.parse({
    limit: Array.isArray(query.limit) ? query.limit[0] : query.limit,
    query: Array.isArray(query.query) ? query.query[0] : query.query
  });
}

export function parseAdminLibraryMaterialInput(body: unknown) {
  return adminLibraryMaterialInputSchema.parse(body);
}

export async function listAdminLibraryMaterials(
  section: AdminLibrarySection,
  filters: AdminLibraryFilters,
  audience: LibrarySearchAudience = "admin"
) {
  const category = await getSectionCategory(section);

  if (!category) {
    throw new Error("LIBRARY_CATEGORY_NOT_FOUND");
  }

  const where = createLibraryMaterialWhere(category.id, filters, audience);
  const [totalItems, materials, totalInSection, downloadableCount, recentUploadsCount, nextReportNumber, engagementMaterials] = await Promise.all([
    prisma.studyMaterial.count({ where }),
    prisma.studyMaterial.findMany({
      where,
      orderBy: {
        [filters.sortBy]: filters.sortOrder
      },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        _count: {
          select: {
            bookmarks: true,
            readingHistory: true
          }
        }
      }
    }),
    prisma.studyMaterial.count({
      where: {
        categoryId: category.id,
        deletedAt: null,
        ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {})
      }
    }),
    prisma.studyMaterial.count({
      where: {
        categoryId: category.id,
        deletedAt: null,
        ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {}),
        downloadable: true
      }
    }),
    prisma.studyMaterial.count({
      where: {
        categoryId: category.id,
        createdAt: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
        },
        deletedAt: null,
        ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {})
      }
    }),
    isLawReportsSection(section) ? buildNextLawReportNumber(prisma, category.id) : Promise.resolve(null),
    isLawReportsSection(section)
      ? prisma.studyMaterial.findMany({
          where: {
            categoryId: category.id,
            deletedAt: null,
            ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {})
          },
          select: {
            estimatedMins: true,
            id: true,
            reportNumber: true,
            title: true,
            readingHistory: {
              where: {
                deletedAt: null
              },
              select: {
                progressPct: true,
                timeSpentSeconds: true
              }
            }
          }
        })
      : Promise.resolve([])
  ]);

  const averageReadTimeAggregate = await prisma.studyMaterial.aggregate({
    where: {
      categoryId: category.id,
      deletedAt: null,
      ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {})
    },
    _avg: {
      estimatedMins: true
    }
  });

  const lawReportEngagement = isLawReportsSection(section)
    ? (() => {
        const reportMetrics = engagementMaterials.map((material) => {
          const visits = material.readingHistory.length;
          const totalTimeSpentSeconds = material.readingHistory.reduce((sum, history) => {
            if (history.timeSpentSeconds > 0) {
              return sum + history.timeSpentSeconds;
            }

            return sum + estimateMinutesFromReadingProgress(material.estimatedMins, history.progressPct) * 60;
          }, 0);

          return {
            id: material.id,
            reportNumber: material.reportNumber,
            title: material.title,
            totalHoursSpent: toRoundedHoursFromSeconds(totalTimeSpentSeconds),
            visits
          };
        });

        const totalVisits = reportMetrics.reduce((sum, report) => sum + report.visits, 0);
        const totalHoursSpent = Number((reportMetrics.reduce((sum, report) => sum + report.totalHoursSpent, 0)).toFixed(1));

        return {
          topReports: reportMetrics.sort((left, right) => right.visits - left.visits || right.totalHoursSpent - left.totalHoursSpent).slice(0, 5),
          totalHoursSpent,
          totalVisits
        };
      })()
    : null;

  return {
    availableMaterialTypes: getAllowedMaterialTypes(section),
    category: {
      description: category.description,
      id: category.id,
      name: category.name,
      slug: category.slug
    },
    filters: {
      ...filters
    },
    materials: materials.map((material) => mapLibraryMaterial(material)),
    nextReportNumber,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize))
    },
    summary: {
      averageReadTimeMins: Math.round(averageReadTimeAggregate._avg.estimatedMins ?? 0),
      downloadableCount,
      lawReportEngagement,
      recentUploadsCount,
      totalMaterials: totalInSection
    }
  };
}

export async function getAdminLibraryMaterial(section: AdminLibrarySection, materialId: string) {
  const category = await getSectionCategory(section);

  if (!category) {
    throw new Error("LIBRARY_CATEGORY_NOT_FOUND");
  }

  const material = await prisma.studyMaterial.findFirst({
    where: {
      categoryId: category.id,
      deletedAt: null,
      id: materialId
    },
    include: {
      _count: {
        select: {
          bookmarks: true,
          readingHistory: true
        }
      }
    }
  });

  if (!material) {
    return null;
  }

  return {
    category: {
      description: category.description,
      id: category.id,
      name: category.name,
      slug: category.slug
    },
    material: mapLibraryMaterial(material)
  };
}

export async function getLibraryMaterial(section: AdminLibrarySection, materialId: string, userId?: string) {
  const category = await getSectionCategory(section);

  if (!category) {
    throw new Error("LIBRARY_CATEGORY_NOT_FOUND");
  }

  const material = await prisma.studyMaterial.findFirst({
    where: {
      categoryId: category.id,
      deletedAt: null,
      id: materialId,
      publicationStatus: ContentPublicationStatus.PUBLISHED
    },
    include: {
      _count: {
        select: {
          bookmarks: true,
          readingHistory: true
        }
      }
    }
  });

  if (!material) {
    return null;
  }

  const mappedMaterial = mapLibraryMaterial(material);
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
    access: {
      ...contentAccess,
      activeSubscriptionEndsAt: contentAccess.activeSubscriptionEndsAt?.toISOString() ?? null
    },
    category: {
      description: category.description,
      id: category.id,
      name: category.name,
      slug: category.slug
    },
    material: contentAccess.hasFullAccess ? mappedMaterial : buildRestrictedLibraryMaterial(mappedMaterial)
  };
}

export async function createLawReportReadingSession(materialId: string, userId: string) {
  const category = await getSectionCategory("law-reports");

  if (!category) {
    throw new Error("LIBRARY_CATEGORY_NOT_FOUND");
  }

  const material = await prisma.studyMaterial.findFirst({
    where: {
      categoryId: category.id,
      deletedAt: null,
      id: materialId
      ,
      publicationStatus: ContentPublicationStatus.PUBLISHED
    },
    select: {
      id: true
    }
  });

  if (!material) {
    throw new Error("LIBRARY_MATERIAL_NOT_FOUND");
  }

  return prisma.readingHistory.create({
    data: {
      lastOpenedAt: new Date(),
      materialId: material.id,
      progressPct: 0,
      timeSpentSeconds: 0,
      userId
    },
    select: {
      id: true
    }
  });
}

export async function updateLawReportReadingSession(
  sessionId: string,
  userId: string,
  input: {
    progressPct?: number;
    timeSpentSeconds?: number;
  }
) {
  const session = await prisma.readingHistory.findFirst({
    where: {
      deletedAt: null,
      id: sessionId,
      userId
    },
    select: {
      id: true,
      progressPct: true,
      timeSpentSeconds: true
    }
  });

  if (!session) {
    return null;
  }

  const nextProgressPct =
    typeof input.progressPct === "number" ? Math.max(session.progressPct, Math.min(Math.max(input.progressPct, 0), 100)) : session.progressPct;
  const nextTimeSpentSeconds =
    typeof input.timeSpentSeconds === "number" ? Math.max(session.timeSpentSeconds, Math.max(0, Math.round(input.timeSpentSeconds))) : session.timeSpentSeconds;

  return prisma.readingHistory.update({
    where: {
      id: session.id
    },
    data: {
      lastOpenedAt: new Date(),
      progressPct: nextProgressPct,
      timeSpentSeconds: nextTimeSpentSeconds
    },
    select: {
      id: true
    }
  });
}

async function searchLibraryMaterials({ limit, query }: AdminLibrarySearchQuery, audience: LibrarySearchAudience) {
  const categories = await ensureAdminLibraryCategories();
  const categoryIds = categories.map((category) => category.id);
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const materials = await prisma.studyMaterial.findMany({
    where: {
      categoryId: {
        in: categoryIds
      },
      deletedAt: null,
      ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {}),
      OR: [
        {
          title: containsText(query)
        },
        {
          reportNumber: containsText(query)
        },
        {
          storageUrl: containsText(query)
        },
        {
          summary: containsText(query)
        },
        {
          body: containsText(query)
        }
      ]
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: limit
  });

  return materials.flatMap((material) => {
    const category = material.categoryId ? categoryById.get(material.categoryId) : null;
    const section = category ? getSectionFromCategorySlug(category.slug) : null;

    if (!category || !section) {
      return [];
    }

    const searchPreview = buildSearchSnippet(material, query);

    return [
      {
        id: material.id,
        materialType: material.materialType,
        matchedIn: searchPreview.matchedIn,
        path:
          section === "law-reports"
            ? audience === "admin"
              ? `/app/admin/library/law-reports/${material.id}`
              : `/app/library/law-reports/${material.id}`
            : audience === "admin"
              ? `/app/admin/library/${section}`
              : `/app/library/${section}`,
        reportNumber: isLawReportMaterialType(material.materialType) ? material.reportNumber : null,
        section,
        sectionLabel: category.name,
        snippet: searchPreview.snippet,
        title: material.title
      }
    ];
  });
}

export async function searchAdminLibraryMaterials(query: AdminLibrarySearchQuery) {
  return searchLibraryMaterials(query, "admin");
}

export async function searchLibraryMaterialsForStudents(query: AdminLibrarySearchQuery) {
  return searchLibraryMaterials(query, "student");
}

export async function createAdminLibraryMaterial(
  section: AdminLibrarySection,
  input: AdminLibraryMaterialInput,
  actorUserId: string,
  actorRoleCodes: string[] = []
) {
  const category = await getSectionCategory(section);

  if (!category) {
    throw new Error("LIBRARY_CATEGORY_NOT_FOUND");
  }

  assertSectionMaterialType(section, input.materialType);

  const summary = normalizeRichText(input.summary);
  const body = normalizeRichText(input.body);
  const estimatedMins = isLawReportsSection(section) ? calculateEstimatedMinutesFromBody(body) : input.estimatedMins;
  const reportDate = parseReportDate(input.reportDate, section);
  const internalReportNumber = isLawReportsSection(section) ? null : `internal-${randomUUID()}`;

  const publicationStatus = resolvePublicationStatus(actorRoleCodes);
  const material = await runSerializableWrite(() =>
    runLibraryWriteTransaction(async (tx) => {
        const reportNumber = isLawReportsSection(section)
          ? await buildNextLawReportNumber(tx, category.id)
          : internalReportNumber;

        return tx.studyMaterial.create({
          data: {
            body: body || null,
            categoryId: category.id,
            deletedAt: null,
            downloadable: input.downloadable,
            estimatedMins,
            materialType: input.materialType,
            publicationStatus,
            reviewFeedback: null,
            reportDate,
            sharingEnabled: Boolean(input.sharingEnabled),
            createdBy: actorUserId,
            approvedAt: publicationStatus === ContentPublicationStatus.PUBLISHED ? new Date() : null,
            approvedBy: publicationStatus === ContentPublicationStatus.PUBLISHED ? actorUserId : null,
            storageUrl: input.storageUrl.trim(),
            summary: summary || null,
            title: input.title.trim(),
            ...(reportNumber ? { reportNumber } : {})
          },
          include: {
            _count: {
              select: {
                bookmarks: true,
                readingHistory: true
              }
            }
          }
        });
      })
  );

  await createLibraryAuditLog(actorUserId, "admin.library.material.created", material.id, {
    categorySlug: category.slug,
    reportDate: material.reportDate?.toISOString() ?? null,
    materialType: material.materialType,
    reportNumber: material.reportNumber,
    title: material.title
  });

  return mapLibraryMaterial(material);
}

export async function updateAdminLibraryMaterial(
  section: AdminLibrarySection,
  materialId: string,
  input: AdminLibraryMaterialInput,
  actorUserId: string,
  actorRoleCodes: string[] = []
) {
  const category = await getSectionCategory(section);

  if (!category) {
    throw new Error("LIBRARY_CATEGORY_NOT_FOUND");
  }

  assertSectionMaterialType(section, input.materialType);

  const existingMaterial = await prisma.studyMaterial.findFirst({
    where: {
      categoryId: category.id,
      deletedAt: null,
      id: materialId
    }
  });

  if (!existingMaterial) {
    return null;
  }

  const summary = normalizeRichText(input.summary);
  const body = normalizeRichText(input.body);
  const estimatedMins = isLawReportsSection(section) ? calculateEstimatedMinutesFromBody(body) : input.estimatedMins;
  const reportDate = parseReportDate(input.reportDate, section);

  const publicationStatus = resolvePublicationStatus(actorRoleCodes, existingMaterial.publicationStatus);
  const material = await runSerializableWrite(() =>
    runLibraryWriteTransaction(async (tx) => {
        const reportNumber =
          isLawReportsSection(section) && !existingMaterial.reportNumber
            ? await buildNextLawReportNumber(tx, category.id)
            : existingMaterial.reportNumber ?? `internal-${materialId}`;

        return tx.studyMaterial.update({
          where: {
            id: materialId
          },
          data: {
            body: body || null,
            downloadable: input.downloadable,
            estimatedMins,
            materialType: input.materialType,
            publicationStatus,
            reviewFeedback: null,
            reportDate,
            sharingEnabled: Boolean(input.sharingEnabled),
            approvedAt: publicationStatus === ContentPublicationStatus.PUBLISHED ? new Date() : null,
            approvedBy: publicationStatus === ContentPublicationStatus.PUBLISHED ? actorUserId : null,
            storageUrl: input.storageUrl.trim(),
            summary: summary || null,
            title: input.title.trim(),
            ...(reportNumber ? { reportNumber } : {})
          },
          include: {
            _count: {
              select: {
                bookmarks: true,
                readingHistory: true
              }
            }
          }
        });
      })
  );

  await createLibraryAuditLog(actorUserId, "admin.library.material.updated", material.id, {
    categorySlug: category.slug,
    reportDate: material.reportDate?.toISOString() ?? null,
    materialType: material.materialType,
    reportNumber: material.reportNumber,
    title: material.title
  });

  return mapLibraryMaterial(material);
}

export async function deleteAdminLibraryMaterial(
  section: AdminLibrarySection,
  materialId: string,
  actorUserId: string
) {
  const category = await getSectionCategory(section);

  if (!category) {
    throw new Error("LIBRARY_CATEGORY_NOT_FOUND");
  }

  const existingMaterial = await prisma.studyMaterial.findFirst({
    where: {
      categoryId: category.id,
      deletedAt: null,
      id: materialId
    }
  });

  if (!existingMaterial) {
    return null;
  }

  await prisma.studyMaterial.update({
    where: {
      id: materialId
    },
    data: {
      deletedAt: new Date()
    }
  });

  await createLibraryAuditLog(actorUserId, "admin.library.material.deleted", materialId, {
    categorySlug: category.slug,
    reportNumber: existingMaterial.reportNumber,
    title: existingMaterial.title
  });

  return {
    id: materialId,
    success: true
  };
}
