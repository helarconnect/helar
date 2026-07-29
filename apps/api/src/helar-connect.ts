import { z } from "zod";

import { prisma } from "./lib/prisma.js";
import { containsText } from "./lib/text-search.js";

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

function buildHelarConnectWhere(filters: z.infer<typeof connectQuestionListQuerySchema>) {
  const trimmedSearch = filters.search.trim();
  const searchTerms = trimmedSearch.split(/\s+/).filter(Boolean);

  return {
    deletedAt: null,
    kind: "QUESTION" as const,
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
      : {}),
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

export async function listHelarConnectQuestions(
  filters: z.infer<typeof connectQuestionListQuerySchema>,
  viewerUserId?: string
) {
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

export async function listHelarConnectUsers(filters: z.infer<typeof connectUserListQuerySchema>) {
  const trimmedSearch = filters.search.trim();
  const searchTerms = trimmedSearch.split(/\s+/).filter(Boolean);
  const contributorWhere = {
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
      },
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
