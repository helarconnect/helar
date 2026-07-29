import { authenticatedHttp } from "@/lib/http";
import type { CbtStatus, QuestionType } from "./admin-api";

export type { CbtStatus, DifficultyLevel, QuestionType } from "./admin-api";

export type StudentCbtAvailabilityStatus = "active" | "completed" | "upcoming";

export type StudentCbtListItem = {
  id: string;
  title: string;
  description: string;
  instructions: string;
  subject: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
  durationSeconds: number;
  totalQuestions: number;
  passPercentage: number;
  maxAttempts: number;
  startsAt: string | null;
  endsAt: string | null;
  status: CbtStatus;
  availabilityStatus: StudentCbtAvailabilityStatus;
  isEnabled: boolean;
  attemptsRemaining: number;
};

export type StudentCbtListSnapshot = {
  active: StudentCbtListItem[];
  completed: StudentCbtListItem[];
  upcoming: StudentCbtListItem[];
};

export type StudentCbtDetail = StudentCbtListItem;

export type StudentAttemptAnswer = {
  answerText: string;
  markedForReview: boolean;
  selectedOptionIds: string[];
};

export type CbtAttempt = {
  id: string;
  attemptNumber: number;
  cbtId: string;
  startedAt: string;
  submittedAt: string | null;
  cbt: {
    id: string;
    title: string;
    durationSeconds: number;
    questions: Array<{
      id: string;
      prompt: string;
      type: QuestionType;
      points: number;
      displayOrder: number;
      imageUrl: string | null;
      attachmentUrls: string[];
      options: Array<{
        id: string;
        label: string;
        text: string;
      }>;
    }>;
  };
  answers: Record<string, StudentAttemptAnswer>;
  result: {
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    totalPoints: number;
    earnedPoints: number;
    percentageScore: number;
    passed: boolean;
  } | null;
};

export type SubmitAttemptResponse = {
  result: {
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    totalPoints: number;
    earnedPoints: number;
    percentageScore: number;
    passed: boolean;
    needsManualGrading: boolean;
  };
};

export type StudentCbtResultsSnapshot = {
  results: Array<{
    id: string;
    attemptNumber: number;
    cbtId: string;
    cbtTitle: string;
    submittedAt: string;
    result: {
      correctCount: number;
      passed: boolean;
      percentageScore: number;
      totalQuestions: number;
    } | null;
  }>;
};

export type CbtAttemptResult = {
  cbt: {
    id: string;
    title: string;
    showCorrectAnswersOnCompletion: boolean;
    showExplanationsOnCompletion: boolean;
    showScoreOnCompletion: boolean;
  };
  result: {
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    totalPoints: number;
    earnedPoints: number;
    percentageScore: number;
    passed: boolean;
    needsManualGrading: boolean;
  } | null;
  questions: Array<{
    id: string;
    prompt: string;
    type: QuestionType;
    points: number;
    explanation: string;
    reviewStatus: "correct" | "incorrect" | "unanswered" | "pending_review";
    subject: { id: string; name: string } | null;
    topic: { id: string; name: string } | null;
    acceptedAnswers: string[];
    options: Array<{
      id: string;
      label: string;
      text: string;
      isCorrect?: boolean;
    }>;
    studentAnswer: StudentAttemptAnswer | null;
  }>;
};

export async function fetchStudentCbtList() {
  const response = await authenticatedHttp.get<{ success: true; data: StudentCbtListSnapshot }>("/api/v1/student/cbt");
  return response.data.data;
}

export async function fetchStudentCbtDetail(cbtId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: StudentCbtDetail }>(`/api/v1/student/cbt/${cbtId}`);
  return response.data.data;
}

export async function startCbtAttempt(cbtId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; attemptNumber: number; cbtId: string; startedAt: string } }>(
    `/api/v1/student/cbt/${cbtId}/start`
  );
  return response.data.data;
}

export async function fetchCbtAttempt(attemptId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: CbtAttempt }>(`/api/v1/student/cbt/attempts/${attemptId}`);
  return response.data.data;
}

export async function saveCbtAnswer(
  attemptId: string,
  payload: {
    answerText?: string;
    markedForReview?: boolean;
    questionId: string;
    selectedOptionIds?: string[];
  }
) {
  const response = await authenticatedHttp.post<{ success: true; data: StudentAttemptAnswer }>(
    `/api/v1/student/cbt/attempts/${attemptId}/answers`,
    payload
  );
  return response.data.data;
}

export async function submitCbtAttempt(attemptId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: SubmitAttemptResponse }>(
    `/api/v1/student/cbt/attempts/${attemptId}/submit`
  );
  return response.data.data;
}

export async function fetchStudentCbtResults() {
  const response = await authenticatedHttp.get<{ success: true; data: StudentCbtResultsSnapshot }>("/api/v1/student/cbt-results");
  return response.data.data;
}

export async function fetchCbtAttemptResult(attemptId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: CbtAttemptResult }>(
    `/api/v1/student/cbt/attempts/${attemptId}/result`
  );
  return response.data.data;
}
