import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { fetchStudentBarFinalExamQuestions, fetchStudentBarFinalExamSubjects } from "@/lib/admin-api";
import { formatDateDMY } from "@/lib/date";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export function StudentBarFinalExamQuestionPage() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const params = useParams();
  const subjectId = params.subjectId ?? "";
  const questionId = params.questionId ?? "";
  // Gates the model answer behind an explicit "View answer" button click.
  // Question content is always visible; answer only appears once the user
  // intentionally opts in to reveal it.
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

  // Reset answer visibility whenever the user navigates to a different
  // question so every new question starts with the answer hidden.
  useEffect(() => {
    setIsAnswerVisible(false);
  }, [questionId]);

  const subjectsQuery = useQuery({
    queryKey: queryKeys.studentBarFinalExamSubjects(""),
    queryFn: () => fetchStudentBarFinalExamSubjects("")
  });

  const questionsQuery = useQuery({
    enabled: Boolean(subjectId),
    queryKey: queryKeys.studentBarFinalExamQuestions({ subjectId }),
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
  const contentAccess = questionsQuery.data?.contentAccess;
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
              Bar Final Exams NLS
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
                isDark ? "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
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
                isDark ? "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
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

        {contentAccess?.isPreview ? (
          <section className={cn("rounded-[28px] border px-6 py-5 mb-6", isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800")}>
            <p className="text-xs uppercase tracking-[0.2em]">Preview only</p>
            <h2 className="mt-3 text-lg font-semibold">Full Bar Final answer access is locked right now.</h2>
            <p className="mt-2 text-sm leading-7">{contentAccess.upgradeMessage} You can read up to {contentAccess.previewCharLimit} characters of each model answer until your subscription is active.</p>
            <Link className="mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-medium" to="/app/subscription">Subscribe to unlock</Link>
          </section>
        ) : null}

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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isDark ? "text-emerald-200/90" : "text-emerald-700")}>
                      Answer
                    </p>
                    {isAnswerVisible ? (
                      <button
                        className={cn(
                          "inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition",
                          isDark
                            ? "border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                        onClick={() => setIsAnswerVisible(false)}
                        type="button"
                      >
                        Hide answer
                      </button>
                    ) : (
                      <button
                        className={cn(
                          "inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition",
                          isDark
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                            : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                        )}
                        onClick={() => setIsAnswerVisible(true)}
                        type="button"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View answer
                      </button>
                    )}
                  </div>
                  {isAnswerVisible ? (
                    <>
                      {contentAccess?.isPreview ? (
                        <p className="mt-4 text-xs font-medium text-amber-600/90">Preview mode — only the first {contentAccess.previewCharLimit} characters of the model answer are shown.</p>
                      ) : null}
                      <div
                        // Rich-text answer rendering inherits the emerald-tinted
                        // card's background while using the shared rich-text
                        // typography system.
                        className={cn("mt-4 text-sm leading-8 rich-text-content", isDark ? "text-slate-100" : "text-slate-800")}
                        dangerouslySetInnerHTML={{ __html: currentQuestion.answer }}
                      />
                    </>
                  ) : (
                    <p className={cn("mt-4 text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
                      Read the question first, then click <strong>View answer</strong> to reveal the model solution.
                    </p>
                  )}
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
                  <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>Exam date</p>
                  <p className={cn("mt-2 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>
                    {currentQuestion?.examDate ? formatDateDMY(currentQuestion.examDate) : "Not available"}
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
