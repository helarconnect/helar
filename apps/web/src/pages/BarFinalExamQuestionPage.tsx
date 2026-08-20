import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { fetchStudentBarFinalExamQuestions, fetchStudentBarFinalExamSubjects } from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export function StudentBarFinalExamQuestionPage() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const params = useParams();
  const subjectId = params.subjectId ?? "";
  const questionId = params.questionId ?? "";

  const subjectsQuery = useQuery({
    queryKey: queryKeys.studentBarFinalExamSubjects(""),
    queryFn: () => fetchStudentBarFinalExamSubjects("")
  });

  const questionsQuery = useQuery({
    enabled: Boolean(subjectId),
    queryKey: queryKeys.studentBarFinalExamQuestions(subjectId),
    queryFn: () => fetchStudentBarFinalExamQuestions(subjectId)
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [questionId]);

  const subjects = subjectsQuery.data?.subjects ?? [];
  const activeSubject = subjects.find((subject) => subject.id === subjectId) ?? null;
  const questions = questionsQuery.data?.items ?? [];
  const currentIndex = questions.findIndex((item) => item.id === questionId);
  const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null;
  const previousQuestionId = currentIndex > 0 ? questions[currentIndex - 1]?.id ?? "" : "";
  const nextQuestionId = currentIndex >= 0 && currentIndex < questions.length - 1 ? questions[currentIndex + 1]?.id ?? "" : "";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                isDark ? "border-slate-800 bg-slate-950/20 text-slate-200 hover:bg-slate-950/40" : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
              )}
              onClick={() => navigate("/app/bar-final-exams-nls-mcq", { state: { subjectId } })}
              type="button"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              Back to questions
            </button>
            <h1 className={cn("text-xl font-semibold tracking-tight", isDark ? "text-white" : "text-slate-950")}>
              Bar Final Exams NLS-MCQ (Q & A)
            </h1>
            <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
              {activeSubject?.name ?? "Subject"} •{" "}
              {currentIndex >= 0 ? `Question ${currentIndex + 1} of ${questions.length}` : "Question"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                isDark ? "border-white/10 bg-white text-slate-950 hover:bg-slate-100" : "border-slate-200 bg-slate-950 text-white hover:bg-slate-900"
              )}
              disabled={!previousQuestionId}
              onClick={() => navigate(`/app/bar-final-exams-nls-mcq/${subjectId}/questions/${previousQuestionId}`)}
              type="button"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              Previous
            </button>
            <button
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                isDark ? "border-white/10 bg-white text-slate-950 hover:bg-slate-100" : "border-slate-200 bg-slate-950 text-white hover:bg-slate-900"
              )}
              disabled={!nextQuestionId}
              onClick={() => navigate(`/app/bar-final-exams-nls-mcq/${subjectId}/questions/${nextQuestionId}`)}
              type="button"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={cn("rounded-[28px] border p-5", isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white")}>
          {questionsQuery.isLoading ? (
            <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
              Loading question...
            </div>
          ) : !currentQuestion ? (
            <div className={cn("rounded-2xl border px-4 py-6 text-sm", isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600")}>
              This question could not be found.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <div className={cn("rounded-3xl border p-5", isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                    Question
                  </p>
                  <div
                    // Use our project-standard .rich-text-content class for
                    // professional styling (Libre Baskerville headings,
                    // blockquotes with accent bar, styled code blocks, etc.)
                    className={cn("mt-3 text-sm leading-8 rich-text-content", isDark ? "text-slate-200" : "text-slate-900")}
                    dangerouslySetInnerHTML={{ __html: currentQuestion.question }}
                  />
                </div>

                <div
                  className={cn(
                    "rounded-3xl border p-5",
                    isDark
                      ? "border-emerald-500/25 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.55)_0%,rgba(2,6,23,0.75)_100%)] text-slate-100"
                      : "border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_45%),linear-gradient(180deg,#ffffff_0%,#f0fdf4_100%)] text-slate-800"
                  )}
                >
                  <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-emerald-200/90" : "text-emerald-700")}>
                    Answer
                  </p>
                  <div
                    // Rich-text answer rendering inherits the emerald-tinted
                    // card's background while using the shared rich-text
                    // typography system.
                    className={cn("mt-3 text-sm leading-8 rich-text-content", isDark ? "text-slate-100" : "text-slate-800")}
                    dangerouslySetInnerHTML={{ __html: currentQuestion.answer }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className={cn("rounded-3xl border px-4 py-4", isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Subject</p>
                  <p className={cn("mt-2 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>
                    {activeSubject?.name ?? "Not available"}
                  </p>
                </div>
                <div className={cn("rounded-3xl border px-4 py-4", isDark ? "border-slate-800 bg-slate-950/30" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Progress</p>
                  <p className={cn("mt-2 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>
                    {currentIndex >= 0 ? `Question ${currentIndex + 1} of ${questions.length}` : "Not available"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
