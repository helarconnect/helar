import { randomUUID } from "node:crypto";
import { ContentPublicationStatus, MaterialType, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";
import { createPreviewHtml, getPremiumContentAccess, PREMIUM_PREVIEW_WORD_LIMIT } from "./premium-access.js";
import { runInTransaction } from "./lib/transactions.js";

const adminLibrarySectionSchema = z.enum(["law-reports", "subject-summaries", "cases-and-ratios", "helarpedia"]);

const adminLibraryFiltersSchema = z.object({
  materialType: z.union([z.nativeEnum(MaterialType), z.literal("all")]).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(12),
  search: z.string().trim().max(120).optional().default(""),
  sortBy: z.enum(["createdAt", "estimatedMins", "reportNumber", "title", "updatedAt"]).default("reportNumber"),
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
    storageUrl: z.string().trim().max(1_000_000).default(""),
    summary: z.string().optional().default(""),
    summaryChunkToken: z.string().trim().max(120).optional(),
    title: z.string().trim().min(2)
  })
  // NOTE: `.strip()` instead of `.strict()`. Admin UI and API versions can
  // drift for a few minutes during a rolling Render deploy — the new frontend
  // may start sending a new field while an old API worker is still alive.
  // Strict-mode would reject the save with a generic "Unrecognized key" that
  // the admin sees as "saves don't work no matter what". Strip-mode drops
  // unknown keys and saves successfully, which is almost always what a trusted
  // admin submitter wants. Zod still catches invalid values and missing
  // required fields.
  .strip();

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
  MaterialType.IMAGE,
  MaterialType.REFERENCE_ENTRY
] as const;

const lawReportCourtTypes = [
  MaterialType.COURT_OF_APPEAL,
  MaterialType.FEDERAL_HIGH_COURT,
  MaterialType.HIGH_COURT,
  MaterialType.SUPREME_COURT,
  MaterialType.TRIBUNAL
] as const;

const helarpediaMaterialTypes = [MaterialType.REFERENCE_ENTRY] as const;

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
  helarpedia: {
    description: "Manage Helarpedia issue definitions, concise legal term explanations, and cross-links to related cases.",
    name: "Helarpedia",
    slug: "helarpedia"
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

function isHelarpediaSection(section: AdminLibrarySection) {
  return section === "helarpedia";
}

function isReportNumberedSection(section: AdminLibrarySection) {
  return isLawReportsSection(section) || isHelarpediaSection(section);
}

function getAllowedMaterialTypes(section: AdminLibrarySection) {
  if (isLawReportsSection(section)) return [...lawReportCourtTypes];
  if (isHelarpediaSection(section)) return [...helarpediaMaterialTypes];
  return [...standardMaterialTypes];
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
  // Clamp to [0, 20_000] to match Zod's estimatedMins.max(20_000) ceiling.
  // Word-count / 200 wpm produces a realistic law-report reading time, but for
  // million-word pastes the naive division exceeds the Int column budget. Clamp before
  // returning — otherwise Prisma rejects the write with a generic "value out of
  // range for Int" error that surfaces as an unclassified 500.
  return Math.max(0, Math.min(20_000, Math.max(1, Math.ceil(wordCount / 200))));
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

function assertStorageUrlFilledForSection(section: AdminLibrarySection, storageUrl: string) {
  const requiresUrl = !isHelarpediaSection(section);

  if (!requiresUrl) {
    return;
  }

  const trimmed = storageUrl.trim();

  if (trimmed.length >= 2) {
    return;
  }

  throw new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      message: isLawReportsSection(section)
        ? "Provide the suit number or storage URL for this law report."
        : "Provide a valid storage URL for this library material.",
      path: ["storageUrl"]
    }
  ]);
}

// ---------- Admin-library per-process caches (TTL 5 minutes) ------------------
// (A) ensureAdminLibraryCategories — 4 DB upserts per request → once / 5 min
// (B) admin list summaries — 7 DB queries per list call → once / 5 min per section
// These caches are intentionally process-singleton (not redis / external):
//   - aggregates are read-only + safe to be slightly stale
//   - losing them on process restart is fine
//   - they save 80-300ms per page-change / sort-change / filter-change
let cachedEnsureCategoriesPromise: Promise<Array<SectionCategory>> | null = null;
let cachedEnsureCategoriesAt = 0;
const CATEGORY_CACHE_MS = 5 * 60 * 1000;

type SectionCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type AdminListSummaryCacheKey = `${AdminLibrarySection}:${LibrarySearchAudience}`;
interface CachedAdminListSummary {
  readonly averageReadTimeMins: number;
  readonly downloadableCount: number;
  readonly engagement:
    | {
        topReports: Array<{
          id: string;
          reportNumber: string | null;
          title: string;
          totalHoursSpent: number;
          visits: number;
        }>;
        totalHoursSpent: number;
        totalVisits: number;
      }
    | null;
  readonly nextReportNumber: string | null;
  readonly recentUploadsCount: number;
  readonly refreshedAt: number;
  readonly totalInSection: number;
}
const adminListSummaryCache = new Map<AdminListSummaryCacheKey, CachedAdminListSummary>();
const ADMIN_SUMMARY_CACHE_MS = 5 * 60 * 1000;

/**
 * Invalidate list-summary + next-report-number caches for a given section.
 * Called from create / update / delete write paths so admin dashboard cards
 * never show stale totals for longer than the in-flight cache window + the
 * Prisma write-watch latency (the admin list invalidates on the frontend too
 * but clearing server-side caches keeps the next paginated fetch accurate).
 */
export function invalidateAdminListSummaryCachesForSection(section: AdminLibrarySection): void {
  for (const audience of ["admin", "student"] as const) {
    adminListSummaryCache.delete(`${section}:${audience}`);
  }
}

async function ensureAdminLibraryCategories(): Promise<Array<SectionCategory>> {
  const now = Date.now();
  if (cachedEnsureCategoriesPromise && now - cachedEnsureCategoriesAt < CATEGORY_CACHE_MS) {
    return cachedEnsureCategoriesPromise;
  }

  cachedEnsureCategoriesAt = now;
  cachedEnsureCategoriesPromise = Promise.all(
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
  return cachedEnsureCategoriesPromise;
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

function mapLibraryMaterial(
  material: {
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
  },
  section: AdminLibrarySection
) {
  // Preserve serial numbers for law reports and Helarpedia. Generic library
  // uploads retain `null` since they use the opaque internal-<id> fallback.
  const retainReportNumber = isReportNumberedSection(section);
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
    reportNumber: retainReportNumber ? material.reportNumber : null,
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

  // Step 1: fetch every law-report number assigned so far this year, including
  // soft-deleted rows — the unique constraint applies across deletedAt too so
  // we cannot reuse any of them regardless of lifecycle state.
  //
  // NOTE: no `take` limit. Even with 50,000 reports/year this projection is
  // only ~1 MB over the wire and Atlas can stream it in one round-trip.
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

  // Step 2: extract the integer suffixes. We need TWO things:
  //   (a) `maxUsed` — the highest suffix ever assigned this year. Law-report
  //       citations require strictly monotonic numbering; the next entry after
  //       Helar-2026-1180 MUST be Helar-2026-1181 even if 1..500 are empty.
  //   (b) `usedIntegers` Set for O(1) race-probe collision checks so we can
  //       skip a DB round-trip after each lost concurrent-save race.
  let maxUsed = 0;
  const usedIntegers = new Set<number>();
  for (const material of reports) {
    const rawSuffix = material.reportNumber?.slice(prefix.length) ?? "";
    const parsed = Number(rawSuffix);
    if (Number.isInteger(parsed) && parsed > 0) {
      usedIntegers.add(parsed);
      if (parsed > maxUsed) maxUsed = parsed;
    }
  }

  // Step 3: pick the baseline starting integer.
  //   * New year (no reports yet)       → start at 1.
  //   * Baseline exists (maxUsed >= 1)  → start at maxUsed + 1.
  // We deliberately DO NOT fill gaps below maxUsed. A law-report series such
  // as [501..1180] means 1..500 were reserved / intentionally unused by the
  // publisher; inserting a new citation at Helar-2026-1 after Helar-2026-1180
  // would confuse every downstream consumer that relies on strict citation
  // order. Gaps stay gaps.
  let chosenInteger = maxUsed === 0 ? 1 : maxUsed + 1;

  // Step 4: up to 16 short race-guard probes. Another admin may have saved
  // between our bulk findMany and this write, or a previously caught P2002
  // means we're re-entering on runSerializableWrite retry. We verify the
  // chosen integer is free right NOW, and if it was just taken we increment
  // and try the next one (16 attempts = matches runSerializableWrite's count).
  let raceProbes = 0;
  while (raceProbes < 16) {
    // Fast path: if we already saw this integer committed in our bulk scan
    // (shouldn't happen, but keeps us honest) skip DB round-trip.
    while (usedIntegers.has(chosenInteger)) {
      chosenInteger += 1;
    }
    const candidate = `${prefix}${chosenInteger}`;
    const existing = await db.studyMaterial.findFirst({
      where: { reportNumber: candidate },
      select: { id: true }
    });
    if (!existing) {
      // #region debug-point build-next-law-report-number
      try {
        void fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "law-reports-save-failing",
            runId: "pre",
            hypothesisIds: ["H2", "H5"],
            timestamp: new Date().toISOString(),
            level: "info",
            message: "buildNextLawReportNumber chose candidate (strict monotonic)",
            data: {
              categoryId,
              prefix,
              maxUsed,
              chosenInteger,
              chosenCandidate: candidate,
              raceProbes,
              scannedExistingCount: reports.length,
              usedIntegerCount: usedIntegers.size,
              firstScannedNumbers: reports.slice(0, 5).map((r) => r.reportNumber)
            }
          })
        }).catch(() => {});
      } catch {
        /* debug-only; never block the request */
      }
      console.debug("[debug-law-reports-save-failing][H2|H5] buildNextLawReportNumber chose candidate (strict monotonic)", {
        categoryId,
        prefix,
        maxUsed,
        chosenInteger,
        chosenCandidate: candidate,
        raceProbes,
        scannedExistingCount: reports.length,
        usedIntegerCount: usedIntegers.size,
        firstScannedNumbers: reports.slice(0, 5).map((r) => r.reportNumber)
      });
      // #endregion debug-point build-next-law-report-number
      return candidate;
    }
    // Lost a race: another admin committed this number between our bulk
    // findMany and this probe. Add it to usedIntegers so the next forward
    // step skips it directly without a DB round-trip.
    usedIntegers.add(chosenInteger);
    if (chosenInteger > maxUsed) maxUsed = chosenInteger;
    raceProbes += 1;
    // Always walk forward — law report numbers are strictly monotonic.
    chosenInteger += 1;
  }

  // If we exhausted the 16-probe race budget, the calling runSerializableWrite
  // will re-enter this function on P2002 and perform a fresh bulk scan with
  // the new committed data — guaranteed progress on retry.
  return `${prefix}${chosenInteger}`;
}

