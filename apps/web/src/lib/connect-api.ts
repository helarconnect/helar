import { authenticatedHttp, publicHttp } from "@/lib/http";

export type HelarConnectSort = "interesting" | "hot" | "month" | "week";

export type HelarConnectQuestionFilters = {
  search?: string;
  sort?: HelarConnectSort;
};

export type HelarConnectComment = {
  author: {
    id: string;
    name: string;
  };
  body: string;
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type HelarConnectAnswer = {
  author: {
    id: string;
    name: string;
  };
  body: string;
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type HelarConnectQuestion = {
  answers: HelarConnectAnswer[];
  author: {
    id: string;
    name: string;
  };
  body: string;
  commentCount: number;
  comments: HelarConnectComment[];
  createdAt: string;
  excerpt: string;
  id: string;
  tags: string[];
  title: string;
  updatedAt: string;
  viewCount: number;
  viewerHasUpvoted: boolean;
  voteCount: number;
};

export type HelarConnectSnapshot = {
  filters: {
    search: string;
    sort: HelarConnectSort;
  };
  items: HelarConnectQuestion[];
  summary: {
    totalQuestions: number;
  };
};

export type HelarConnectUser = {
  answerCount: number;
  avatarUrl: string | null;
  commentCount: number;
  communityScore: number;
  contributionCount: number;
  email: string;
  fullName: string;
  id: string;
  lastActiveAt: string;
  questionCount: number;
  recentActivities: Array<{
    createdAt: string;
    id: string;
    title: string;
    type: "answer" | "comment" | "question";
  }>;
  totalVotesReceived: number;
};

export type HelarConnectUsersSnapshot = {
  filters: {
    search: string;
  };
  items: HelarConnectUser[];
  summary: {
    activeContributors: number;
    totalAnswers: number;
    totalComments: number;
    totalQuestions: number;
  };
};

type HelarConnectResponse<T> = {
  success: true;
  data: T;
};

export async function fetchHelarConnectQuestions(filters: HelarConnectQuestionFilters) {
  const response = await authenticatedHttp.get<HelarConnectResponse<HelarConnectSnapshot>>("/api/v1/connect/questions", {
    params: {
      search: filters.search ?? "",
      sort: filters.sort ?? "interesting"
    }
  });

  return response.data.data;
}

export async function fetchHelarConnectQuestionsPublic(filters: HelarConnectQuestionFilters) {
  const response = await publicHttp.get<HelarConnectResponse<HelarConnectSnapshot>>("/api/v1/connect/questions", {
    params: {
      search: filters.search ?? "",
      sort: filters.sort ?? "interesting"
    }
  });

  return response.data.data;
}

export async function fetchHelarConnectUsers(search: string) {
  const response = await publicHttp.get<HelarConnectResponse<HelarConnectUsersSnapshot>>("/api/v1/connect/users", {
    params: {
      search
    }
  });

  return response.data.data;
}

export async function createHelarConnectQuestion(payload: { body: string; tags: string[]; title: string }) {
  const response = await authenticatedHttp.post<HelarConnectResponse<{ id: string }>>("/api/v1/connect/questions", payload);
  return response.data.data;
}

export async function toggleHelarConnectVote(questionId: string) {
  const response = await authenticatedHttp.post<
    HelarConnectResponse<{
      questionId: string;
      voteCount: number;
      viewerHasUpvoted: boolean;
    }>
  >(`/api/v1/connect/questions/${questionId}/votes`);

  return response.data.data;
}

export async function createHelarConnectComment(questionId: string, payload: { body: string }) {
  const response = await authenticatedHttp.post<HelarConnectResponse<HelarConnectComment>>(
    `/api/v1/connect/questions/${questionId}/comments`,
    payload
  );

  return response.data.data;
}

export async function createHelarConnectAnswer(questionId: string, payload: { body: string }) {
  const response = await authenticatedHttp.post<HelarConnectResponse<HelarConnectAnswer>>(
    `/api/v1/connect/questions/${questionId}/answers`,
    payload
  );

  return response.data.data;
}

export async function recordHelarConnectQuestionView(questionId: string) {
  const response = await publicHttp.post<
    HelarConnectResponse<{
      questionId: string;
      viewCount: number;
    }>
  >(`/api/v1/connect/questions/${questionId}/views`);

  return response.data.data;
}

export async function deleteHelarConnectQuestion(questionId: string) {
  const response = await authenticatedHttp.delete<HelarConnectResponse<{ id: string; success: true }>>(
    `/api/v1/connect/questions/${questionId}`
  );

  return response.data.data;
}

export async function deleteHelarConnectAnswer(answerId: string) {
  const response = await authenticatedHttp.delete<HelarConnectResponse<{ id: string; success: true }>>(
    `/api/v1/connect/answers/${answerId}`
  );

  return response.data.data;
}

export async function deleteHelarConnectComment(commentId: string) {
  const response = await authenticatedHttp.delete<HelarConnectResponse<{ id: string; success: true }>>(
    `/api/v1/connect/comments/${commentId}`
  );

  return response.data.data;
}
