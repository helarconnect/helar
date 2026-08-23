import { publicHttp } from "@/lib/http";

export type LatestPublicationItem = {
  category: {
    name: string;
    slug: string;
  } | null;
  createdAt: string;
  estimatedMins: number;
  id: string;
  reportDate: string | null;
  reportNumber: string | null;
  title: string;
};

type LatestPublicationsResponse = {
  success: true;
  data: {
    items: LatestPublicationItem[];
  };
};

export async function fetchLatestPublications(limit = 6) {
  const response = await publicHttp.get<LatestPublicationsResponse>("/api/v1/catalog/latest-publications", {
    params: {
      limit
    }
  });

  return response.data.data.items;
}

