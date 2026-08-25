import { z } from "zod";
import type { MaterialType } from "@prisma/client";

import { searchLibraryMaterialsForStudents } from "./admin-library.js";
import { searchStudentStudyCenter } from "./student-study-center.js";

const studentPortalSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(8).default(5),
  query: z.string().trim().min(2).max(120)
});

export type StudentPortalSearchQuery = z.infer<typeof studentPortalSearchQuerySchema>;

export type StudentPortalSearchItem = {
  badge: string | null;
  id: string;
  kind: "library_material" | "bookmark" | "note" | "download" | "history";
  matchedIn?: "body" | "reportNumber" | "storageUrl" | "summary" | "title";
  materialType?: MaterialType;
  path: string;
  reportNumber?: string | null;
  snippet: string;
  subtitle: string;
  title: string;
};

export type StudentPortalSearchGroup = {
  items: StudentPortalSearchItem[];
  key: "library" | "study_center";
  label: string;
};

export type StudentPortalSearchResponse = {
  groups: StudentPortalSearchGroup[];
  totalResults: number;
};

const studentSearchCache = new Map<string, { expiresAt: number; value: StudentPortalSearchResponse }>();
const studentSearchCacheTtlMs = 7_000;

export function parseStudentPortalSearchQuery(query: Record<string, string | string[] | undefined>) {
  return studentPortalSearchQuerySchema.parse({
    limit: Array.isArray(query.limit) ? query.limit[0] : query.limit,
    query: Array.isArray(query.query) ? query.query[0] : query.query
  });
}

async function settleOrFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

export async function searchStudentPortal(userId: string, query: StudentPortalSearchQuery): Promise<StudentPortalSearchResponse> {
  const cacheKey = `${userId}:${query.limit}:${query.query.trim().toLowerCase()}`;
  const cached = studentSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [libraryItems, studyCenter] = await Promise.all([
    settleOrFallback(
      searchLibraryMaterialsForStudents({
        limit: query.limit,
        query: query.query
      }),
      []
    ),
    settleOrFallback(
      searchStudentStudyCenter(userId, {
        query: query.query
      }),
      { items: [] }
    )
  ]);

  const groups: StudentPortalSearchGroup[] = [
    {
      key: "library" as const,
      label: "Library",
      items: libraryItems.slice(0, query.limit).map((item) => ({
        badge: item.reportNumber ?? item.sectionLabel ?? null,
        id: item.id,
        kind: "library_material" as const,
        matchedIn: item.matchedIn as StudentPortalSearchItem["matchedIn"],
        materialType: item.materialType,
        path: item.path,
        reportNumber: item.reportNumber,
        snippet: item.snippet,
        subtitle: item.sectionLabel,
        title: item.title
      }))
    },
    {
      key: "study_center" as const,
      label: "Study Center",
      items: studyCenter.items.slice(0, query.limit).map((item) => ({
        badge: item.kind.replace(/_/g, " "),
        id: item.id,
        kind: item.kind,
        path: item.path,
        snippet: item.meta,
        subtitle: "Study Center",
        title: item.label
      }))
    }
  ].filter((group) => group.items.length > 0);

  const response: StudentPortalSearchResponse = {
    groups,
    totalResults: groups.reduce((total, group) => total + group.items.length, 0)
  };

  studentSearchCache.set(cacheKey, { expiresAt: Date.now() + studentSearchCacheTtlMs, value: response });
  while (studentSearchCache.size > 1000) {
    const oldestKey = studentSearchCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    studentSearchCache.delete(oldestKey);
  }

  return response;
}
