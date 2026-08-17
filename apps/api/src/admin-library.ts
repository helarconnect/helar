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
  // Raised to 500 for consistency with other admin list endpoints.
  pageSize: z.coerce.number().int().min(1).max(500).default(12),
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
    // When `bodyChunkToken` is set the create/update implementation reads the
    // assembled final body text from AdminLibraryChunkBuffer (see
    // resolveLibraryContentFromTransport below). Either the inline `body` or
    // the token can be set — not both for the same field. This allows the
    // frontend to split > 500 KB Word HTML pastes into N transport chunks
    // and submit a tiny final JSON, which eliminates the express.json()
    // heap spike that caused the Render empty-bodied 500.
    bodyChunkToken: z.string().trim().max(120).optional(),
    downloadable: z.boolean(),
    estimatedMins: z.coerce.number().int().min(0).max(20_000).optional().default(0),
    materialType: z.nativeEnum(MaterialType),
    reportDate: z.string().trim().optional().default(""),
    reportNumber: z.string().trim().optional().default(""),
    sharingEnabled: z.boolean().optional().default(false),
    // Raised from 2_000 to 1_000_000 to accommodate both plain URLs and very large
    // data-URL/base64 attachments if an admin pastes document content inline.
    storageUrl: z.string().trim().min(2).max(1_000_000),
    summary: z.string().optional().default(""),
    summaryChunkToken: z.string().trim().max(120).optional(),
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

// BODY CHUNKING — MongoDB has a hard 16MB BSON size cap per document, and very
// large law reports (full judgments with embedded images / tables / inline scans)
// can exceed that cap when stored as a single `body` / `summary` string.
//
// We keep a *very* conservative 1M-character safe head on the parent document
// (≈2 MB UTF-16, ≈1–4 MB UTF-8 depending on content) and spill everything after
// that into one or more StudyMaterialBodyChunk rows, ordered by
// (materialId, field, index). Chunks themselves are also capped at 1M chars so
// they too stay comfortably under the 16MB BSON ceiling. A 26-page MS-Word
// HTML export is typically 5–20 MB on the wire and will therefore split into
// 5–20 chunks on a typical import. The reader path reassembles everything
// transparently so the rest of the stack stays unchanged.
const CHUNK_FIELD_BODY = 0;
const CHUNK_FIELD_SUMMARY = 1;
const PER_DOC_SAFE_HEAD_CHARS = 1 * 1024 * 1024; // 1M chars ~ 2MB UTF-16
const PER_CHUNK_MAX_CHARS = 1 * 1024 * 1024;    // 1M chars per overflow chunk doc

// Transport-layer chunking. Split huge Word HTML pastes at this threshold on
// the frontend, and upload each slice as a separate plain-text append to
// AdminLibraryChunkBuffer. This ensures express.json() never parses a JSON
// string large enough to OOM a 512 MB Render worker (which was the cause of
// the empty-bodied 500 that surfaced the generic toast).
//
// NOTE: 2 MB per transport chunk. A 100 MB Word-HTML paste therefore spreads
// across ~50 HTTP calls. 2 MB is well below the 32 MB JSON content-length
// guard and well below the express.text() 4 MB per-chunk cap on the route.
// This keeps the per-request heap spike tiny while cutting total HTTP call
// count by 4× vs the previous 500 KB slice.
export const TRANSPORT_CHUNK_MAX_CHARS = 2 * 1024 * 1024;
const MAX_TRANSPORT_CHUNKS_PER_FIELD = 1000;         // 500 MB total soft cap per field

function bufferUtf16Length(value: string | null) {
  // UTF-16 (V8's internal representation) uses 2 bytes per BMP code point, 4 bytes
  // per surrogate pair. For payload-sizing decisions this is a reasonable proxy of
  // in-memory cost, so we use it to decide when to start chunking.
  if (!value) return 0;
  let length = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    length += code >= 0xd800 && code <= 0xdbff ? 4 : 2;
  }
  return length;
}

