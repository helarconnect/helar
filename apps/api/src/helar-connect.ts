import { z } from "zod";

import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";

// --- Case-insensitive + punctuation-tolerant search helpers (same semantics as portal-search) ---

function stripHtmlForSearch(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeConnectSearchText(value: string): string {
  const withoutHtml = stripHtmlForSearch(value);
  const lower = withoutHtml.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized;
}

function tokenizeConnectSearchQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalized = normalizeConnectSearchText(trimmed);
  if (!normalized) return [];

  const tokens = new Set<string>();
  for (const term of normalized.split(" ")) {
    if (term.length >= 2) tokens.add(term);
  }

  // Also add collapsed-punctuation variant for serial-style tokens
  const collapsed = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (collapsed.length >= 3) tokens.add(collapsed);

  return Array.from(tokens);
}

function matchesConnectSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const terms = tokenizeConnectSearchQuery(query);
  if (terms.length === 0) return true;

  const rawHaystack = fields.filter((f): f is string => typeof f === "string" && f.length > 0).join(" ");
  const haystack = normalizeConnectSearchText(rawHaystack);
  const collapsedHaystack = rawHaystack.toLowerCase().replace(/[^a-z0-9]/g, "");

  return terms.every((term) => haystack.includes(term) || collapsedHaystack.includes(term));
}

// Generic deterministic sort helper with tiebreaks
function connectCompareWithTiebreak<T>(
  a: T,
  b: T,
  direction: "asc" | "desc",
  createdAtOf: (row: T) => Date,
  updatedAtOf?: (row: T) => Date
): number {
  const directionMul = direction === "asc" ? 1 : -1;
  // Primary: updatedAt if available, else createdAt
  const aPrimary = updatedAtOf ? updatedAtOf(a).getTime() : createdAtOf(a).getTime();
  const bPrimary = updatedAtOf ? updatedAtOf(b).getTime() : createdAtOf(b).getTime();
  let cmp = (aPrimary - bPrimary) * directionMul;
  if (cmp !== 0) return cmp;
  // Tiebreak 1: createdAt
  const aC = createdAtOf(a).getTime();
  const bC = createdAtOf(b).getTime();
  cmp = (aC - bC) * directionMul;
  if (cmp !== 0) return cmp;
  // Tiebreak 2: id ASC
  const aId = (a as { id: string }).id;
  const bId = (b as { id: string }).id;
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

const connectQuestionListQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  sort: z.enum(["interesting", "hot", "month", "week"]).default("interesting")
});

const connectUserListQuerySchema = z.object({
  search: z.string().trim().max(120).default("")
});

const connectQuestionInputSchema = z.object({
  body: z.string().trim().min(20).max(10_000),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
  title: z.string().trim().min(8).max(220)
});

const connectCommentInputSchema = z.object({
  body: z.string().trim().min(2).max(2_000)
});

const connectAnswerInputSchema = z.object({
  body: z.string().trim().min(12).max(10_000)
});

export function parseHelarConnectQuestionListQuery(input: unknown) {
  return connectQuestionListQuerySchema.parse(input);
}

export function parseHelarConnectUserListQuery(input: unknown) {
  return connectUserListQuerySchema.parse(input);
}

export function parseHelarConnectQuestionInput(input: unknown) {
  return connectQuestionInputSchema.parse(input);
}

export function parseHelarConnectCommentInput(input: unknown) {
  return connectCommentInputSchema.parse(input);
}

export function parseHelarConnectAnswerInput(input: unknown) {
  return connectAnswerInputSchema.parse(input);
}

