import { ContentPublicationStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "./lib/prisma.js";

const latestCatalogPublicationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(6)
});

export type LatestCatalogPublicationsQuery = z.infer<typeof latestCatalogPublicationsQuerySchema>;

export type LatestCatalogPublicationItem = {
  id: string;
  title: string;
  reportNumber: string | null;
  reportDate: string | null;
  createdAt: string;
  estimatedMins: number;
  category: {
    slug: string;
    name: string;
  } | null;
};

export function parseLatestCatalogPublicationsQuery(query: Record<string, string | string[] | undefined>) {
  return latestCatalogPublicationsQuerySchema.parse({
    limit: Array.isArray(query.limit) ? query.limit[0] : query.limit
  });
}

export async function listLatestCatalogPublications(query: LatestCatalogPublicationsQuery): Promise<LatestCatalogPublicationItem[]> {
  const items = await prisma.studyMaterial.findMany({
    where: {
      deletedAt: null,
      publicationStatus: ContentPublicationStatus.PUBLISHED
    },
    orderBy: {
      createdAt: "desc"
    },
    take: query.limit,
    select: {
      id: true,
      title: true,
      reportNumber: true,
      reportDate: true,
      createdAt: true,
      estimatedMins: true,
      category: {
        select: {
          slug: true,
          name: true
        }
      }
    }
  });

  return items.map((item) => ({
    category: item.category ? { name: item.category.name, slug: item.category.slug } : null,
    createdAt: item.createdAt.toISOString(),
    estimatedMins: item.estimatedMins,
    id: item.id,
    reportDate: item.reportDate?.toISOString() ?? null,
    reportNumber: item.reportNumber,
    title: item.title
  }));
}

