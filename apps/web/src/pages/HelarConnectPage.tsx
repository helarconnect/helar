import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  Bookmark,
  CircleHelp,
  Flame,
  Home,
  MessageSquareMore,
  Search,
  Tag,
  Trophy,
  UserRound,
  X
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  createHelarConnectAnswer,
  createHelarConnectComment,
  createHelarConnectQuestion,
  deleteHelarConnectAnswer,
  deleteHelarConnectComment,
  deleteHelarConnectQuestion,
  fetchHelarConnectQuestions,
  recordHelarConnectQuestionView,
  toggleHelarConnectVote,
  type HelarConnectQuestion,
  type HelarConnectSort
} from "@/lib/connect-api";
import { queryKeys } from "@/lib/query-keys";
import { canModerateHelarConnect } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const leftNavigation: Array<{
  icon: typeof Home;
  label: string;
}> = [
  { icon: Home, label: "Home" },
  { icon: MessageSquareMore, label: "Questions" },
  { icon: Tag, label: "Tags" }
];

const sortTabs: Array<{ label: string; value: HelarConnectSort }> = [
  { label: "Interesting", value: "interesting" },
  { label: "Hot", value: "hot" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" }
];

const blogItems = [
  "The Helar Connect #100: Celebrating serious legal discussions",
  "AI tools: useful for study or just hype? Let's discuss"
];

const metaItems = [
  "Community asks sprint announcement",
  "The 2026 Developer Survey Results Are Live",
  "Updated comment flagging policy",
  "Temporary policy: AI-generated answers require disclosure"
];

const hotPosts = [
  "What is the future of Helar Connect?",
  "Should study support and open questions live together?",
  "Collectives: how are they working for you?",
  "New contributor experience improvements"
];

const watchedTags = ["legal-analysis", "cases", "study-system", "notes", "workflow"];

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatCompactCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function HelarConnectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useAuthStore((state) => state.session);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const clearSession = useAuthStore((state) => state.clearSession);
  const isFromDashboard = searchParams.get("from") === "dashboard";
  const backButtonLabel = isAuthenticated && isFromDashboard ? "Back to Dashboard" : "Back to Home";
  const backButtonTarget = isAuthenticated && isFromDashboard ? "/app/dashboard" : "/";
  const currentUserName = session?.user.fullName ?? "";
  const isModerator = canModerateHelarConnect(session?.user.roleCodes);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSort, setSelectedSort] = useState<HelarConnectSort>("interesting");
  const [isAskModalOpen, setIsAskModalOpen] = useState(false);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [commentComposerQuestionId, setCommentComposerQuestionId] = useState<string | null>(null);
  const [answerComposerQuestionId, setAnswerComposerQuestionId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [questionDraft, setQuestionDraft] = useState({
    body: "",
    tags: "",
    title: ""
  });
  const viewedQuestionIdsRef = useRef(new Set<string>());
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());

  const questionsQuery = useQuery({
    queryFn: () =>
      fetchHelarConnectQuestions({
        search: deferredSearchQuery,
        sort: selectedSort
      }),
    queryKey: queryKeys.helarConnectQuestions({
      search: deferredSearchQuery,
      sort: selectedSort
    })
  });

  async function invalidateConnectData() {
    await queryClient.invalidateQueries({ queryKey: ["helar-connect-questions"] });
  }

  const createQuestionMutation = useMutation({
    mutationFn: createHelarConnectQuestion,
    onSuccess: async () => {
      setQuestionDraft({ body: "", tags: "", title: "" });
      setIsAskModalOpen(false);
      await invalidateConnectData();
    }
  });

  const voteMutation = useMutation({
    mutationFn: toggleHelarConnectVote,
    onSuccess: async () => {
      await invalidateConnectData();
    }
  });

  const commentMutation = useMutation({
    mutationFn: ({ body, questionId }: { body: string; questionId: string }) => createHelarConnectComment(questionId, { body }),
    onSuccess: async (_data, variables) => {
      setCommentDrafts((current) => ({ ...current, [variables.questionId]: "" }));
      setExpandedQuestionId(variables.questionId);
      setCommentComposerQuestionId(variables.questionId);
      await invalidateConnectData();
    }
  });

  const answerMutation = useMutation({
    mutationFn: ({ body, questionId }: { body: string; questionId: string }) => createHelarConnectAnswer(questionId, { body }),
    onSuccess: async (_data, variables) => {
      setAnswerDrafts((current) => ({ ...current, [variables.questionId]: "" }));
      setExpandedQuestionId(variables.questionId);
      setAnswerComposerQuestionId(variables.questionId);
      await invalidateConnectData();
    }
  });

  const viewMutation = useMutation({
    mutationFn: recordHelarConnectQuestionView,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["helar-connect-questions"] });
    }
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: deleteHelarConnectQuestion,
    onSuccess: async () => {
      await invalidateConnectData();
    }
  });

  const deleteAnswerMutation = useMutation({
    mutationFn: deleteHelarConnectAnswer,
    onSuccess: async () => {
      await invalidateConnectData();
    }
  });

  const deleteCommentMutation = useMutation({
    mutationFn: deleteHelarConnectComment,
    onSuccess: async () => {
      await invalidateConnectData();
    }
  });

  useEffect(() => {
    if (!isAuthenticated || searchParams.get("intent") !== "ask-question") {
      return;
    }

    setIsAskModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("intent");
    setSearchParams(nextParams, { replace: true });
  }, [isAuthenticated, searchParams, setSearchParams]);

  const questionCountLabel = useMemo(() => {
    const totalQuestions = questionsQuery.data?.summary.totalQuestions ?? 0;
    return `${totalQuestions.toLocaleString()} questions`;
  }, [questionsQuery.data?.summary.totalQuestions]);

  function redirectToLogin(intent?: "ask-question") {
    const redirectParams = new URLSearchParams();

    if (isFromDashboard) {
      redirectParams.set("from", "dashboard");
    }

    const redirectTarget = redirectParams.toString() ? `/connect?${redirectParams.toString()}` : "/connect";
    const query = intent ? `?redirect=${encodeURIComponent(redirectTarget)}&intent=${intent}` : `?redirect=${encodeURIComponent(redirectTarget)}`;
    navigate(`/auth/sign-in${query}`);
  }

  function handleAskQuestionClick() {
    if (!isAuthenticated) {
      redirectToLogin("ask-question");
      return;
    }

    setIsAskModalOpen(true);
  }

  async function handleSubmitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = questionDraft.title.trim();
    const body = questionDraft.body.trim();

    if (!title || !body) {
      return;
    }

    await createQuestionMutation.mutateAsync({
      body,
      tags: questionDraft.tags
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      title
    });
  }

  async function handleToggleVote(questionId: string) {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    await voteMutation.mutateAsync(questionId);
  }

  async function handleToggleQuestionExpansion(questionId: string) {
    const willExpand = expandedQuestionId !== questionId;
    setExpandedQuestionId(willExpand ? questionId : null);

    if (willExpand && !viewedQuestionIdsRef.current.has(questionId)) {
      viewedQuestionIdsRef.current.add(questionId);
      await viewMutation.mutateAsync(questionId);
    }
  }

  async function ensureQuestionExpanded(questionId: string) {
    if (expandedQuestionId !== questionId) {
      await handleToggleQuestionExpansion(questionId);
    }
  }

  async function submitComment(questionId: string) {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    const body = commentDrafts[questionId]?.trim() ?? "";

    if (!body) {
      return;
    }

    await commentMutation.mutateAsync({ body, questionId });
  }

  async function handleSubmitComment(questionId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitComment(questionId);
  }

  async function submitAnswer(questionId: string) {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    const body = answerDrafts[questionId]?.trim() ?? "";

    if (!body) {
      return;
    }

    await answerMutation.mutateAsync({ body, questionId });
  }

  async function handleSubmitAnswer(questionId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitAnswer(questionId);
  }

  async function handleDeleteQuestion(questionId: string) {
    await deleteQuestionMutation.mutateAsync(questionId);
  }

  async function handleDeleteAnswer(answerId: string) {
    await deleteAnswerMutation.mutateAsync(answerId);
  }

  async function handleDeleteComment(commentId: string) {
    await deleteCommentMutation.mutateAsync(commentId);
  }

  function renderQuestionRow(question: HelarConnectQuestion) {
    const isExpanded = expandedQuestionId === question.id;
    const isVotePending = voteMutation.isPending && voteMutation.variables === question.id;
    const isCommentPending = commentMutation.isPending && commentMutation.variables?.questionId === question.id;
    const isAnswerPending = answerMutation.isPending && answerMutation.variables?.questionId === question.id;
    const commentDraft = commentDrafts[question.id] ?? "";
    const answerDraft = answerDrafts[question.id] ?? "";
    const commentButtonLabel = isAuthenticated ? "Comment" : "Login to comment";
    const answerButtonLabel = isAuthenticated ? "Answer" : "Login to answer";

    return (
      <article className="connect-question-row" key={question.id}>
        <div className="connect-question-stats">
          <div className="connect-stat">
            <strong>{formatCompactCount(question.voteCount)}</strong>
            <span>votes</span>
          </div>
          <div className="connect-stat is-answer">
            <strong>{formatCompactCount(question.answers.length)}</strong>
            <span>answers</span>
          </div>
          <div className="connect-stat">
            <strong>{formatCompactCount(question.viewCount)}</strong>
            <span>views</span>
          </div>
        </div>

        <div className="connect-question-content">
          <h2>
            <button
              onClick={() => void handleToggleQuestionExpansion(question.id)}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
              type="button"
            >
              {question.title}
            </button>
          </h2>
          <p>{isExpanded ? question.body : question.excerpt}</p>

          <div className="connect-tag-row">
            {question.tags.map((tag) => (
              <span className="connect-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>

          <div className="connect-engagement-row">
            <button
              className={question.viewerHasUpvoted ? "connect-engagement-button is-active" : "connect-engagement-button"}
              disabled={isVotePending}
              onClick={() => void handleToggleVote(question.id)}
              type="button"
            >
              {question.viewerHasUpvoted ? "Upvoted" : isAuthenticated ? "Upvote" : "Login to vote"}
            </button>
            <button
              className="connect-engagement-button"
              onClick={() => {
                void ensureQuestionExpanded(question.id);
                setAnswerComposerQuestionId((current) => (current === question.id ? null : question.id));
                setCommentComposerQuestionId(null);
              }}
              type="button"
            >
              {answerButtonLabel}
            </button>
            <button
              className="connect-engagement-button"
              onClick={() => {
                void ensureQuestionExpanded(question.id);
                setCommentComposerQuestionId((current) => (current === question.id ? null : question.id));
                setAnswerComposerQuestionId(null);
              }}
              type="button"
            >
              {commentButtonLabel}
            </button>
            <span className="connect-engagement-note">
              {question.comments.length} {question.comments.length === 1 ? "comment" : "comments"}
            </span>
            {isModerator ? (
              <button
                className="connect-engagement-button"
                disabled={deleteQuestionMutation.isPending}
                onClick={() => void handleDeleteQuestion(question.id)}
                type="button"
              >
                {deleteQuestionMutation.isPending && deleteQuestionMutation.variables === question.id ? "Removing..." : "Remove Question"}
              </button>
            ) : null}
          </div>

          {isExpanded ? (
            <>
              {question.answers.length ? (
                <div className="connect-comment-list">
                  {question.answers.map((answer) => (
                    <div className="connect-comment-card" key={answer.id}>
                      <strong>{answer.author.name}</strong>
                      <p>{answer.body}</p>
                      {isModerator ? (
                        <button
                          className="connect-engagement-button"
                          disabled={deleteAnswerMutation.isPending}
                          onClick={() => void handleDeleteAnswer(answer.id)}
                          type="button"
                        >
                          {deleteAnswerMutation.isPending && deleteAnswerMutation.variables === answer.id ? "Removing..." : "Remove Answer"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {answerComposerQuestionId === question.id ? (
                <form className="connect-comment-form" onSubmit={(event) => void handleSubmitAnswer(question.id, event)}>
                  <div className="connect-comment-grid">
                    <input readOnly type="text" value={isAuthenticated ? currentUserName : "Authentication required"} />
                    <textarea
                      onChange={(event) => setAnswerDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                      placeholder={isAuthenticated ? "Write a helpful answer..." : "Log in to answer this question."}
                      readOnly={!isAuthenticated}
                      rows={4}
                      value={answerDraft}
                    />
                  </div>
                  <div className="connect-comment-actions">
                    <button
                      className="connect-ask-button small"
                      disabled={isAnswerPending}
                      onClick={() => void submitAnswer(question.id)}
                      type="button"
                    >
                      {isAuthenticated ? (isAnswerPending ? "Posting..." : "Post answer") : "Login to answer"}
                    </button>
                  </div>
                </form>
              ) : null}

              {question.comments.length ? (
                <div className="connect-comment-list">
                  {question.comments.map((comment) => (
                    <div className="connect-comment-card" key={comment.id}>
                      <strong>{comment.author.name}</strong>
                      <p>{comment.body}</p>
                      {isModerator ? (
                        <button
                          className="connect-engagement-button"
                          disabled={deleteCommentMutation.isPending}
                          onClick={() => void handleDeleteComment(comment.id)}
                          type="button"
                        >
                          {deleteCommentMutation.isPending && deleteCommentMutation.variables === comment.id ? "Removing..." : "Remove Comment"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {commentComposerQuestionId === question.id ? (
                <form className="connect-comment-form" onSubmit={(event) => void handleSubmitComment(question.id, event)}>
                  <div className="connect-comment-grid">
                    <input readOnly type="text" value={isAuthenticated ? currentUserName : "Authentication required"} />
                    <textarea
                      onChange={(event) => setCommentDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                      placeholder={isAuthenticated ? "Share your comment..." : "Log in to comment on this discussion."}
                      readOnly={!isAuthenticated}
                      rows={3}
                      value={commentDraft}
                    />
                  </div>
                  <div className="connect-comment-actions">
                    <button
                      className="connect-ask-button small"
                      disabled={isCommentPending}
                      onClick={() => void submitComment(question.id)}
                      type="button"
                    >
                      {isAuthenticated ? (isCommentPending ? "Posting..." : "Post comment") : "Login to comment"}
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="connect-question-author">
          <p>updated {formatRelativeTime(question.updatedAt)}</p>
          <div className="connect-author-card">
            <span className="connect-avatar">
              <UserRound className="h-4 w-4" />
            </span>
            <div>
              <strong>{question.author.name}</strong>
              <span>asked {formatRelativeTime(question.createdAt)}</span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="connect-page">
      <div className="connect-top-strip" />

      <header className="connect-topbar">
        <div className="connect-topbar-inner">
          <div className="connect-brand-wrap">
            <Link className="connect-brand" to="/connect">
              <span className="connect-brand-icon">
                <Flame className="h-4 w-4" />
              </span>
              <span className="connect-brand-text">Helar Connect</span>
            </Link>

            <nav className="connect-top-nav">
              <a href="#questions">Products</a>
              <a href="#questions">Communities</a>
            </nav>
          </div>

          <div className="connect-search">
            <Search className="connect-search-icon h-4 w-4" />
            <input
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search questions, answers, tags..."
              type="text"
              value={searchQuery}
            />
          </div>

          <div className="connect-top-actions">
            <Bell className="h-4 w-4" />
            <Trophy className="h-4 w-4" />
            <CircleHelp className="h-4 w-4" />
            <MessageSquareMore className="h-4 w-4" />
          </div>

          <div className="connect-userbar">
            <Link className="connect-top-link-button" to={backButtonTarget}>
              {backButtonLabel}
            </Link>

            {isAuthenticated ? (
              <>
                <div className="connect-user-meta">
                  <span className="connect-avatar">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span>{session?.user.fullName}</span>
                  <span className="connect-rep-good">{isModerator ? "moderator" : "logged in"}</span>
                </div>
                <button className="connect-top-link-button" onClick={clearSession} type="button">
                  Logout
                </button>
              </>
            ) : (
              <Link
                className="connect-top-link-button"
                to={
                  isFromDashboard
                    ? "/auth/sign-in?redirect=%2Fconnect%3Ffrom%3Ddashboard"
                    : "/auth/sign-in?redirect=/connect"
                }
              >
                Login
              </Link>
            )}

            <button className="connect-ask-button" onClick={handleAskQuestionClick} type="button">
              Ask Question
            </button>
          </div>
        </div>
      </header>

      <div className="connect-shell">
        <aside className="connect-left-rail">
          <nav className="connect-side-nav">
            {leftNavigation.map((item) => {
              const Icon = item.icon;

              return (
                <a className={item.label === "Questions" ? "connect-side-link is-active" : "connect-side-link"} href="#questions" key={item.label}>
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="connect-side-section">
            <p className="connect-side-heading">Collectives</p>
            <a className="connect-side-link compact" href="#questions">
              Explore Collectives
            </a>
          </div>
        </aside>

        <main className="connect-main-column" id="questions">
          <div className="connect-main-header">
            <div>
              <h1>Top Questions</h1>
              <p className="connect-header-note">Browse publicly. Log in to ask, answer, comment, and vote.</p>
            </div>
            <button className="connect-ask-button" onClick={handleAskQuestionClick} type="button">
              Ask Question
            </button>
          </div>

          <div className="connect-filter-card">
            <div className="connect-filter-header">
              <p>{questionCountLabel}</p>
              <div className="connect-filter-tabs">
                <span className="connect-filter-tab is-count">{questionsQuery.data?.items.length ?? 0}</span>
                {sortTabs.map((tab) => (
                  <button
                    className={selectedSort === tab.value ? "connect-filter-tab is-active" : "connect-filter-tab"}
                    key={tab.value}
                    onClick={() => setSelectedSort(tab.value)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="connect-question-list">
              {questionsQuery.isLoading ? <div className="connect-question-row">Loading Helar Connect discussions...</div> : null}

              {questionsQuery.isError ? (
                <div className="connect-question-row">We could not load Helar Connect right now. Please try again.</div>
              ) : null}

              {!questionsQuery.isLoading && !questionsQuery.isError && questionsQuery.data?.items.length === 0 ? (
                <div className="connect-question-row">
                  No discussions match your current search. Try a different keyword or start a new question.
                </div>
              ) : null}

              {questionsQuery.data?.items.map((question) => renderQuestionRow(question))}
            </div>
          </div>
        </main>

        <aside className="connect-right-rail">
          <>
            <section className="connect-panel">
              <div className="connect-panel-header">Participation Rules</div>
              <div className="connect-panel-body">
                <div className="connect-panel-item">
                  <Bookmark className="h-4 w-4" />
                  <p>Anyone can browse Helar Connect without creating an account.</p>
                </div>
                <div className="connect-panel-item">
                  <Bookmark className="h-4 w-4" />
                  <p>Voting, commenting, and answering are available to logged-in Helar members.</p>
                </div>
                <div className="connect-panel-item">
                  <Bookmark className="h-4 w-4" />
                  <p>Starting a new question requires a logged-in Helar account.</p>
                </div>
              </div>
            </section>

            <section className="connect-panel">
              <div className="connect-panel-header">The Helar Connect Blog</div>
              <div className="connect-panel-body">
                {blogItems.map((item) => (
                  <div className="connect-panel-item" key={item}>
                    <Flame className="h-4 w-4" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="connect-panel">
              <div className="connect-panel-header">Featured on Meta</div>
              <div className="connect-panel-body">
                {metaItems.map((item) => (
                  <div className="connect-panel-item" key={item}>
                    <Bookmark className="h-4 w-4" />
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="connect-panel">
                <div className="connect-panel-header">Hot Meta Posts</div>
                <div className="connect-panel-body">
                  {hotPosts.map((item, index) => (
                    <div className="connect-hot-post" key={item}>
                      <span>{18 - index * 3}</span>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="connect-panel">
                <div className="connect-panel-header">Watched Tags</div>
                <div className="connect-panel-body">
                  {watchedTags.map((tag) => (
                    <div className="connect-watched-tag" key={tag}>
                      <span className="connect-tag">{tag}</span>
                      <Bell className="h-4 w-4" />
                    </div>
                  ))}
                </div>
            </section>
          </>
        </aside>
      </div>

      {isAskModalOpen ? (
        <div className="connect-modal-backdrop" role="presentation">
          <div aria-modal="true" className="connect-modal-card" role="dialog">
            <div className="connect-modal-header">
              <div>
                <h2>Ask a question</h2>
                <p>Start a new discussion for the Helar Connect community.</p>
              </div>
              <button className="connect-modal-close" onClick={() => setIsAskModalOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="connect-modal-form" onSubmit={(event) => void handleSubmitQuestion(event)}>
              <label>
                Question title
                <input
                  onChange={(event) => setQuestionDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. How do I approach conflicting authorities in one memo?"
                  type="text"
                  value={questionDraft.title}
                />
              </label>

              <label>
                Details
                <textarea
                  onChange={(event) => setQuestionDraft((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Share enough context so other members can give a useful answer."
                  rows={5}
                  value={questionDraft.body}
                />
              </label>

              <label>
                Tags
                <input
                  onChange={(event) => setQuestionDraft((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="legal-analysis, notes, workflow"
                  type="text"
                  value={questionDraft.tags}
                />
              </label>

              <div className="connect-modal-actions">
                <button className="connect-top-link-button" onClick={() => setIsAskModalOpen(false)} type="button">
                  Cancel
                </button>
                <button className="connect-ask-button" disabled={createQuestionMutation.isPending} type="submit">
                  {createQuestionMutation.isPending ? "Publishing..." : "Publish question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