function splitSafeHeadAndOverflow(value: string, safeChars: number): { head: string; overflow: string } {
  if (value.length <= safeChars) {
    return { head: value, overflow: "" };
  }
  return { head: value.slice(0, safeChars), overflow: value.slice(safeChars) };
}

function chunkifyOverflow(overflow: string, chunkChars: number): string[] {
  if (!overflow) return [];
  const chunks: string[] = [];
  for (let offset = 0; offset < overflow.length; offset += chunkChars) {
    chunks.push(overflow.slice(offset, offset + chunkChars));
  }
  return chunks;
}

// Persist chunks for one field. Intentionally non-fatal if chunk write fails — we
// still return the saved material; the caller can decide whether it's acceptable
// to lose the tail. This mirrors the tryCreateLibraryAuditLog soft-failure pattern.
//
// NOTE on tx typing: we deliberately accept `unknown` instead of naming the exact
// Prisma `TransactionClient`. The reason is Prisma v6 for MongoDB exports an
// overloaded `deleteMany({ where?, limit? })` signature whose exact return type
// (PrismaPromise with SelectSubset) can't be matched against a literal hand-written
// structural type at Render's strict TS settings. We perform the structural cast
// inside the try block where every call is already protected against runtime
// shape mismatches.
//
// NOTE on create vs createMany: on MongoDB Prisma v6 `createMany` support depends
// on both the driver and the backing Atlas topology. Small saves (no overflow
// chunks) succeed because they never hit the `createMany` path, but any large
// save that overflows the single-document safe head fails with "batch writes
// aren't supported" or similar driver-level errors. We therefore insert each
// chunk with an individual `create()` call. It's marginally slower but 100%
// portable regardless of MongoDB topology.
async function tryWriteMaterialBodyChunks(
  tx: unknown,
  materialId: string,
  field: number,
  chunks: string[]
): Promise<void> {
  try {
    const db = tx as {
      studyMaterialBodyChunk: {
        deleteMany: (args: { where: { materialId: string; field: number } }) => Promise<unknown>;
        create: (args: {
          data: { content: string; field: number; index: number; materialId: string };
        }) => Promise<unknown>;
      };
    };
    await db.studyMaterialBodyChunk.deleteMany({ where: { materialId, field } });
    if (chunks.length === 0) return;
    for (let index = 0; index < chunks.length; index += 1) {
      await db.studyMaterialBodyChunk.create({
        data: { content: chunks[index], field, index, materialId }
      });
    }
  } catch (error) {
    console.error("[admin-library] tryWriteMaterialBodyChunks failed (tail may be lost)", {
      materialId,
      field,
      chunks: chunks.length,
      firstChars: chunks[0]?.length ?? 0,
      name: error instanceof Error ? error.name : String(error),
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function reassembleMaterialText(
  db: unknown,
  materialId: string,
  baseBody: string | null,
  baseSummary: string | null
): Promise<{ body: string; summary: string }> {
  const store = db as {
    studyMaterialBodyChunk: {
      findMany: (args: {
        where: { materialId: string };
        orderBy: { index: "asc" };
        select: { content: true; field: true; index: true };
      }) => Promise<Array<{ content: string; field: number; index: number }>>;
    };
  };
  const rows = await store.studyMaterialBodyChunk.findMany({
    where: { materialId },
    orderBy: { index: "asc" },
    select: { content: true, field: true, index: true }
  });
  const tailByField = new Map<number, string[]>();
  for (const row of rows) {
    const list = tailByField.get(row.field) ?? [];
    list[row.index] = row.content;
    tailByField.set(row.field, list);
  }
  const join = (field: number) => (tailByField.get(field) ?? []).filter(Boolean).join("");
  return {
    body: (baseBody ?? "") + join(CHUNK_FIELD_BODY),
    summary: (baseSummary ?? "") + join(CHUNK_FIELD_SUMMARY)
  };
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

  // Scan ALL material records in the category regardless of deletedAt.
  // The `reportNumber` field has a database-level UNIQUE constraint that
  // applies across soft-deleted rows too, so reusing a deleted report's
  // number would throw P2002 and block saves.
  const reports = await db.studyMaterial.findMany({
    where: {
      categoryId,
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
  }, 0);

  // Guarantee uniqueness by probing the DB for the next N candidates.
  // Covers race conditions even when the calling transaction reads an older
  // snapshot under MongoDB's multi-document transaction isolation.
  //
  // Raised from 50 → 200 candidates: if two admins save at nearly the same
  // moment and both see the same highestSequence, the probe loop must have
  // enough "next" candidates to find an unused slot even after the first
  // admin has committed their row. This is much cheaper than contention on a
  // dedicated counter document.
  const probeLimit = 200;
  for (let offset = 1; offset <= probeLimit; offset += 1) {
    const candidate = `${prefix}${highestSequence + offset}`;
    const existing = await db.studyMaterial.findFirst({
      where: { reportNumber: candidate },
      select: { id: true }
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new Error("LAW_REPORT_SEQUENCE_EXHAUSTED");
}

// Fire-and-forget style audit logger. Audit writes MUST never block or fail
// the business operation they're observing — the material was already saved,
// so losing an audit log is acceptable; surfacing a save error to the admin
// when the material actually persisted is not.
async function tryCreateLibraryAuditLog(
  actorUserId: string,
  action: string,
  resourceId: string,
  payload?: Prisma.InputJsonValue
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        payload,
        resource: resourceId,
        userId: actorUserId
      }
    });
  } catch (error) {
    console.error("[admin-library] auditLog write skipped", {
      action,
      resourceId,
      name: error instanceof Error ? error.constructor.name : typeof error,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function runSerializableWrite<T>(operation: () => Promise<T>) {
  // Raised to 16 attempts with exponential backoff + jitter because the
  // typical 409 failure on create is a transient report-number P2002 where
  // two admins' transactions both saw the same highest-sequence snapshot.
  // After 200 ms × 2^n (capped at 1500 ms) gaps, one writer commits first,
  // the other's re-scan sees the new highest and slots cleanly into the
  // next-available report number.
  const maxAttempts = 16;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isRetriable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034");

      if (!isRetriable || attempt === maxAttempts - 1) {
        throw error;
      }

      // Exponential backoff + random jitter so two colliding writers don't
      // keep waking up at the same instant. Cap at 1500 ms so admins never
      // wait longer than ~20s wall-clock total for all 16 attempts.
      const baseMs = 200 * Math.pow(2, attempt);
      const delayMs = Math.min(1500, baseMs + Math.floor(Math.random() * 160));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // TypeScript can't prove the loop returns or throws, so this line is
  // unreachable at runtime but keeps the type-checker happy.
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

// Safe wrapper for auxiliary summary queries. Returns fallback value on failure
// so the primary list request still succeeds even when optional metrics error.
async function safely<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error("[admin-library] summary query failed, using fallback", error instanceof Error ? error.message : error);
    return fallback;
  }
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
  const lawReports = isLawReportsSection(section);

  // Primary pagination queries - failures here are surfaced to the caller.
  const [totalItems, materials, totalInSection, downloadableCount, recentUploadsCount] = await Promise.all([
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
    })
  ]);

  // Auxiliary/summary queries - isolated with safe fallbacks to avoid 500s on
  // metrics-only regressions (e.g., readingHistory include issues, aggregate errors).
  const [nextReportNumber, engagementMaterials, averageReadTimeAggregate] = await Promise.all([
    lawReports ? safely(buildNextLawReportNumber(prisma, category.id), null as string | null) : Promise.resolve(null),
    lawReports
      ? safely(
          prisma.studyMaterial.findMany({
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
          }),
          [] as Array<{
            estimatedMins: number;
            id: string;
            reportNumber: string | null;
            title: string;
            readingHistory: Array<{ progressPct: number; timeSpentSeconds: number }>;
          }>
        )
      : Promise.resolve([]),
    safely(
      prisma.studyMaterial.aggregate({
        where: {
          categoryId: category.id,
          deletedAt: null,
          ...(audience === "student" ? { publicationStatus: ContentPublicationStatus.PUBLISHED } : {})
        },
        _avg: {
          estimatedMins: true
        }
      }),
      { _avg: { estimatedMins: null } }
    )
  ]);

  // Law-report engagement reduction is computed in-process but still wrapped
  // defensively in case of unexpected data shape inconsistencies.
  let lawReportEngagement: {
    topReports: Array<{
      id: string;
      reportNumber: string | null;
      title: string;
      totalHoursSpent: number;
      visits: number;
    }>;
    totalHoursSpent: number;
    totalVisits: number;
  } | null = null;

  if (lawReports) {
    try {
      const reportMetrics = engagementMaterials.map((material) => {
        const readingHistoryEntries = material.readingHistory ?? [];
        const visits = readingHistoryEntries.length;
        const totalTimeSpentSeconds = readingHistoryEntries.reduce((sum, history) => {
          if (history.timeSpentSeconds > 0) {
            return sum + history.timeSpentSeconds;
          }

          return sum + estimateMinutesFromReadingProgress(material.estimatedMins ?? 0, history.progressPct ?? 0) * 60;
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
      const totalHoursSpent = Number(reportMetrics.reduce((sum, report) => sum + report.totalHoursSpent, 0).toFixed(1));

      lawReportEngagement = {
        topReports: reportMetrics.sort((left, right) => right.visits - left.visits || right.totalHoursSpent - left.totalHoursSpent).slice(0, 5),
        totalHoursSpent,
        totalVisits
      };
    } catch (error) {
      console.error("[admin-library] law report engagement reduction failed", error instanceof Error ? error.message : error);
      lawReportEngagement = {
        topReports: [],
        totalHoursSpent: 0,
        totalVisits: 0
      };
    }
  }

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

  // Reattach body/summary overflow chunks so the reader sees the full, coherent
  // law report text no matter how large it is.
  const reassembled = await reassembleMaterialText(prisma, material.id, material.body, material.summary);

  return {
    category: {
      description: category.description,
      id: category.id,
      name: category.name,
      slug: category.slug
    },
    material: mapLibraryMaterial({ ...material, body: reassembled.body, summary: reassembled.summary })
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

  // Student reader also needs the full body/summary text for huge law reports, not
  // just the first 6 MB chunk stored on the parent row.
  const reassembled = await reassembleMaterialText(prisma, material.id, material.body, material.summary);
  const mappedMaterial = mapLibraryMaterial({ ...material, body: reassembled.body, summary: reassembled.summary });
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

  // Either the body/summary is inline (small) or it's a chunk token (large).
  // The zod schema permits both fields to coexist; we only read from the
  // buffer when the token is actually supplied, to keep back-compat.
  const resolved = await resolveLibraryContentFromTransport(
    input.body,
    input.summary,
    input.bodyChunkToken,
    input.summaryChunkToken
  );
  const summary = normalizeRichText(resolved.summary);
  const body = normalizeRichText(resolved.body);
  // Large body/summary strings are split so the parent document stays under the
  // MongoDB 16MB BSON cap regardless of how long the law report judgment text is.
  const bodySplit = splitSafeHeadAndOverflow(body, PER_DOC_SAFE_HEAD_CHARS);
  const summarySplit = splitSafeHeadAndOverflow(summary, PER_DOC_SAFE_HEAD_CHARS);
  // Each individual chunk must also fit comfortably into a BSON document (we use
  // ~1MB chars per chunk doc to keep plenty of headroom for fields/overhead).
  const bodyChunks = chunkifyOverflow(bodySplit.overflow, PER_CHUNK_MAX_CHARS);
  const summaryChunks = chunkifyOverflow(summarySplit.overflow, PER_CHUNK_MAX_CHARS);
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
            body: bodySplit.head || null,
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
            summary: summarySplit.head || null,
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

  // NOTE: chunk writes are intentionally performed OUTSIDE the material write
  // transaction. Keeping them inside had two failure modes for large 20+ chunk
  // imports (typical 26-page MS Word paste with Word-generated HTML):
  //   1. MongoDB multi-doc transactions have a hard ~60-second lifetime. With
  //      one `create()` per chunk over slow/serverless Atlas, the transaction
  //      could expire mid-loop and roll back the *entire* save (including the
  //      parent study material the user had already confirmed success for).
  //   2. Certain Atlas topologies (replica-set-backed serverless, M0/M2/M5
  //      shared clusters) abort multi-doc transactions that issue too many
  //      individual writes, even if each write is well under 16MB.
  // Doing chunks as post-commit writes means: the material record itself saves
  // quickly in the short transaction (no timeout, no tx write-count risk),
  // then chunk content is appended one at a time. In the unlikely event a
  // chunk write fails later the user still keeps their saved material and can
  // edit/re-save to fix the tail.
  await tryWriteMaterialBodyChunks(prisma, material.id, CHUNK_FIELD_BODY, bodyChunks);
  await tryWriteMaterialBodyChunks(prisma, material.id, CHUNK_FIELD_SUMMARY, summaryChunks);

  await tryCreateLibraryAuditLog(actorUserId, "admin.library.material.created", material.id, {
    categorySlug: category.slug,
    reportDate: material.reportDate?.toISOString() ?? null,
    materialType: material.materialType,
    reportNumber: material.reportNumber,
    title: material.title,
    bodyBytes: bufferUtf16Length(body),
    summaryBytes: bufferUtf16Length(summary),
    bodyChunkCount: bodyChunks.length,
    summaryChunkCount: summaryChunks.length
  });

  // Clear temporary transport chunks once the material is safely stored.
  // Non-fatal if cleanup fails — 6-hour sweeper catches stragglers.
  await clearAdminLibraryChunkBuffer([resolved.bodyChunkToken ?? null, resolved.summaryChunkToken ?? null]);

  // Reassemble the saved body/summary so callers get the exact text they submitted,
  // even for gigantic reports that exceeded the single-doc safe head.
  const reassembled = await reassembleMaterialText(prisma, material.id, material.body, material.summary);
  return mapLibraryMaterial({ ...material, body: reassembled.body, summary: reassembled.summary });
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

  // Either the body/summary is inline (small) or it's a chunk token (large).
  // Matches the create path — see createAdminLibraryMaterial comment.
  const resolved = await resolveLibraryContentFromTransport(
    input.body,
    input.summary,
    input.bodyChunkToken,
    input.summaryChunkToken
  );
  const summary = normalizeRichText(resolved.summary);
  const body = normalizeRichText(resolved.body);
  // On update, split body/summary the same way as create so arbitrarily large law
  // reports can be edited and re-saved without blowing the 16MB BSON cap.
  const bodySplit = splitSafeHeadAndOverflow(body, PER_DOC_SAFE_HEAD_CHARS);
  const summarySplit = splitSafeHeadAndOverflow(summary, PER_DOC_SAFE_HEAD_CHARS);
  // Keep chunk size identical on update and create, so edits of previously saved
  // content remain deterministic regardless of which direction size moves.
  const bodyChunks = chunkifyOverflow(bodySplit.overflow, PER_CHUNK_MAX_CHARS);
  const summaryChunks = chunkifyOverflow(summarySplit.overflow, PER_CHUNK_MAX_CHARS);
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
            body: bodySplit.head || null,
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
            summary: summarySplit.head || null,
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

  // Post-commit chunk (re)writes for update, identical reasoning to the create
  // path above: keep the update transaction short so it can't time out on
  // slow Atlas, then append/overwrite chunk rows. deleteMany inside the helper
  // clears the previous tail before writing the new one, so there's no stale
  // content visible to readers even across the brief post-commit window.
  await tryWriteMaterialBodyChunks(prisma, material.id, CHUNK_FIELD_BODY, bodyChunks);
  await tryWriteMaterialBodyChunks(prisma, material.id, CHUNK_FIELD_SUMMARY, summaryChunks);

  await tryCreateLibraryAuditLog(actorUserId, "admin.library.material.updated", material.id, {
    categorySlug: category.slug,
    reportDate: material.reportDate?.toISOString() ?? null,
    materialType: material.materialType,
    reportNumber: material.reportNumber,
    title: material.title,
    bodyBytes: bufferUtf16Length(body),
    summaryBytes: bufferUtf16Length(summary),
    bodyChunkCount: bodyChunks.length,
    summaryChunkCount: summaryChunks.length
  });

  // Clear temporary transport chunks once the material is safely stored.
  // Non-fatal if cleanup fails — 6-hour sweeper catches stragglers.
  await clearAdminLibraryChunkBuffer([resolved.bodyChunkToken ?? null, resolved.summaryChunkToken ?? null]);

  // Reassemble so the caller receives the complete body/summary they just saved.
  const reassembled = await reassembleMaterialText(prisma, material.id, material.body, material.summary);
  return mapLibraryMaterial({ ...material, body: reassembled.body, summary: reassembled.summary });
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

  await tryCreateLibraryAuditLog(actorUserId, "admin.library.material.deleted", materialId, {
    categorySlug: category.slug,
    reportNumber: existingMaterial.reportNumber,
    title: existingMaterial.title
  });

  return {
    id: materialId,
    success: true
  };
}

// Map user-facing field names ("body" / "summary") to the integer field
// persisted in AdminLibraryChunkBuffer. Returns null for unknown values so
// the caller can surface a 400 instead of silently coercing.
function resolveTransportField(value: string | undefined): number | null {
  if (value === "body") return CHUNK_FIELD_BODY;
  if (value === "summary") return CHUNK_FIELD_SUMMARY;
  return null;
}

// Append a single transport chunk into AdminLibraryChunkBuffer. Called from a
// plain-text body route that DOES NOT invoke express.json(), avoiding OOM on
// huge payloads. `token` is either a previously-returned opaque token or the
// string "new" on the first chunk (we allocate a fresh token then).
//
// Intentionally uses a single prisma.adminLibraryChunkBuffer.upsert so the
// client is allowed to re-upload a specific index (idempotent retries)
// without corrupting the concatenated result.
export async function appendAdminLibraryChunkBuffer(
  token: string | undefined,
  fieldParam: string | undefined,
  indexRaw: string | undefined,
  content: string
) {
  if (!content || content.length === 0) {
    throw new Error("LIBRARY_CHUNK_CONTENT_EMPTY");
  }
  if (content.length > TRANSPORT_CHUNK_MAX_CHARS * 2) {
    throw new Error("LIBRARY_CHUNK_TOO_LARGE");
  }

  const field = resolveTransportField(fieldParam);
  if (field === null) {
    throw new Error("LIBRARY_CHUNK_FIELD_INVALID");
  }

  const indexNum = Number(indexRaw);
  if (!Number.isFinite(indexNum) || !Number.isInteger(indexNum) || indexNum < 0 || indexNum >= MAX_TRANSPORT_CHUNKS_PER_FIELD) {
    throw new Error("LIBRARY_CHUNK_INDEX_INVALID");
  }

  const actualToken = token && token !== "new" && token.length > 0 ? token : `chunkbuf_${randomUUID().replace(/-/g, "")}`;

  await prisma.adminLibraryChunkBuffer.upsert({
    where: {
      token_field_index: {
        token: actualToken,
        field,
        index: indexNum
      }
    },
    create: {
      token: actualToken,
      field,
      index: indexNum,
      content
    },
    update: {
      content
    }
  });

  return {
    token: actualToken,
    field,
    index: indexNum,
    chunkChars: content.length
  };
}

// Read all rows for a (token, field) pair ordered by index ascending and join
// them. Sparse indices are tolerated: any missing index up to max(indices) is
// treated as an empty string and the caller can observe that the result is
// shorter than expected. Returns null if the token has no rows at all.
async function readTransportBuffer(token: string, field: number): Promise<string | null> {
  if (!token) return null;
  const rows = await prisma.adminLibraryChunkBuffer.findMany({
    where: {
      token,
      field
    },
    orderBy: {
      index: "asc"
    },
    select: {
      index: true,
      content: true
    }
  });
  if (rows.length === 0) return null;
  const parts: string[] = [];
  let lastIndex = -1;
  for (const row of rows) {
    const gap = row.index - lastIndex - 1;
    for (let g = 0; g < gap; g += 1) parts.push("");
    parts.push(row.content);
    lastIndex = row.index;
  }
  return parts.join("");
}

// Resolve final body/summary text during create/update. If `bodyChunkToken`
// is set we read the transport buffer; otherwise we use the inline
// `body` string. Same for `summaryChunkToken` vs `summary`. This lets the
// same schema accept either mode (small inline bodies or huge chunked).
//
// If a chunk token is supplied but the buffer is empty/missing we throw so
// admins don't silently save a blank report after a partial transport.
export type ResolvedLibraryContent = {
  body: string;
  summary: string;
  bodyChunkToken?: string | null;
  summaryChunkToken?: string | null;
  readBodyFromBuffer: boolean;
  readSummaryFromBuffer: boolean;
};

export async function resolveLibraryContentFromTransport(
  inlineBody: string | undefined,
  inlineSummary: string | undefined,
  bodyChunkToken: string | undefined,
  summaryChunkToken: string | undefined
): Promise<ResolvedLibraryContent> {
  let body = inlineBody ?? "";
  let summary = inlineSummary ?? "";
  let readBodyFromBuffer = false;
  let readSummaryFromBuffer = false;

  if (bodyChunkToken && bodyChunkToken.trim().length > 0) {
    const fromBuf = await readTransportBuffer(bodyChunkToken.trim(), CHUNK_FIELD_BODY);
    if (fromBuf === null) {
      throw new Error("LIBRARY_BODY_CHUNK_BUFFER_MISSING");
    }
    body = fromBuf;
    readBodyFromBuffer = true;
  }

  if (summaryChunkToken && summaryChunkToken.trim().length > 0) {
    const fromBuf = await readTransportBuffer(summaryChunkToken.trim(), CHUNK_FIELD_SUMMARY);
    if (fromBuf === null) {
      throw new Error("LIBRARY_SUMMARY_CHUNK_BUFFER_MISSING");
    }
    summary = fromBuf;
    readSummaryFromBuffer = true;
  }

  return {
    body,
    summary,
    bodyChunkToken: bodyChunkToken ?? null,
    summaryChunkToken: summaryChunkToken ?? null,
    readBodyFromBuffer,
    readSummaryFromBuffer
  };
}

// Clear a transport buffer. Called after successful create/update to avoid
// leaving 100 MB transport chunks in the database indefinitely. Any token
// older than 6 hours is also safe to GC via a background sweeper, but we
// always do the synchronous clear on success first.
export async function clearAdminLibraryChunkBuffer(tokens: Array<string | null | undefined>) {
  const unique = Array.from(new Set(tokens.filter((t): t is string => Boolean(t) && typeof t === "string" && t.length > 0)));
  if (unique.length === 0) return;
  try {
    await prisma.adminLibraryChunkBuffer.deleteMany({
      where: {
        token: { in: unique }
      }
    });
  } catch {
    // Non-fatal: the rows expire via createdAt index sweeper, so we never
    // abort the user-visible success just because a cleanup fails.
  }
}

// Expose the raw transport buffer contents for debugging / preview while an
// upload is still in flight. Read-only access to the token the admin client
// owns (they generated the token UUID themselves, not shared).
export async function peekAdminLibraryChunkBuffer(token: string, fieldParam: string) {
  const field = resolveTransportField(fieldParam);
  if (field === null) {
    throw new Error("LIBRARY_CHUNK_FIELD_INVALID");
  }
  const assembled = await readTransportBuffer(token, field);
  if (assembled === null) {
    return null;
  }
  return {
    token,
    field,
    totalChars: assembled.length,
    sample: assembled.slice(0, 200)
  };
}