// Helarpedia serial number generator. Format is `Helarpedia-{n}` with the first
// entry starting at 1000. This matches the publisher's request: "The serial
// number should start from 1000 and should have this format: Helarpedia-1000."
// Law of strict monotonic increase applies here too — never fill gaps once a
// baseline is established (start from maxUsed + 1), only use 1000 if zero
// Helarpedia entries have ever been saved.
async function buildNextHelarpediaNumber(
  db: Prisma.TransactionClient | typeof prisma,
  categoryId: string
) {
  const HELARPEDIA_BASELINE = 1000;
  const prefix = "Helarpedia-";

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

  let maxUsed = 0;
  const usedIntegers = new Set<number>();
  for (const material of reports) {
    const rawSuffix = material.reportNumber?.slice(prefix.length) ?? "";
    const parsed = Number(rawSuffix);
    if (Number.isInteger(parsed) && parsed > 0) {
      usedIntegers.add(parsed);
      if (parsed > maxUsed) maxUsed = parsed;
    }
  }

  // Start from 1000 on an empty Helarpedia archive; strictly advance from
  // maxUsed + 1 once any entry has been saved.
  let chosenInteger = maxUsed === 0 ? HELARPEDIA_BASELINE : maxUsed + 1;

  let raceProbes = 0;
  while (raceProbes < 16) {
    while (usedIntegers.has(chosenInteger)) {
      chosenInteger += 1;
    }
    const candidate = `${prefix}${chosenInteger}`;
    const existing = await db.studyMaterial.findFirst({
      where: { reportNumber: candidate },
      select: { id: true }
    });
    if (!existing) {
      try {
        void fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "law-reports-save-failing",
            runId: "pre",
            hypothesisIds: ["H2", "H5"],
            timestamp: new Date().toISOString(),
            level: "info",
            message: "buildNextHelarpediaNumber chose candidate (strict monotonic)",
            data: {
              categoryId,
              prefix,
              maxUsed,
              baseline: HELARPEDIA_BASELINE,
              chosenInteger,
              chosenCandidate: candidate,
              raceProbes,
              scannedExistingCount: reports.length,
              usedIntegerCount: usedIntegers.size
            }
          })
        }).catch(() => {});
      } catch {
        /* debug-only */
      }
      console.debug("[debug-law-reports-save-failing][H2|H5] buildNextHelarpediaNumber chose candidate (strict monotonic)", {
        categoryId,
        prefix,
        maxUsed,
        baseline: HELARPEDIA_BASELINE,
        chosenInteger,
        chosenCandidate: candidate,
        raceProbes,
        scannedExistingCount: reports.length,
        usedIntegerCount: usedIntegers.size
      });
      return candidate;
    }
    usedIntegers.add(chosenInteger);
    if (chosenInteger > maxUsed) maxUsed = chosenInteger;
    raceProbes += 1;
    chosenInteger += 1;
  }

  return `${prefix}${chosenInteger}`;
}

