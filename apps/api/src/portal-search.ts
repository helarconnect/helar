import { z } from "zod";

import { prisma } from "./lib/prisma.js";
import { parseSearchDateRange, parseSearchYear } from "./lib/search-utils.js";
import { containsText } from "./lib/text-search.js";

const adminPortalSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(8).default(5),
  query: z.string().trim().min(2).max(120)
});

export type AdminPortalSearchQuery = z.infer<typeof adminPortalSearchQuerySchema>;

export type AdminPortalSearchItem = {
  badge: string | null;
  id: string;
  kind: "user" | "library_material" | "subject_summary_subject" | "subject_summary_topic" | "subject_summary_case" | "subject_summary_entry";
  path: string;
  snippet: string;
  subtitle: string;
  title: string;
};

export type AdminPortalSearchGroup = {
  items: AdminPortalSearchItem[];
  key: "users" | "library" | "subjects" | "topics" | "cases" | "entries";
  label: string;
};

function stripHtml(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usesMongoRuntime() {
  return (process.env.DATABASE_URL ?? "").startsWith("mongodb");
}

function normalizeSearchText(value: string | null | undefined) {
  return stripHtml(value).toLowerCase();
}

function matchesSearch(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

async function completeMongoMatches<T extends { id: string }>(params: {
  items: T[];
  limit: number;
  loadCandidates: () => Promise<T[]>;
  matches: (item: T) => boolean;
}) {
  if (!usesMongoRuntime() || params.items.length >= params.limit) {
    return params.items;
  }

  const completedItems = [...params.items];
  const seenIds = new Set(completedItems.map((item) => item.id));
  const candidates = await params.loadCandidates();

  for (const candidate of candidates) {
    if (seenIds.has(candidate.id) || !params.matches(candidate)) {
      continue;
    }

    completedItems.push(candidate);
    seenIds.add(candidate.id);

    if (completedItems.length >= params.limit) {
      break;
    }
  }

  return completedItems;
}

function findSnippet(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLowerCase();
  const candidate = values.map((value) => stripHtml(value)).find(Boolean) ?? "";

  if (!candidate) {
    return "Open this result to inspect the full record.";
  }

  const lowerCandidate = candidate.toLowerCase();
  const matchIndex = lowerCandidate.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return candidate.slice(0, 180) + (candidate.length > 180 ? "..." : "");
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(candidate.length, matchIndex + normalizedQuery.length + 100);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < candidate.length ? "..." : "";

  return `${prefix}${candidate.slice(start, end)}${suffix}`;
}

function buildPath(pathname: string, queryParams?: Record<string, string | undefined>) {
  if (!queryParams) {
    return pathname;
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(queryParams)) {
    if (!value) {
      continue;
    }

    params.set(key, value);
  }

  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

function formatUserSnippet(input: {
  city: string | null;
  country: string | null;
  roleNames: string[];
  state: string | null;
  status: string;
}) {
  const location = [input.city, input.state, input.country].filter(Boolean).join(", ");
  const roles = input.roleNames.join(", ");
  return [roles || "No roles assigned", location || "Location not set", input.status].filter(Boolean).join(" • ");
}

function resolveLibraryPath(input: { id: string; categorySlug: string | null }) {
  if (input.categorySlug === "law-reports") {
    return `/app/admin/library/law-reports/${input.id}`;
  }

  const sectionPath =
    input.categorySlug === "cases-and-ratios"
      ? "/app/admin/library/cases-and-ratios/materials"
      : "/app/admin/library/subject-summaries/materials";

  return buildPath(sectionPath, {
    edit: input.id
  });
}

export function parseAdminPortalSearchQuery(query: Record<string, string | string[] | undefined>) {
  return adminPortalSearchQuerySchema.parse({
    limit: Array.isArray(query.limit) ? query.limit[0] : query.limit,
    query: Array.isArray(query.query) ? query.query[0] : query.query
  });
}

export async function searchAdminPortal(query: AdminPortalSearchQuery) {
  const search = query.query.trim();
  const limit = query.limit;
  const dateRange = parseSearchDateRange(search);
  const yearQuery = parseSearchYear(search);

  const [initialUsers, initialLibraryMaterials, initialSubjects, initialTopics, initialCases, initialEntries, matchingChunks] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { fullName: containsText(search) },
          { email: containsText(search) },
          { phoneNumber: containsText(search) },
          { city: containsText(search) },
          { state: containsText(search) },
          { country: containsText(search) },
          ...(dateRange
            ? [
                {
                  createdAt: {
                    gte: dateRange.start,
                    lt: dateRange.end
                  }
                },
                {
                  updatedAt: {
                    gte: dateRange.start,
                    lt: dateRange.end
                  }
                }
              ]
            : [])
        ]
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: limit,
      include: {
        roles: {
          where: {
            deletedAt: null
          },
          include: {
            role: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.studyMaterial.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: containsText(search) },
          { reportNumber: containsText(search) },
          { storageUrl: containsText(search) },
          { summary: containsText(search) },
          { body: containsText(search) },
          ...(dateRange
            ? [
                {
                  reportDate: {
                    gte: dateRange.start,
                    lt: dateRange.end
                  }
                },
                {
                  createdAt: {
                    gte: dateRange.start,
                    lt: dateRange.end
                  }
                },
                {
                  updatedAt: {
                    gte: dateRange.start,
                    lt: dateRange.end
                  }
                }
              ]
            : []),
          {
            category: {
              name: containsText(search)
            }
          }
        ]
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: limit,
      include: {
        category: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    }),
    prisma.subjectSummarySubject.findMany({
      where: {
        deletedAt: null,
        OR: [{ name: containsText(search) }, { description: containsText(search) }]
      },
      orderBy: [{ displayOrder: "asc" }, { updatedAt: "desc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        description: true
      }
    }),
    prisma.subjectSummaryTopic.findMany({
      where: {
        deletedAt: null,
        subject: {
          deletedAt: null
        },
        OR: [
          { name: containsText(search) },
          { description: containsText(search) },
          {
            subject: {
              name: containsText(search)
            }
          }
        ]
      },
      orderBy: [{ displayOrder: "asc" }, { updatedAt: "desc" }],
      take: limit,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.subjectSummaryCase.findMany({
      where: {
        deletedAt: null,
        subject: {
          deletedAt: null
        },
        topic: {
          deletedAt: null
        },
        OR: [
          { title: containsText(search) },
          { citation: containsText(search) },
          { court: containsText(search) },
          { jurisdiction: containsText(search) },
          { ratioDecidendi: containsText(search) },
          { caseSummary: containsText(search) },
          { facts: containsText(search) },
          { issues: containsText(search) },
          { decisionHolding: containsText(search) },
          ...(yearQuery !== null
            ? [
                {
                  year: yearQuery
                }
              ]
            : []),
          { judges: { has: search } },
          { legalPrinciples: { has: search } },
          { relatedStatutes: { has: search } },
          { relatedCases: { has: search } },
          { keywords: { has: search } },
          {
            subject: {
              name: containsText(search)
            }
          },
          {
            topic: {
              name: containsText(search)
            }
          }
        ]
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: limit,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        },
        topic: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.subjectSummaryEntry.findMany({
      where: {
        deletedAt: null,
        subject: {
          deletedAt: null
        },
        OR: [
          { question: containsText(search) },
          { answer: containsText(search) },
          { keyPrinciple: containsText(search) },
          { examTip: containsText(search) },
          // FACULTY / NLS entries have unique serial numbers (e.g. FAC-0422) that
          // admins/students use to look up a specific revision card directly.
          { serialNumber: containsText(search) },
          { relatedStatutes: { has: search } },
          { tags: { has: search } },
          {
            subject: {
              name: containsText(search)
            }
          }
        ]
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: limit,
      include: {
        subject: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })
    ,
    prisma.studyMaterialBodyChunk.findMany({
      where: {
        content: containsText(search),
        material: {
          deletedAt: null
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      select: {
        content: true,
        field: true,
        materialId: true
      },
      take: Math.min(limit * 20, 240)
    })
  ]);

  const chunkMatchesByMaterialId = new Map<
    string,
    {
      body?: string;
      summary?: string;
    }
  >();
  const chunkMaterialIds: string[] = [];
  const seenChunkMaterialIds = new Set<string>();

  for (const chunk of matchingChunks) {
    const existing = chunkMatchesByMaterialId.get(chunk.materialId) ?? {};

    if (chunk.field === 0 && !existing.body) {
      chunkMatchesByMaterialId.set(chunk.materialId, { ...existing, body: chunk.content });
    } else if (chunk.field === 1 && !existing.summary) {
      chunkMatchesByMaterialId.set(chunk.materialId, { ...existing, summary: chunk.content });
    }

    if (!seenChunkMaterialIds.has(chunk.materialId)) {
      seenChunkMaterialIds.add(chunk.materialId);
      chunkMaterialIds.push(chunk.materialId);
    }
  }

  const missingChunkMaterialIds = chunkMaterialIds.filter(
    (id) => !initialLibraryMaterials.some((material) => material.id === id)
  );

  const extraChunkMaterials = missingChunkMaterialIds.length
    ? await prisma.studyMaterial.findMany({
        where: {
          deletedAt: null,
          id: {
            in: missingChunkMaterialIds
          }
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: limit,
        include: {
          category: {
            select: {
              name: true,
              slug: true
            }
          }
        }
      })
    : [];

  const combinedInitialLibraryMaterials = [...initialLibraryMaterials, ...extraChunkMaterials];

  const [users, libraryMaterials, subjects, topics, cases, entries] = await Promise.all([
    completeMongoMatches({
      items: initialUsers,
      limit,
      loadCandidates: () =>
        prisma.user.findMany({
          where: {
            deletedAt: null
          },
          orderBy: {
            updatedAt: "desc"
          },
          include: {
            roles: {
              where: {
                deletedAt: null
              },
              include: {
                role: {
                  select: {
                    code: true,
                    name: true
                  }
                }
              }
            }
          }
        }),
      matches: (user) =>
        matchesSearch(
          search,
          user.fullName,
          user.email,
          user.phoneNumber,
          user.city,
          user.state,
          user.country,
          user.roles.map((role) => `${role.role.name} ${role.role.code}`).join(" ")
        )
    }),
    completeMongoMatches({
      items: combinedInitialLibraryMaterials,
      limit,
      loadCandidates: () =>
        prisma.studyMaterial.findMany({
          where: {
            deletedAt: null
          },
          orderBy: {
            updatedAt: "desc"
          },
          include: {
            category: {
              select: {
                name: true,
                slug: true
              }
            }
          }
        }),
      matches: (material) =>
        matchesSearch(
          search,
          material.title,
          material.reportNumber,
          material.storageUrl,
          material.summary,
          material.body,
          material.category?.name,
          chunkMatchesByMaterialId.get(material.id)?.body ?? "",
          chunkMatchesByMaterialId.get(material.id)?.summary ?? ""
        )
    }),
    completeMongoMatches({
      items: initialSubjects,
      limit,
      loadCandidates: () =>
        prisma.subjectSummarySubject.findMany({
          where: {
            deletedAt: null
          },
          orderBy: [{ displayOrder: "asc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            name: true,
            description: true
          }
        }),
      matches: (subject) => matchesSearch(search, subject.name, subject.description)
    }),
    completeMongoMatches({
      items: initialTopics,
      limit,
      loadCandidates: () =>
        prisma.subjectSummaryTopic.findMany({
          where: {
            deletedAt: null,
            subject: {
              deletedAt: null
            }
          },
          orderBy: [{ displayOrder: "asc" }, { updatedAt: "desc" }],
          include: {
            subject: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }),
      matches: (topic) => matchesSearch(search, topic.name, topic.description, topic.subject.name)
    }),
    completeMongoMatches({
      items: initialCases,
      limit,
      loadCandidates: () =>
        prisma.subjectSummaryCase.findMany({
          where: {
            deletedAt: null,
            subject: {
              deletedAt: null
            },
            topic: {
              deletedAt: null
            }
          },
          orderBy: {
            updatedAt: "desc"
          },
          include: {
            subject: {
              select: {
                id: true,
                name: true
              }
            },
            topic: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }),
      matches: (item) =>
        matchesSearch(
          search,
          item.title,
          item.citation,
          item.court,
          item.ratioDecidendi,
          item.caseSummary,
          item.facts,
          item.issues,
          item.decisionHolding,
          item.subject.name,
          item.topic.name
        )
    }),
    completeMongoMatches({
      items: initialEntries,
      limit,
      loadCandidates: () =>
        prisma.subjectSummaryEntry.findMany({
          where: {
            deletedAt: null,
            subject: {
              deletedAt: null
            }
          },
          orderBy: {
            updatedAt: "desc"
          },
          include: {
            subject: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }),
      matches: (entry) =>
        matchesSearch(
          search,
          entry.question,
          entry.answer,
          entry.keyPrinciple,
          entry.examTip,
          entry.serialNumber,
          entry.relatedStatutes.join(" "),
          entry.tags.join(" "),
          entry.subject.name
        )
    })
  ]);

  const groups: AdminPortalSearchGroup[] = [
    {
      key: "users" as const,
      label: "Users",
      items: users.map((user) => ({
        badge: user.roles[0]?.role.name ?? user.status,
        id: user.id,
        kind: "user" as const,
        path: buildPath("/app/admin/users", {
          openUserId: user.id,
          search
        }),
        snippet: formatUserSnippet({
          city: user.city,
          country: user.country,
          roleNames: user.roles.map((role) => role.role.name),
          state: user.state,
          status: user.status
        }),
        subtitle: user.email,
        title: user.fullName
      }))
    },
    {
      key: "library" as const,
      label: "Library",
      items: libraryMaterials.map((material) => ({
        badge: material.category?.name ?? "Library item",
        id: material.id,
        kind: "library_material" as const,
        path: resolveLibraryPath({
          categorySlug: material.category?.slug ?? null,
          id: material.id
        }),
        snippet: findSnippet(
          search,
          material.summary,
          material.body,
          chunkMatchesByMaterialId.get(material.id)?.summary ?? "",
          chunkMatchesByMaterialId.get(material.id)?.body ?? "",
          material.storageUrl,
          material.reportNumber
        ),
        subtitle: material.category?.name ?? "Library",
        title: material.title
      }))
    },
    {
      key: "subjects" as const,
      label: "Subjects",
      items: subjects.map((subject) => ({
        badge: "Subject",
        id: subject.id,
        kind: "subject_summary_subject" as const,
        path: buildPath("/app/admin/library/subject-summaries/subjects", {
          search
        }),
        snippet: findSnippet(search, subject.description, subject.name),
        subtitle: "Subject summary subject",
        title: subject.name
      }))
    },
    {
      key: "topics" as const,
      label: "Topics",
      items: topics.map((topic) => ({
        badge: topic.subject.name,
        id: topic.id,
        kind: "subject_summary_topic" as const,
        path: buildPath("/app/admin/library/subject-summaries/topics", {
          search,
          subjectId: topic.subjectId
        }),
        snippet: findSnippet(search, topic.description, topic.subject.name),
        subtitle: `Topic in ${topic.subject.name}`,
        title: topic.name
      }))
    },
    {
      key: "cases" as const,
      label: "Cases",
      items: cases.map((item) => ({
        badge: item.topic.name,
        id: item.id,
        kind: "subject_summary_case" as const,
        path: `/app/admin/library/subject-summaries/cases/${item.id}`,
        snippet: findSnippet(search, item.caseSummary, item.ratioDecidendi, item.citation, item.court, item.facts, item.issues),
        subtitle: `${item.subject.name} / ${item.topic.name}`,
        title: item.title
      }))
    },
    {
      key: "entries" as const,
      label: "Cases & Ratios",
      items: entries.map((entry) => ({
        badge: entry.serialNumber ?? entry.subject.name,
        id: entry.id,
        kind: "subject_summary_entry" as const,
        path: buildPath("/app/admin/library/cases-and-ratios", {
          editEntry: entry.id,
          search,
          subjectId: entry.subjectId
        }),
        // serialNumber is a common lookup key (FAC-0422 / NLS-0123), so include it
        // before the long-text fields so the snippet surfaces matches against it.
        snippet: findSnippet(search, entry.serialNumber, entry.answer, entry.keyPrinciple, entry.examTip, entry.relatedStatutes.join(", "), entry.tags.join(", ")),
        subtitle: `Revision entry in ${entry.subject.name}`,
        title: entry.question
      }))
    }
  ].filter((group) => group.items.length > 0);

  return {
    groups,
    totalResults: groups.reduce((total, group) => total + group.items.length, 0)
  };
}