function buildBroadHelarConnectWhere(filters: z.infer<typeof connectQuestionListQuerySchema>) {
  return {
    deletedAt: null,
    kind: "QUESTION" as const,
    ...(filters.sort === "week"
      ? {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      : {}),
    ...(filters.sort === "month"
      ? {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      : {})
  };
}

function buildHelarConnectWhere(filters: z.infer<typeof connectQuestionListQuerySchema>) {
  const trimmedSearch = filters.search.trim();
  const searchTerms = trimmedSearch.split(/\s+/).filter(Boolean);

  return {
    ...buildBroadHelarConnectWhere(filters),
    ...(trimmedSearch
      ? {
          OR: [
            { title: containsText(trimmedSearch) },
            { body: containsText(trimmedSearch) },
            { tags: { hasSome: searchTerms } },
            {
              author: {
                fullName: containsText(trimmedSearch)
              }
            },
            {
              answers: {
                some: {
                  deletedAt: null,
                  OR: [
                    {
                      body: containsText(trimmedSearch)
                    },
                    {
                      author: {
                        fullName: containsText(trimmedSearch)
                      }
                    }
                  ]
                }
              }
            },
            {
              comments: {
                some: {
                  deletedAt: null,
                  OR: [
                    {
                      body: containsText(trimmedSearch)
                    },
                    {
                      author: {
                        fullName: containsText(trimmedSearch)
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      : {})
  };
}

export async function listHelarConnectQuestions(
  filters: z.infer<typeof connectQuestionListQuerySchema>,
  viewerUserId?: string
) {
  const trimmedSearch = filters.search.trim();
  const hasActiveSearch = trimmedSearch.length >= 2;

  if (!hasActiveSearch) {
    const where = buildHelarConnectWhere(filters);

    const [totalCount, items] = await Promise.all([
      prisma.discussionTopic.count({
        where: {
          deletedAt: null,
          kind: "QUESTION"
        }
      }),
      prisma.discussionTopic.findMany({
        where,
        include: {
          author: {
            select: {
              fullName: true,
              id: true
            }
          },
          answers: {
            where: {
              deletedAt: null
            },
            include: {
              author: {
                select: {
                  fullName: true,
                  id: true
                }
              }
            },
            orderBy: {
              createdAt: "asc"
            }
          },
          comments: {
            where: {
              deletedAt: null
            },
            include: {
              author: {
                select: {
                  fullName: true,
                  id: true
                }
              }
            },
            orderBy: {
              createdAt: "asc"
            }
          },
          votes: {
            where: {
              deletedAt: null
            },
            select: {
              id: true,
              userId: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      })
    ]);

    const sortedItems =
      filters.sort === "hot"
        ? [...items].sort(
            (left, right) =>
              right.votes.length - left.votes.length ||
              right.answers.length - left.answers.length ||
              right.comments.length - left.comments.length ||
              right.updatedAt.getTime() - left.updatedAt.getTime()
          )
        : items;

    return {
      filters,
      summary: {
        totalQuestions: totalCount
      },
      items: sortedItems.map((item) => ({
        answers: item.answers.map((answer) => ({
          author: {
            id: answer.author.id,
            name: answer.author.fullName
          },
          body: answer.body,
          createdAt: answer.createdAt.toISOString(),
          id: answer.id,
          updatedAt: answer.updatedAt.toISOString()
        })),
        author: {
          id: item.author.id,
          name: item.author.fullName
        },
        body: item.body,
        commentCount: item.comments.length,
        comments: item.comments.map((comment) => ({
          author: {
            id: comment.author.id,
            name: comment.author.fullName
          },
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          id: comment.id,
          updatedAt: comment.updatedAt.toISOString()
        })),
        createdAt: item.createdAt.toISOString(),
        excerpt: item.body.slice(0, 220),
        id: item.id,
        tags: item.tags,
        title: item.title,
        updatedAt: item.updatedAt.toISOString(),
        viewCount: item.viewCount,
        viewerHasUpvoted: viewerUserId ? item.votes.some((vote) => vote.userId === viewerUserId) : false,
        voteCount: item.votes.length
      }))
    };
  }

  const strictWhere = buildHelarConnectWhere(filters);
  const broadWhere = buildBroadHelarConnectWhere(filters);

  interface CandidateAnswerRow {
    id: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    author: {
      id: string;
      fullName: string;
    } | null;
  }

  interface CandidateCommentRow {
    id: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    author: {
      id: string;
      fullName: string;
    } | null;
  }

  interface CandidateVoteRow {
    id: string;
    userId: string;
  }

  interface CandidateRow {
    id: string;
    title: string;
    body: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    viewCount: number;
    author: {
      id: string;
      fullName: string;
    } | null;
    answers: CandidateAnswerRow[];
    comments: CandidateCommentRow[];
    votes: CandidateVoteRow[];
  }

  const [totalCount, strictRowsResult, broadRowsResult] = await Promise.all([
    prisma.discussionTopic.count({
      where: {
        deletedAt: null,
        kind: "QUESTION"
      }
    }),
    prisma.discussionTopic.findMany({
      where: strictWhere,
      select: {
        id: true,
        title: true,
        body: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            fullName: true
          }
        },
        answers: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            author: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        },
        comments: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            author: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        },
        votes: {
          where: { deletedAt: null },
          select: {
            id: true,
            userId: true
          }
        }
      }
    }),
    prisma.discussionTopic.findMany({
      where: broadWhere,
      select: {
        id: true,
        title: true,
        body: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            fullName: true
          }
        },
        answers: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            author: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        },
        comments: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            author: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        },
        votes: {
          where: { deletedAt: null },
          select: {
            id: true,
            userId: true
          }
        }
      }
    })
  ]);

  const strictRows = strictRowsResult as CandidateRow[];
  const broadRows = broadRowsResult as CandidateRow[];

  const candidateMap = new Map<string, CandidateRow>();
  for (const row of broadRows) {
    candidateMap.set(row.id, row);
  }
  for (const row of strictRows) {
    candidateMap.set(row.id, row);
  }

  const candidates = Array.from(candidateMap.values());

  const matched = candidates.filter((row) => {
    const answerBodies = row.answers.map((a) => a.body).join(" ");
    const answerAuthorNames = row.answers.map((a) => a.author?.fullName).filter(Boolean).join(" ");
    const commentBodies = row.comments.map((c) => c.body).join(" ");
    const commentAuthorNames = row.comments.map((c) => c.author?.fullName).filter(Boolean).join(" ");
    const tagsJoined = (row.tags || []).join(" ");

    return matchesConnectSearch(
      trimmedSearch,
      row.title,
      row.body,
      tagsJoined,
      row.author?.fullName,
      answerBodies,
      answerAuthorNames,
      commentBodies,
      commentAuthorNames
    );
  });

  let sortedMatched: CandidateRow[];
  if (filters.sort === "hot") {
    sortedMatched = [...matched].sort((left, right) => {
      let cmp = right.votes.length - left.votes.length;
      if (cmp !== 0) return cmp;
      cmp = right.answers.length - left.answers.length;
      if (cmp !== 0) return cmp;
      cmp = right.comments.length - left.comments.length;
      if (cmp !== 0) return cmp;
      return connectCompareWithTiebreak(left, right, "desc", (r) => r.createdAt, (r) => r.updatedAt);
    });
  } else {
    sortedMatched = [...matched].sort((a, b) =>
      connectCompareWithTiebreak(a, b, "desc", (r) => r.createdAt, (r) => r.updatedAt)
    );
  }

  const pageSize = sortedMatched.length;
  const totalItems = sortedMatched.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const skip = 0;
  const pageIds = sortedMatched.slice(skip, skip + pageSize).map((r) => r.id);

  const hydratedItems = await prisma.discussionTopic.findMany({
    where: { id: { in: pageIds } },
    include: {
      author: {
        select: {
          fullName: true,
          id: true
        }
      },
      answers: {
        where: {
          deletedAt: null
        },
        include: {
          author: {
            select: {
              fullName: true,
              id: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      comments: {
        where: {
          deletedAt: null
        },
        include: {
          author: {
            select: {
              fullName: true,
              id: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      votes: {
        where: {
          deletedAt: null
        },
        select: {
          id: true,
          userId: true
        }
      }
    }
  });

  const hydratedById = new Map(hydratedItems.map((item) => [item.id, item]));
  const items = pageIds.map((id) => hydratedById.get(id)).filter(Boolean) as typeof hydratedItems;

  return {
    filters,
    summary: {
      totalQuestions: totalCount
    },
    items: items.map((item) => ({
      answers: item.answers.map((answer) => ({
        author: {
          id: answer.author.id,
          name: answer.author.fullName
        },
        body: answer.body,
        createdAt: answer.createdAt.toISOString(),
        id: answer.id,
        updatedAt: answer.updatedAt.toISOString()
      })),
      author: {
        id: item.author.id,
        name: item.author.fullName
      },
      body: item.body,
      commentCount: item.comments.length,
      comments: item.comments.map((comment) => ({
        author: {
          id: comment.author.id,
          name: comment.author.fullName
        },
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        id: comment.id,
        updatedAt: comment.updatedAt.toISOString()
      })),
      createdAt: item.createdAt.toISOString(),
      excerpt: item.body.slice(0, 220),
      id: item.id,
      tags: item.tags,
      title: item.title,
      updatedAt: item.updatedAt.toISOString(),
      viewCount: item.viewCount,
      viewerHasUpvoted: viewerUserId ? item.votes.some((vote) => vote.userId === viewerUserId) : false,
      voteCount: item.votes.length
    }))
  };
}

export async function createHelarConnectQuestion(userId: string, input: z.infer<typeof connectQuestionInputSchema>) {
  const topic = await prisma.discussionTopic.create({
    data: {
      authorId: userId,
      body: input.body,
      deletedAt: null,
      kind: "QUESTION",
      tags: input.tags,
      title: input.title
    },
    include: {
      author: {
        select: {
          fullName: true,
          id: true
        }
      }
    }
  });

  return {
    author: {
      id: topic.author.id,
      name: topic.author.fullName
    },
    body: topic.body,
    createdAt: topic.createdAt.toISOString(),
    id: topic.id,
    tags: topic.tags,
    title: topic.title,
    updatedAt: topic.updatedAt.toISOString(),
    viewCount: topic.viewCount
  };
}

function buildBroadHelarConnectUserWhere() {
  return {
    deletedAt: null,
    AND: [
      {
        OR: [
          {
            topics: {
              some: {
                deletedAt: null,
                kind: "QUESTION" as const
              }
            }
          },
          {
            answers: {
              some: {
                deletedAt: null
              }
            }
          },
          {
            comments: {
              some: {
                deletedAt: null
              }
            }
          }
        ]
      }
    ]
  };
}

function buildHelarConnectUserWhere(filters: z.infer<typeof connectUserListQuerySchema>) {
  const trimmedSearch = filters.search.trim();
  const searchTerms = trimmedSearch.split(/\s+/).filter(Boolean);

  return {
    ...buildBroadHelarConnectUserWhere(),
    AND: [
      ...buildBroadHelarConnectUserWhere().AND,
      ...(trimmedSearch
        ? [
            {
              OR: [
                {
                  fullName: containsText(trimmedSearch)
                },
                {
                  email: containsText(trimmedSearch)
                },
                {
                  topics: {
                    some: {
                      deletedAt: null,
                      kind: "QUESTION" as const,
                      OR: [
                        {
                          title: containsText(trimmedSearch)
                        },
                        {
                          body: containsText(trimmedSearch)
                        },
                        {
                          tags: {
                            hasSome: searchTerms
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  answers: {
                    some: {
                      deletedAt: null,
                      OR: [
                        {
                          body: containsText(trimmedSearch)
                        },
                        {
                          topic: {
                            title: containsText(trimmedSearch)
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  comments: {
                    some: {
                      deletedAt: null,
                      OR: [
                        {
                          body: containsText(trimmedSearch)
                        },
                        {
                          topic: {
                            title: containsText(trimmedSearch)
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          ]
        : [])
    ]
  };
}

export async function listHelarConnectUsers(filters: z.infer<typeof connectUserListQuerySchema>) {
  const trimmedSearch = filters.search.trim();
  const hasActiveSearch = trimmedSearch.length >= 2;

  if (!hasActiveSearch) {
    const contributorWhere = buildHelarConnectUserWhere(filters);

    const contributors = await prisma.user.findMany({
      where: contributorWhere,
      select: {
        avatarUrl: true,
        createdAt: true,
        email: true,
        fullName: true,
        id: true,
        topics: {
          where: {
            deletedAt: null,
            kind: "QUESTION"
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 3,
          select: {
            createdAt: true,
            id: true,
            title: true,
            votes: {
              where: {
                deletedAt: null
              },
              select: {
                id: true
              }
            }
          }
        },
        answers: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 3,
          select: {
            body: true,
            createdAt: true,
            id: true,
            topic: {
              select: {
                title: true
              }
            }
          }
        },
        comments: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 3,
          select: {
            body: true,
            createdAt: true,
            id: true,
            topic: {
              select: {
                title: true
              }
            }
          }
        },
        _count: {
          select: {
            answers: {
              where: {
                deletedAt: null
              }
            },
            comments: {
              where: {
                deletedAt: null
              }
            },
            topics: {
              where: {
                deletedAt: null,
                kind: "QUESTION"
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const items = contributors
      .map((contributor) => {
        const totalVotesReceived = contributor.topics.reduce((sum, topic) => sum + topic.votes.length, 0);
        const contributionCount = contributor._count.topics + contributor._count.answers + contributor._count.comments;
        const communityScore = contributor._count.topics * 5 + contributor._count.answers * 3 + contributor._count.comments + totalVotesReceived;
        const recentActivities = [
          ...contributor.topics.map((topic) => ({
            createdAt: topic.createdAt.toISOString(),
            id: `topic-${topic.id}`,
            title: topic.title,
            type: "question" as const
          })),
          ...contributor.answers.map((answer) => ({
            createdAt: answer.createdAt.toISOString(),
            id: `answer-${answer.id}`,
            title: answer.topic?.title ?? answer.body.slice(0, 80),
            type: "answer" as const
          })),
          ...contributor.comments.map((comment) => ({
            createdAt: comment.createdAt.toISOString(),
            id: `comment-${comment.id}`,
            title: comment.topic?.title ?? comment.body.slice(0, 80),
            type: "comment" as const
          }))
        ]
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
          .slice(0, 4);

        const lastActiveAt = recentActivities[0]?.createdAt ?? contributor.createdAt.toISOString();

        return {
          avatarUrl: contributor.avatarUrl,
          answerCount: contributor._count.answers,
          commentCount: contributor._count.comments,
          communityScore,
          contributionCount,
          email: contributor.email,
          fullName: contributor.fullName,
          id: contributor.id,
          lastActiveAt,
          questionCount: contributor._count.topics,
          recentActivities,
          totalVotesReceived
        };
      })
      .sort(
        (left, right) =>
          right.communityScore - left.communityScore ||
          right.contributionCount - left.contributionCount ||
          new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime()
      );

    return {
      filters,
      items,
      summary: {
        activeContributors: items.length,
        totalAnswers: items.reduce((sum, item) => sum + item.answerCount, 0),
        totalComments: items.reduce((sum, item) => sum + item.commentCount, 0),
        totalQuestions: items.reduce((sum, item) => sum + item.questionCount, 0)
      }
    };
  }

  const strictWhere = buildHelarConnectUserWhere(filters);
  const broadWhere = buildBroadHelarConnectUserWhere();

  interface CandidateUserTopicRow {
    id: string;
    title: string;
    body: string;
    tags: string[];
    createdAt: Date;
    votes: { id: string }[];
  }

  interface CandidateUserAnswerRow {
    id: string;
    body: string;
    createdAt: Date;
    topic: { title: string } | null;
  }

  interface CandidateUserCommentRow {
    id: string;
    body: string;
    createdAt: Date;
    topic: { title: string } | null;
  }

  interface CandidateUserRow {
    id: string;
    avatarUrl: string | null;
    createdAt: Date;
    email: string | null;
    fullName: string;
    topics: CandidateUserTopicRow[];
    answers: CandidateUserAnswerRow[];
    comments: CandidateUserCommentRow[];
    _count: {
      answers: number;
      comments: number;
      topics: number;
    };
  }

  const [strictRowsResult, broadRowsResult] = await Promise.all([
    prisma.user.findMany({
      where: strictWhere,
      select: {
        id: true,
        avatarUrl: true,
        createdAt: true,
        email: true,
        fullName: true,
        topics: {
          where: {
            deletedAt: null,
            kind: "QUESTION" as const
          },
          select: {
            id: true,
            title: true,
            body: true,
            tags: true,
            createdAt: true,
            votes: {
              where: { deletedAt: null },
              select: { id: true }
            }
          }
        },
        answers: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            topic: {
              select: {
                title: true
              }
            }
          }
        },
        comments: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            topic: {
              select: {
                title: true
              }
            }
          }
        },
        _count: {
          select: {
            answers: {
              where: { deletedAt: null }
            },
            comments: {
              where: { deletedAt: null }
            },
            topics: {
              where: {
                deletedAt: null,
                kind: "QUESTION" as const
              }
            }
          }
        }
      }
    }),
    prisma.user.findMany({
      where: broadWhere,
      select: {
        id: true,
        avatarUrl: true,
        createdAt: true,
        email: true,
        fullName: true,
        topics: {
          where: {
            deletedAt: null,
            kind: "QUESTION" as const
          },
          select: {
            id: true,
            title: true,
            body: true,
            tags: true,
            createdAt: true,
            votes: {
              where: { deletedAt: null },
              select: { id: true }
            }
          }
        },
        answers: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            topic: {
              select: {
                title: true
              }
            }
          }
        },
        comments: {
          where: { deletedAt: null },
          select: {
            id: true,
            body: true,
            createdAt: true,
            topic: {
              select: {
                title: true
              }
            }
          }
        },
        _count: {
          select: {
            answers: {
              where: { deletedAt: null }
            },
            comments: {
              where: { deletedAt: null }
            },
            topics: {
              where: {
                deletedAt: null,
                kind: "QUESTION" as const
              }
            }
          }
        }
      }
    })
  ]);

  const strictRows = strictRowsResult as unknown as CandidateUserRow[];
  const broadRows = broadRowsResult as unknown as CandidateUserRow[];

  const candidateMap = new Map<string, CandidateUserRow>();
  for (const row of broadRows) {
    candidateMap.set(row.id, row);
  }
  for (const row of strictRows) {
    candidateMap.set(row.id, row);
  }

  const candidates = Array.from(candidateMap.values());

  const matched = candidates.filter((row) => {
    const topicTitles = row.topics.map((t) => t.title).join(" ");
    const topicBodies = row.topics.map((t) => t.body).join(" ");
    const topicTags = row.topics.map((t) => (t.tags || []).join(" ")).join(" ");
    const answerBodies = row.answers.map((a) => a.body).join(" ");
    const answerTopicTitles = row.answers.map((a) => a.topic?.title).filter(Boolean).join(" ");
    const commentBodies = row.comments.map((c) => c.body).join(" ");
    const commentTopicTitles = row.comments.map((c) => c.topic?.title).filter(Boolean).join(" ");

    return matchesConnectSearch(
      trimmedSearch,
      row.fullName,
      row.email,
      topicTitles,
      topicBodies,
      topicTags,
      answerBodies,
      answerTopicTitles,
      commentBodies,
      commentTopicTitles
    );
  });

  const computedMatched = matched.map((row) => {
    const totalVotesReceived = row.topics.reduce((sum, topic) => sum + topic.votes.length, 0);
    const contributionCount = row._count.topics + row._count.answers + row._count.comments;
    const communityScore = row._count.topics * 5 + row._count.answers * 3 + row._count.comments + totalVotesReceived;
    const recentActivities = [
      ...row.topics.map((topic) => ({
        createdAt: topic.createdAt.toISOString(),
        id: `topic-${topic.id}`,
        title: topic.title,
        type: "question" as const
      })),
      ...row.answers.map((answer) => ({
        createdAt: answer.createdAt.toISOString(),
        id: `answer-${answer.id}`,
        title: answer.topic?.title ?? answer.body.slice(0, 80),
        type: "answer" as const
      })),
      ...row.comments.map((comment) => ({
        createdAt: comment.createdAt.toISOString(),
        id: `comment-${comment.id}`,
        title: comment.topic?.title ?? comment.body.slice(0, 80),
        type: "comment" as const
      }))
    ]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 4);

    const lastActiveAt = recentActivities[0]?.createdAt ?? row.createdAt.toISOString();

    return {
      row,
      totalVotesReceived,
      contributionCount,
      communityScore,
      lastActiveAt
    };
  });

  const sortedMatched = [...computedMatched].sort((left, right) => {
    let cmp = right.communityScore - left.communityScore;
    if (cmp !== 0) return cmp;
    cmp = right.contributionCount - left.contributionCount;
    if (cmp !== 0) return cmp;
    cmp = new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime();
    if (cmp !== 0) return cmp;
    return connectCompareWithTiebreak(left.row, right.row, "desc", (r) => r.createdAt);
  });

  const pageSize = sortedMatched.length;
  const totalItems = sortedMatched.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const skip = 0;
  const pageIds = sortedMatched.slice(skip, skip + pageSize).map((x) => x.row.id);

  const hydratedContributors = await prisma.user.findMany({
    where: { id: { in: pageIds } },
    select: {
      avatarUrl: true,
      createdAt: true,
      email: true,
      fullName: true,
      id: true,
      topics: {
        where: {
          deletedAt: null,
          kind: "QUESTION"
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 3,
        select: {
          createdAt: true,
          id: true,
          title: true,
          votes: {
            where: {
              deletedAt: null
            },
            select: {
              id: true
            }
          }
        }
      },
      answers: {
        where: {
          deletedAt: null
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 3,
        select: {
          body: true,
          createdAt: true,
          id: true,
          topic: {
            select: {
              title: true
            }
          }
        }
      },
      comments: {
        where: {
          deletedAt: null
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 3,
        select: {
          body: true,
          createdAt: true,
          id: true,
          topic: {
            select: {
              title: true
            }
          }
        }
      },
      _count: {
        select: {
          answers: {
            where: {
              deletedAt: null
            }
          },
          comments: {
            where: {
              deletedAt: null
            }
          },
          topics: {
            where: {
              deletedAt: null,
              kind: "QUESTION"
            }
          }
        }
      }
    }
  });

  const hydratedById = new Map(hydratedContributors.map((c) => [c.id, c]));
  const orderedHydrated = pageIds.map((id) => hydratedById.get(id)).filter(Boolean) as typeof hydratedContributors;

  const items = orderedHydrated
    .map((contributor) => {
      const totalVotesReceived = contributor.topics.reduce((sum, topic) => sum + topic.votes.length, 0);
      const contributionCount = contributor._count.topics + contributor._count.answers + contributor._count.comments;
      const communityScore = contributor._count.topics * 5 + contributor._count.answers * 3 + contributor._count.comments + totalVotesReceived;
      const recentActivities = [
        ...contributor.topics.map((topic) => ({
          createdAt: topic.createdAt.toISOString(),
          id: `topic-${topic.id}`,
          title: topic.title,
          type: "question" as const
        })),
        ...contributor.answers.map((answer) => ({
          createdAt: answer.createdAt.toISOString(),
          id: `answer-${answer.id}`,
          title: answer.topic?.title ?? answer.body.slice(0, 80),
          type: "answer" as const
        })),
        ...contributor.comments.map((comment) => ({
          createdAt: comment.createdAt.toISOString(),
          id: `comment-${comment.id}`,
          title: comment.topic?.title ?? comment.body.slice(0, 80),
          type: "comment" as const
        }))
      ]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 4);

      const lastActiveAt = recentActivities[0]?.createdAt ?? contributor.createdAt.toISOString();

      return {
        avatarUrl: contributor.avatarUrl,
        answerCount: contributor._count.answers,
        commentCount: contributor._count.comments,
        communityScore,
        contributionCount,
        email: contributor.email,
        fullName: contributor.fullName,
        id: contributor.id,
        lastActiveAt,
        questionCount: contributor._count.topics,
        recentActivities,
        totalVotesReceived
      };
    });

  return {
    filters,
    items,
    summary: {
      activeContributors: items.length,
      totalAnswers: items.reduce((sum, item) => sum + item.answerCount, 0),
      totalComments: items.reduce((sum, item) => sum + item.commentCount, 0),
      totalQuestions: items.reduce((sum, item) => sum + item.questionCount, 0)
    }
  };
}

export async function toggleHelarConnectVote(userId: string, questionId: string) {
  const existingVote = await prisma.discussionTopicVote.findFirst({
    where: {
      topicId: questionId,
      userId,
      deletedAt: null
    }
  });

  if (existingVote) {
    await prisma.discussionTopicVote.update({
      where: {
        id: existingVote.id
      },
      data: {
        deletedAt: new Date()
      }
    });
  } else {
    await prisma.discussionTopicVote.create({
      data: {
        deletedAt: null,
        topicId: questionId,
        userId
      }
    });
  }

  const voteCount = await prisma.discussionTopicVote.count({
    where: {
      topicId: questionId,
      deletedAt: null
    }
  });

  return {
    questionId,
    voteCount,
    viewerHasUpvoted: !existingVote
  };
}

export async function createHelarConnectComment(userId: string, questionId: string, input: z.infer<typeof connectCommentInputSchema>) {
  const comment = await prisma.comment.create({
    data: {
      authorId: userId,
      body: input.body,
      deletedAt: null,
      topicId: questionId
    },
    include: {
      author: {
        select: {
          fullName: true,
          id: true
        }
      }
    }
  });

  await prisma.discussionTopic.update({
    where: {
      id: questionId
    },
    data: {
      updatedAt: new Date()
    }
  });

  return {
    author: {
      id: comment.author.id,
      name: comment.author.fullName
    },
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    id: comment.id,
    updatedAt: comment.updatedAt.toISOString()
  };
}

export async function createHelarConnectAnswer(userId: string, questionId: string, input: z.infer<typeof connectAnswerInputSchema>) {
  const answer = await prisma.discussionAnswer.create({
    data: {
      authorId: userId,
      body: input.body,
      deletedAt: null,
      topicId: questionId
    },
    include: {
      author: {
        select: {
          fullName: true,
          id: true
        }
      }
    }
  });

  await prisma.discussionTopic.update({
    where: {
      id: questionId
    },
    data: {
      updatedAt: new Date()
    }
  });

  return {
    author: {
      id: answer.author.id,
      name: answer.author.fullName
    },
    body: answer.body,
    createdAt: answer.createdAt.toISOString(),
    id: answer.id,
    updatedAt: answer.updatedAt.toISOString()
  };
}

export async function recordHelarConnectQuestionView(questionId: string) {
  const topic = await prisma.discussionTopic.update({
    where: {
      id: questionId
    },
    data: {
      viewCount: {
        increment: 1
      }
    },
    select: {
      id: true,
      viewCount: true
    }
  });

  return {
    questionId: topic.id,
    viewCount: topic.viewCount
  };
}

export async function deleteHelarConnectQuestion(questionId: string) {
  const existing = await prisma.discussionTopic.findFirst({
    where: {
      deletedAt: null,
      id: questionId,
      kind: "QUESTION"
    },
    select: {
      id: true
    }
  });

  if (!existing) {
    return null;
  }

  await prisma.discussionTopic.update({
    where: {
      id: questionId
    },
    data: {
      deletedAt: new Date()
    }
  });

  return {
    id: questionId,
    success: true
  };
}

export async function deleteHelarConnectAnswer(answerId: string) {
  const existing = await prisma.discussionAnswer.findFirst({
    where: {
      deletedAt: null,
      id: answerId
    },
    select: {
      id: true,
      topicId: true
    }
  });

  if (!existing) {
    return null;
  }

  await prisma.discussionAnswer.update({
    where: {
      id: answerId
    },
    data: {
      deletedAt: new Date()
    }
  });

  await prisma.discussionTopic.update({
    where: {
      id: existing.topicId
    },
    data: {
      updatedAt: new Date()
    }
  });

  return {
    id: answerId,
    success: true
  };
}

export async function deleteHelarConnectComment(commentId: string) {
  const existing = await prisma.comment.findFirst({
    where: {
      deletedAt: null,
      id: commentId
    },
    select: {
      id: true,
      answerId: true,
      topicId: true
    }
  });

  if (!existing) {
    return null;
  }

  await prisma.comment.update({
    where: {
      id: commentId
    },
    data: {
      deletedAt: new Date()
    }
  });

  if (existing.topicId) {
    await prisma.discussionTopic.update({
      where: {
        id: existing.topicId
      },
      data: {
        updatedAt: new Date()
      }
    });
  }

  if (existing.answerId) {
    const answer = await prisma.discussionAnswer.findUnique({
      where: {
        id: existing.answerId
      },
      select: {
        topicId: true
      }
    });

    if (answer?.topicId) {
      await prisma.discussionTopic.update({
        where: {
          id: answer.topicId
        },
        data: {
          updatedAt: new Date()
        }
      });
    }
  }

  return {
    id: commentId,
    success: true
  };
}