// Dispatcher: pick the correct section-specific next-report-number generator.
// Law reports use Helar-{year}-N. Helarpedia uses Helarpedia-{1000+N}. Other
// generic library sections (cases-and-ratios, subject-summaries) do not have
// dedicated citation numbers; they use internal-{uuid} instead.
// For legacy rows saved before serial-number assignment was wired end-to-end,
// lazily backfill the next number the first time the row is read so admins see
// a stable citation instead of "Pending assignment" and readers load without
// errors. Returns the input material, potentially mutated with the new number
// and timestamp bumps.
async function ensureReportNumberBackfill<T extends { id: string; reportNumber: string | null }>(
  section: AdminLibrarySection,
  material: T,
  categoryId: string
): Promise<T> {
  if (!isReportNumberedSection(section)) return material;
  if (material.reportNumber && material.reportNumber.trim().length > 0) return material;

  try {
    const assigned = await buildNextReportNumberForSection(section, prisma, categoryId);
    if (!assigned) return material;

    await prisma.studyMaterial.update({
      data: {
        reportNumber: assigned,
        updatedAt: new Date()
      },
      select: { id: true },
      where: { id: material.id }
    });

    (material as T & { reportNumber: string }).reportNumber = assigned;
    return material;
  } catch (error) {
    // Best-effort: don't fail the read if a concurrent write or unique collision
    // defeats the backfill. The admin will see "Pending assignment" and can
    // open the modal to save it explicitly.
    console.warn("[admin-library] serial backfill skipped", material.id, error instanceof Error ? error.message : error);
    return material;
  }
}

async function buildNextReportNumberForSection(
  section: AdminLibrarySection,
  db: Prisma.TransactionClient | typeof prisma,
  categoryId: string
): Promise<string | null> {
  if (isLawReportsSection(section)) {
    return buildNextLawReportNumber(db, categoryId);
  }
  if (isHelarpediaSection(section)) {
    return buildNextHelarpediaNumber(db, categoryId);
  }
  return null;
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
      // #region debug-point run-serializable-write-attempt
      try {
        void fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "law-reports-save-failing",
            runId: "pre",
            hypothesisIds: ["H2", "H5"],
            timestamp: new Date().toISOString(),
            level: "info",
            message: "runSerializableWrite caught error",
            data: {
              attempt,
              maxAttempts,
              isRetriable,
              prismaCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null,
              prismaMetaTarget:
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.meta &&
                typeof error.meta === "object" &&
                "target" in error.meta
                  ? (error.meta as { target?: unknown }).target
                  : null,
              errorClass: error instanceof Error ? error.constructor.name : typeof error,
              errorMessage: error instanceof Error ? error.message : String(error)
            }
          })
        }).catch(() => {});
      } catch {
        /* debug-only */
      }
      console.debug("[debug-law-reports-save-failing][H2|H5] runSerializableWrite attempt", {
        attempt,
        maxAttempts,
        isRetriable,
        prismaCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null,
        prismaMetaTarget:
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.meta &&
          typeof error.meta === "object" &&
          "target" in error.meta
            ? (error.meta as { target?: unknown }).target
            : null,
        errorClass: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      // #endregion debug-point run-serializable-write-attempt
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
  // Admin saves are trusted (authenticated request with admin role codes).
  // Lenient pre-clean: if the payload is a plain object, strip any keys with
  // undefined/null values so optional fields never appear as explicit nulls
  // (which would still pass `optional()` but looks like a "strict-mode extra
  // key" if a future Zod version tightens undefined handling, and confuses
  // logs). This pre-clean has no effect on strict/strip schemas — it's just a
  // defensive normalization.
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      cleaned[k] = v;
    }
    return adminLibraryMaterialInputSchema.parse(cleaned);
  }
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
  const reportNumberedSection = isReportNumberedSection(section);
  const isAdminAudience = audience === "admin";

  // Deterministic, cross-database sort builder.
  // NOTE: `nulls: "first" / "last"` exists on Prisma generated client types but the
  //       MongoDB adapter does NOT support this field at runtime — it throws an
  //       "Unknown argument `nulls`" validation error (P2009). MongoDB BSON sort
  //       semantics already put STRING > NULL in DESC order, so a plain
  //       `{ reportNumber: "desc" }` yields exactly the desired "nulls last"
  //       ordering for legacy materials without a serial number, without needing
  //       the PostgreSQL-specific `nulls` key. PostgreSQL users would need a
  //       computed column or post-query reorder to match; since this deployment
  //       is MongoDB Atlas, the simple form is both correct and portable.
  // We always append `createdAt desc, id asc` as a tiebreaker so two materials
  // with identical sort values never re-order across pages / calls.
  const orderBy: Array<Prisma.StudyMaterialOrderByWithRelationInput> = (() => {
    const direction: Prisma.SortOrder = filters.sortOrder;
    if (filters.sortBy === "reportNumber") {
      return [
        { reportNumber: direction },
        { createdAt: "desc" as const },
        { id: "asc" as const }
      ] as Array<Prisma.StudyMaterialOrderByWithRelationInput>;
    }
    if (filters.sortBy === "title") {
      return [
        { title: direction },
        { createdAt: "desc" as const },
        { id: "asc" as const }
      ] as Array<Prisma.StudyMaterialOrderByWithRelationInput>;
    }
    if (filters.sortBy === "estimatedMins") {
      return [
        { estimatedMins: direction },
        { createdAt: "desc" as const },
        { id: "asc" as const }
      ] as Array<Prisma.StudyMaterialOrderByWithRelationInput>;
    }
    return [
      { [filters.sortBy]: direction },
      { id: "asc" as const }
    ] as Array<Prisma.StudyMaterialOrderByWithRelationInput>;
  })();

  // Student/portal list pages only need pagination plus the current page of
  // materials. Every auxiliary query we skip on this hot path shaves another
  // 50-200ms off a cold page load, which matters when a reader is deciding
  // whether to stay. The admin dashboard renders 6 summary cards and needs
  // the full picture — those queries only run when audience === "admin".
  const [totalItems, materials] = await Promise.all([
    prisma.studyMaterial.count({ where }),
    prisma.studyMaterial.findMany(
      (() => {
        const base = {
          where,
          orderBy,
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize
        } as const;
        if (isAdminAudience) {
          return {
            ...base,
            include: {
              _count: {
                select: {
                  bookmarks: true,
                  readingHistory: true
                }
              }
            }
          };
        }
        return {
          ...base,
          select: {
            approvedAt: true,
            body: true,
            createdAt: true,
            downloadable: true,
            estimatedMins: true,
            id: true,
            materialType: true,
            publicationStatus: true,
            reportDate: true,
            reportNumber: true,
            reviewFeedback: true,
            sharingEnabled: true,
            storageUrl: true,
            summary: true,
            title: true,
            updatedAt: true
          }
        };
      })() as never
    )
  ]);

  // ---- Admin-only engagement counters (read-through process cache) --------
  let nextReportNumber: string | null = null;
  let totalInSection: number = totalItems;
  let downloadableCount: number = 0;
  let recentUploadsCount: number = 0;
  let averageReadTimeMins: number = 0;
  let lawReportEngagement: CachedAdminListSummary["engagement"] = null;

  if (isAdminAudience) {
    const cacheKey: AdminListSummaryCacheKey = `${section}:${audience}`;
    const cached = adminListSummaryCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.refreshedAt < ADMIN_SUMMARY_CACHE_MS) {
      nextReportNumber = cached.nextReportNumber;
      totalInSection = cached.totalInSection;
      downloadableCount = cached.downloadableCount;
      recentUploadsCount = cached.recentUploadsCount;
      averageReadTimeMins = cached.averageReadTimeMins;
      lawReportEngagement = cached.engagement;
    } else {
      const baseSectionWhere = {
        categoryId: category.id,
        deletedAt: null
      } as const;

      // `prisma.readingHistory.groupBy` does NOT support relation filters
      // (the `where` clause is restricted to same-table columns only). Using
      // `where: { material: baseSectionWhere }` inside groupBy would throw a
      // PrismaClientValidationError with "Unknown argument `material`".
      // Workaround: fetch the section material IDs up-front with a plain
      // findMany (cheap — SELECT id, fully cached by Postgres/Atlas for
      // repeated admin list loads) then scope the groupBy to those IDs via
      // `materialId: { in: sectionMaterialIds }`. Semantically identical.
      const sectionMaterialIdRows = reportNumberedSection
        ? await prisma.studyMaterial.findMany({
            select: { id: true },
            where: baseSectionWhere
          })
        : [];
      const sectionMaterialIds = sectionMaterialIdRows.map((row) => row.id);

      const [counters, readingMetrics] = await Promise.all([
        Promise.all([
          reportNumberedSection
            ? safely(buildNextReportNumberForSection(section, prisma, category.id), null as string | null)
            : Promise.resolve(null),
          prisma.studyMaterial.count({ where: baseSectionWhere }),
          prisma.studyMaterial.count({ where: { ...baseSectionWhere, downloadable: true } }),
          prisma.studyMaterial.count({
            where: {
              ...baseSectionWhere,
              createdAt: {
                gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
              }
            }
          }),
          safely(
            prisma.studyMaterial.aggregate({
              _avg: { estimatedMins: true },
              where: baseSectionWhere
            }),
            { _avg: { estimatedMins: null } } as { _avg: { estimatedMins: number | null } }
          )
        ]),
        reportNumberedSection && sectionMaterialIds.length > 0
          ? safely(
              prisma.readingHistory.groupBy({
                by: ["materialId"],
                _count: { _all: true },
                _sum: { timeSpentSeconds: true },
                where: {
                  deletedAt: null,
                  materialId: { in: sectionMaterialIds }
                }
              }),
              [] as Array<{
                materialId: string;
                _count: { _all: number };
                _sum: { timeSpentSeconds: number | null };
              }>
            )
          : Promise.resolve([])
      ]);

      [nextReportNumber, totalInSection, downloadableCount, recentUploadsCount] = [
        counters[0],
        counters[1],
        counters[2],
        counters[3]
      ];
      averageReadTimeMins = Math.round(counters[4]._avg.estimatedMins ?? 0);

      if (reportNumberedSection && readingMetrics.length) {
        try {
          const materialMetrics = new Map<string, { visits: number; totalSeconds: number }>();
          for (const row of readingMetrics) {
            materialMetrics.set(row.materialId, {
              totalSeconds: row._sum.timeSpentSeconds ?? 0,
              visits: row._count._all ?? 0
            });
          }

          const totalVisits = readingMetrics.reduce((sum, row) => sum + (row._count._all ?? 0), 0);
          const totalSeconds = readingMetrics.reduce((sum, row) => sum + (row._sum.timeSpentSeconds ?? 0), 0);
          const totalHoursSpent = Number(toRoundedHoursFromSeconds(totalSeconds).toFixed(1));

          const topIds = [...readingMetrics]
            .sort((left, right) => {
              const vl = left._count._all ?? 0;
              const vr = right._count._all ?? 0;
              if (vl !== vr) return vr - vl;
              return (right._sum.timeSpentSeconds ?? 0) - (left._sum.timeSpentSeconds ?? 0);
            })
            .slice(0, 5)
            .map((row) => row.materialId);

          let topMaterials: Array<{ id: string; reportNumber: string | null; title: string; estimatedMins: number }> = [];
          if (topIds.length > 0) {
            const found = await prisma.studyMaterial.findMany({
              select: { id: true, reportNumber: true, title: true, estimatedMins: true },
              where: {
                id: { in: topIds },
                ...baseSectionWhere
              }
            });
            topMaterials = topIds
              .map((id) => found.find((m) => m.id === id))
              .filter((item): item is NonNullable<typeof item> => Boolean(item));
          }

          if (topMaterials.length < 5) {
            const fillCount = 5 - topMaterials.length;
            const filled = await prisma.studyMaterial.findMany({
              orderBy: { createdAt: "desc" },
              select: { id: true, reportNumber: true, title: true, estimatedMins: true },
              take: fillCount,
              where: {
                ...baseSectionWhere,
                NOT: { id: { in: topMaterials.map((m) => m.id) } }
              }
            });
            topMaterials = [...topMaterials, ...filled];
          }

          lawReportEngagement = {
            topReports: topMaterials
              .map((material) => {
                const metrics = materialMetrics.get(material.id) ?? { visits: 0, totalSeconds: 0 };
                const fallbackSeconds = material.estimatedMins
                  ? Math.round(material.estimatedMins * 60 * Math.min(1, metrics.visits))
                  : 0;
                const effective = metrics.totalSeconds > 0 ? metrics.totalSeconds : fallbackSeconds;
                return {
                  id: material.id,
                  reportNumber: material.reportNumber,
                  title: material.title,
                  totalHoursSpent: Number(toRoundedHoursFromSeconds(effective).toFixed(2)),
                  visits: metrics.visits
                };
              })
              .sort((l, r) => r.visits - l.visits || r.totalHoursSpent - l.totalHoursSpent),
            totalHoursSpent,
            totalVisits
          };
        } catch (error) {
          console.error(
            "[admin-library] law report engagement reduction failed",
            error instanceof Error ? error.message : error
          );
          lawReportEngagement = { topReports: [], totalHoursSpent: 0, totalVisits: 0 };
        }
      } else if (reportNumberedSection) {
        // No reading history yet (fresh section) — still prefill top-5 with the
        // latest materials so the admin dashboard never has an empty leaderboard.
        const latest = await prisma.studyMaterial.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, reportNumber: true, title: true, estimatedMins: true },
          take: 5,
          where: { categoryId: category.id, deletedAt: null }
        });
        lawReportEngagement = {
          topReports: latest.map((material) => ({
            id: material.id,
            reportNumber: material.reportNumber,
            title: material.title,
            totalHoursSpent: 0,
            visits: 0
          })),
          totalHoursSpent: 0,
          totalVisits: 0
        };
      }

      // Populate cache after a successful fresh fetch so the next page / sort
      // / filter change for this section hits cache immediately (0 DB calls).
      adminListSummaryCache.set(cacheKey, {
        averageReadTimeMins,
        downloadableCount,
        engagement: lawReportEngagement,
        nextReportNumber,
        recentUploadsCount,
        refreshedAt: now,
        totalInSection
      });
    }
  }

  // Student path used `select:` which drops the `_count` field expected by
  // mapLibraryMaterial. Attach zero-value counts so the response shape stays
  // identical regardless of audience.
  const mappedMaterials = (materials as Array<Record<string, unknown>>).map((rawMaterial) => {
    const withCounts = Object.assign({}, rawMaterial, {
      _count:
        typeof rawMaterial._count === "object" && rawMaterial._count
          ? rawMaterial._count
          : { bookmarks: 0, readingHistory: 0 }
    });
    return mapLibraryMaterial(withCounts as never, section);
  });

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
    materials: mappedMaterials,
    nextReportNumber,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize))
    },
    summary: {
      averageReadTimeMins,
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

  // Legacy rows may have been saved before serial assignment was active; ensure
  // the detail fetch returns a populated citation so the shared reader has the
  // stable serial number it uses for bookmark/progress keys.
  const materialWithSerial = await ensureReportNumberBackfill(section, material, category.id);

  // Reattach body/summary overflow chunks so the reader sees the full, coherent
  // law report text no matter how large it is.
  const reassembled = await reassembleMaterialText(prisma, materialWithSerial.id, materialWithSerial.body, materialWithSerial.summary);

  return {
    category: {
      description: category.description,
      id: category.id,
      name: category.name,
      slug: category.slug
    },
    material: mapLibraryMaterial({ ...materialWithSerial, body: reassembled.body, summary: reassembled.summary }, section)
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

  // Ensure legacy student-visible rows always have a serial number before the
  // reader builds progress/bookmark keys on it.
  const materialWithSerial = await ensureReportNumberBackfill(section, material, category.id);

  // Student reader also needs the full body/summary text for huge law reports, not
  // just the first 6 MB chunk stored on the parent row.
  const reassembled = await reassembleMaterialText(prisma, materialWithSerial.id, materialWithSerial.body, materialWithSerial.summary);
  const mappedMaterial = mapLibraryMaterial({ ...materialWithSerial, body: reassembled.body, summary: reassembled.summary }, section);
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
        path: isReportNumberedSection(section)
          ? audience === "admin"
            ? `/app/admin/library/${section}/${material.id}`
            : `/app/library/${section}/${material.id}`
          : audience === "admin"
            ? `/app/admin/library/${section}`
            : `/app/library/${section}`,
        reportNumber: isReportNumberedSection(section) ? material.reportNumber : null,
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
  assertStorageUrlFilledForSection(section, input.storageUrl);

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
  const estimatedMins = isLawReportsSection(section) || isHelarpediaSection(section) ? calculateEstimatedMinutesFromBody(body) : input.estimatedMins;
  const reportDate = parseReportDate(input.reportDate, section);
  // Helarpedia also gets a serial number (Helarpedia-1000, 1001, …). Sections with
  // dedicated numbering both fall through the isReportNumberedSection branch below.
  const internalReportNumber = isReportNumberedSection(section) ? null : `internal-${randomUUID()}`;
  const publicationStatus = resolvePublicationStatus(actorRoleCodes);

  // See create/update parity comments above for the reliability principles here:
  //   (a) serial number resolution runs OUTSIDE the one-statement write against
  //       the global prisma client (latest committed data, no snapshot isolation
  //       → no stale candidates).
  //   (b) studyMaterial.create runs directly on prisma, not wrapped in a
  //       multi-doc MongoDB tx (removes spurious P2024/P2034 from Atlas shared
  //       tiers on single-statement writes).
  //   (c) buildNextReportNumberForSection dispatches law-reports → Helar-{year}-N
  //       and helarpedia → Helarpedia-{1000+N}; generic sections keep internal-{uuid}.
  const material = await runSerializableWrite(async () => {
    const manualReportNumber = input.reportNumber.trim();
    const computedReportNumber = isReportNumberedSection(section)
      ? manualReportNumber || (await buildNextReportNumberForSection(section, prisma, category.id))
      : internalReportNumber;
    return prisma.studyMaterial.create({
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
        ...(computedReportNumber ? { reportNumber: computedReportNumber } : {})
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
  });

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
  invalidateAdminListSummaryCachesForSection(section);
  return mapLibraryMaterial({ ...material, body: reassembled.body, summary: reassembled.summary }, section);
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
  assertStorageUrlFilledForSection(section, input.storageUrl);

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
  const estimatedMins = isLawReportsSection(section) || isHelarpediaSection(section) ? calculateEstimatedMinutesFromBody(body) : input.estimatedMins;
  const reportDate = parseReportDate(input.reportDate, section);

  const publicationStatus = resolvePublicationStatus(actorRoleCodes, existingMaterial.publicationStatus);

  // Mirror create flow:
  //   (a) Assign a serial number on update ONLY if the entry was imported/migrated
  //       with no reportNumber previously. For Helarpedia this uses Helarpedia-1000+N
  //       strict monotonic; for law reports it uses Helar-{year}-N strict monotonic.
  //   (b) Numbering runs OUTSIDE the one-statement write against the global prisma
  //       client (reads committed data, no snapshot stale reads).
  //   (c) Single-statement prisma.studyMaterial.update runs directly — no MongoDB
  //       multi-doc tx wrapper; eliminates spurious P2024/P2034 on Atlas shared
  //       clusters as a false "another admin may be uploading" toast.
  const material = await runSerializableWrite(async () => {
    const manualReportNumber = input.reportNumber.trim();
    const reportNumber = isReportNumberedSection(section)
      ? manualReportNumber ||
        existingMaterial.reportNumber ||
        (await buildNextReportNumberForSection(section, prisma, category.id))
      : manualReportNumber || (existingMaterial.reportNumber ?? `internal-${materialId}`);
    return prisma.studyMaterial.update({
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
  });

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
  invalidateAdminListSummaryCachesForSection(section);
  return mapLibraryMaterial({ ...material, body: reassembled.body, summary: reassembled.summary }, section);
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

  invalidateAdminListSummaryCachesForSection(section);

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
