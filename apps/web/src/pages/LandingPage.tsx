import { motion, useMotionValue, useSpring } from "framer-motion";
import {
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  Check,
  GraduationCap,
  Globe,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { PointerEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import uploadedHeroImage from "@/assets/helar-hero-upload.png";
import { ShareButton } from "@/components/common/ShareButton";
import { SocialLinks } from "@/components/layout/SocialLinks";
import { fetchLatestPublications, type LatestPublicationItem } from "@/lib/catalog-api";
import { fetchHelarConnectQuestionsPublic, type HelarConnectSnapshot } from "@/lib/connect-api";
import { formatDateDMY } from "@/lib/date";

type ImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

// Use section-specific AI imagery so the marketing site feels like a finished brand,
// not a wireframe with neutral placeholders.
const createAiImageUrl = (prompt: string, imageSize: ImageSize) =>
  `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${imageSize}`;

const aboutImage = createAiImageUrl(
  "female law student studying with law reports, summary notes, and printed case materials in a refined law library, premium academic environment, bookshelves, tablets, warm professional lighting, realistic editorial photography",
  "landscape_4_3"
);

const expertiseAreas = [
  {
    body: "Access well-organized law reports for faster case research, precedent tracking, and practical legal argument preparation.",
    icon: BookOpenText,
    title: "Law Reports"
  },
  {
    body: "Explore Helarpedia's concise legal encyclopedia entries for quick definitions, doctrines, and practical legal insights.",
    icon: Globe,
    title: "Helarpedia"
  },
  {
    body: "Review concise subject-based notes that simplify core legal principles for study, revision, and quick understanding.",
    icon: BriefcaseBusiness,
    title: "Law Subjects Summary Notes"
  },
  {
    body: "Study carefully selected faculty textbook cases and ratios that help learners connect doctrine with judicial reasoning.",
    icon: Building2,
    title: "Faculty Textbook Cases & Ratios"
  },
  {
    body: "Use focused NLS handbook subject summaries designed to support structured revision across major Bar course areas.",
    icon: ShieldCheck,
    title: "NLS Handbook Subjects Summary Notes"
  },
  {
    body: "Explore important NLS cases and ratios in a more accessible format for exam preparation and legal analysis practice.",
    icon: Sparkles,
    title: "NLS Cases and Ratios"
  },
  {
    body: "Prepare with past NLS Bar final exam materials that help learners practice under realistic assessment expectations.",
    icon: GraduationCap,
    title: "NLS (BAR) Final Exams"
  }
];

const revealContainer = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 }
};

const staggerChildren = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12
    }
  }
};

type LandingHighlightsCache = {
  connect: HelarConnectSnapshot;
  publications: LatestPublicationItem[];
  sort: "hot" | "interesting" | "week";
  timestamp: number;
};

let landingHighlightsCache: LandingHighlightsCache | null = null;

function useCountUp(params: { active: boolean; durationMs?: number; value: number }) {
  const durationMs = params.durationMs ?? 900;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!params.active) {
      return;
    }

    let frameId = 0;
    let fallbackTimeoutId = 0;
    const startedAt = performance.now();
    const target = params.value;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setDisplay(Math.round(target * progress));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    fallbackTimeoutId = window.setTimeout(() => setDisplay(target), durationMs + 80);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(fallbackTimeoutId);
    };
  }, [durationMs, params.active, params.value]);

  return display;
}

function useTiltCard(params: { maxDeg?: number }) {
  const maxDeg = params.maxDeg ?? 8;
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springConfig = { damping: 18, stiffness: 220, mass: 0.6 };
  const rotateXSpring = useSpring(rotateX, springConfig);
  const rotateYSpring = useSpring(rotateY, springConfig);

  function reset() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return {
    onPointerLeave: reset,
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const percentX = (offsetX / rect.width) * 2 - 1;
      const percentY = (offsetY / rect.height) * 2 - 1;

      rotateX.set(-percentY * maxDeg);
      rotateY.set(percentX * maxDeg);
    },
    style: {
      rotateX: rotateXSpring,
      rotateY: rotateYSpring,
      transformStyle: "preserve-3d" as const
    }
  };
}

export function LandingPage() {
  const heroResearchItems = useMemo(
    () => [
      "Law reports",
      "Law subjects summary notes",
      "Faculty textbook cases & ratios",
      "NLS handbook subjects summary notes",
      "NLS cases and ratios",
      "NLS (BAR) final exams"
    ],
    []
  );
  const heroTypewriterBlocks = useMemo(
    () => [
      {
        text: "Digital law library for serious students",
        tone: "label"
      },
      {
        text: "Built for serious legal study",
        tone: "eyebrow"
      },
      {
        text: "Legal Research Made Easy",
        tone: "title"
      },
      {
        text: "Law libraries emptied into your digital devices.",
        tone: "subtitle"
      },
      {
        text: "The entire law packaged just for you as:",
        tone: "lead"
      },
      ...heroResearchItems.map((item) => ({
        text: `• ${item}`,
        tone: "list"
      }))
    ],
    [heroResearchItems]
  );

  const [typedLineIndex, setTypedLineIndex] = useState(0);
  const [typedCharacterCount, setTypedCharacterCount] = useState(0);
  const [connectSnapshot, setConnectSnapshot] = useState<HelarConnectSnapshot | null>(null);
  const [connectStatus, setConnectStatus] = useState<"loading" | "ready" | "error">("loading");
  const [connectSort, setConnectSort] = useState<"hot" | "interesting" | "week">("hot");
  const [connectHighlightsActive, setConnectHighlightsActive] = useState(true);
  const [latestPublications, setLatestPublications] = useState<LatestPublicationItem[]>([]);
  const [latestPublicationsStatus, setLatestPublicationsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [latestPublicationsActive, setLatestPublicationsActive] = useState(true);
  const [coreCountersActive, setCoreCountersActive] = useState(false);
  const [highlightsRefreshKey, setHighlightsRefreshKey] = useState(0);

  const connectTilt = useTiltCard({ maxDeg: 7 });
  const publicationsTilt = useTiltCard({ maxDeg: 7 });

  const totalConnectQuestions = useCountUp({
    active: connectHighlightsActive && !!connectSnapshot,
    value: connectSnapshot?.summary.totalQuestions ?? 0
  });
  const latestPublicationsCount = useCountUp({
    active: latestPublicationsActive && latestPublications.length > 0,
    value: latestPublications.length
  });
  const coreMaterialCount = useCountUp({ active: coreCountersActive, value: 6 });
  const coreLibraryCount = useCountUp({ active: coreCountersActive, value: 1 });
  const connectQuestionCountLabel = connectSnapshot ? totalConnectQuestions.toLocaleString() : "—";
  const latestPublicationsCountLabel = latestPublications.length > 0 ? latestPublicationsCount.toLocaleString() : "—";

  const getPublicationHref = (publication: LatestPublicationItem) => {
    const slug = publication.category?.slug ?? "";

    if (slug === "law-reports") {
      return `/app/library/law-reports/${publication.id}`;
    }

    if (slug === "helarpedia") {
      return `/app/library/helarpedia/${publication.id}`;
    }

    return "/app/dashboard";
  };

  useEffect(() => {
    if (typedLineIndex >= heroTypewriterBlocks.length) {
      return;
    }

    const currentLine = heroTypewriterBlocks[typedLineIndex].text;
    const isCurrentLineComplete = typedCharacterCount >= currentLine.length;
    const delay = isCurrentLineComplete ? 110 : typedLineIndex <= 2 ? 14 : 7;

    const timeout = window.setTimeout(() => {
      if (!isCurrentLineComplete) {
        setTypedCharacterCount((current) => current + 1);
        return;
      }

      if (typedLineIndex < heroTypewriterBlocks.length - 1) {
        setTypedLineIndex((current) => current + 1);
        setTypedCharacterCount(0);
      } else {
        setTypedLineIndex(heroTypewriterBlocks.length);
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [heroTypewriterBlocks, typedCharacterCount, typedLineIndex]);

  useEffect(() => {
    let cancelled = false;

    async function loadHomepageHighlights() {
      const cache = landingHighlightsCache;
      const canUseCache = cache && cache.sort === connectSort && Date.now() - cache.timestamp < 60_000;

      if (canUseCache) {
        setConnectSnapshot(cache.connect);
        setConnectStatus("ready");
        setLatestPublications(cache.publications);
        setLatestPublicationsStatus("ready");
      } else {
        setConnectSnapshot(null);
        setLatestPublications([]);
        setConnectStatus("loading");
        setLatestPublicationsStatus("loading");
      }

      try {
        const [nextConnectSnapshot, nextPublications] = await Promise.all([
          fetchHelarConnectQuestionsPublic({ sort: connectSort }),
          fetchLatestPublications(6)
        ]);

        if (cancelled) {
          return;
        }

        setConnectSnapshot(nextConnectSnapshot);
        setConnectStatus("ready");
        setLatestPublications(nextPublications);
        setLatestPublicationsStatus("ready");

        landingHighlightsCache = {
          connect: nextConnectSnapshot,
          publications: nextPublications,
          sort: connectSort,
          timestamp: Date.now()
        };
      } catch {
        if (cancelled) {
          return;
        }

        setConnectStatus("error");
        setLatestPublicationsStatus("error");
        setConnectSnapshot(null);
        setLatestPublications([]);
      }
    }

    void loadHomepageHighlights();

    return () => {
      cancelled = true;
    };
  }, [connectSort, highlightsRefreshKey]);

  return (
    <div className="futuristic-page pb-24">
      <section className="relative overflow-hidden bg-[#05070d]">
        <img
          alt="Helar legal library across desktop, tablet, and mobile devices"
          className="absolute inset-0 h-full w-full object-cover object-center"
          src={uploadedHeroImage}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,13,0.94)_0%,rgba(5,7,13,0.88)_36%,rgba(5,7,13,0.72)_62%,rgba(5,7,13,0.78)_100%)]" />
        <div className="futuristic-grid absolute inset-0 opacity-25" />
        <div className="futuristic-orb left-[-5rem] top-20 h-44 w-44 bg-[rgba(44,109,255,0.24)]" />
        <div className="futuristic-orb right-12 top-24 h-52 w-52 bg-[rgba(254,83,61,0.18)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.1)_30%,rgba(0,0,0,0.34)_100%)]" />
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="section-shell relative z-10 pb-16 pt-28 lg:pb-24 lg:pt-36"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
        >
          <div className="max-w-[58rem] space-y-8 lg:space-y-10">
              <div className="space-y-4 lg:space-y-5">
                {heroTypewriterBlocks.map((block, index) => {
                  const visibleText =
                    index < typedLineIndex
                      ? block.text
                      : index === typedLineIndex
                        ? block.text.slice(0, typedCharacterCount)
                        : "";

                  if (!visibleText && index > typedLineIndex) {
                    return null;
                  }

                  const showCaret = index === typedLineIndex && typedLineIndex < heroTypewriterBlocks.length;

                  if (block.tone === "label") {
                    return (
                      <div key={block.text}>
                        <span className="futuristic-label">
                          {visibleText}
                          {showCaret ? <span className="typewriter-caret" /> : null}
                        </span>
                      </div>
                    );
                  }

                  if (block.tone === "eyebrow") {
                    return (
                      <div className="flex items-center gap-4" key={block.text}>
                        <span className="h-px w-10 bg-white/70" />
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/92 sm:text-xs">
                          {visibleText}
                          {showCaret ? <span className="typewriter-caret" /> : null}
                        </p>
                      </div>
                    );
                  }

                  if (block.tone === "title") {
                    return (
                      <p
                        className="max-w-[11ch] font-heading text-[3rem] leading-[0.96] text-white sm:text-[3.4rem] md:text-[3.3rem] lg:text-[4.9rem]"
                        key={block.text}
                      >
                        {visibleText}
                        {showCaret ? <span className="typewriter-caret" /> : null}
                      </p>
                    );
                  }

                  if (block.tone === "subtitle") {
                    return (
                      <p className="max-w-xl text-lg leading-8 text-white lg:text-[1.28rem]" key={block.text}>
                        {visibleText}
                        {showCaret ? <span className="typewriter-caret" /> : null}
                      </p>
                    );
                  }

                  if (block.tone === "lead") {
                    return (
                      <p
                        className="pt-2 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-accent)]"
                        key={block.text}
                      >
                        {visibleText}
                        {showCaret ? <span className="typewriter-caret" /> : null}
                      </p>
                    );
                  }

                  return (
                    <p className="max-w-[62rem] text-sm leading-8 text-white lg:text-[1rem]" key={block.text}>
                      {visibleText}
                      {showCaret ? <span className="typewriter-caret" /> : null}
                    </p>
                  );
                })}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row md:flex-col lg:flex-row">
                <Link
                  className="inline-flex items-center justify-center gap-2 bg-[color:var(--color-accent-strong)] px-8 py-4 font-heading text-base text-white transition hover:brightness-105 sm:justify-start"
                  to="/auth/sign-up"
                >
                  Get Started
                </Link>
                <Link
                  className="inline-flex items-center justify-center gap-2 border border-white/18 bg-white/6 px-8 py-4 font-heading text-base text-white backdrop-blur-sm transition hover:bg-white/10 sm:justify-start"
                  to="/app/dashboard"
                >
                  Explore Library
                </Link>
              </div>
          </div>
        </motion.div>
      </section>

      <section className="section-shell relative z-20 -mt-10 lg:-mt-16">
        <motion.div
          animate={{ x: [0, 18, 0], y: [0, -14, 0] }}
          className="futuristic-orb left-[-7rem] top-[-5rem] h-56 w-56 bg-[rgba(44,109,255,0.24)]"
          transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
        />
        <motion.div
          animate={{ x: [0, -14, 0], y: [0, 18, 0] }}
          className="futuristic-orb right-[-5rem] top-12 h-64 w-64 bg-[rgba(254,83,61,0.18)]"
          transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }}
        />
        <motion.div
          className="futuristic-panel-dark grid gap-12 p-7 lg:grid-cols-[1.05fr_0.95fr] lg:p-12"
          initial="hidden"
          transition={{ duration: 0.7, ease: "easeOut" }}
          variants={revealContainer}
          viewport={{ amount: 0.25, once: true }}
          whileInView="visible"
        >
          <div className="space-y-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65">
                  Welcome to Helar
                </p>
                <h2 className="font-heading text-[2.15rem] leading-[1.15] text-white lg:text-[2.7rem]">
                  Research, revise, and prepare with one organized library.
                </h2>
                <p className="text-[15px] leading-7 text-white/75">
                  Get the core materials, Helar Connect community, and the latest publications in one place—designed for serious study without the clutter.
                </p>
              </div>

              <SocialLinks tone="dark" />
            </div>

            <motion.div className="grid gap-4 sm:grid-cols-3" initial="hidden" variants={staggerChildren} whileInView="visible" viewport={{ amount: 0.3, once: true }}>
              {[
                {
                  body: "Find law reports, notes, cases, and Bar materials with clear categories and fast navigation.",
                  icon: BookOpenText,
                  title: "Curated Library"
                },
                {
                  body: "Keep your reading focused with clean layouts, calm spacing, and study-first organization.",
                  icon: Sparkles,
                  title: "Study-First Design"
                },
                {
                  body: "Ask questions, share insights, and learn faster with Helar Connect community support.",
                  icon: BriefcaseBusiness,
                  title: "Community Help"
                }
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <motion.article
                    className="futuristic-card-dark rounded-[1.55rem] p-6"
                    key={item.title}
                    transition={{ duration: 0.25 }}
                    variants={revealContainer}
                    whileHover={{ y: -6 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="futuristic-icon-badge">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3 className="font-heading text-[1.25rem] leading-[1.3] text-white">{item.title}</h3>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-white/72">{item.body}</p>
                  </motion.article>
                );
              })}
            </motion.div>
          </div>

          <div className="grid gap-5">
            <motion.article
              className="futuristic-panel-dark p-7 lg:p-8"
              onPointerLeave={connectTilt.onPointerLeave}
              onPointerMove={connectTilt.onPointerMove}
              onViewportEnter={() => setConnectHighlightsActive(true)}
              style={connectTilt.style}
              transition={{ duration: 0.25 }}
              viewport={{ amount: 0.3, once: true }}
              whileHover={{ y: -6 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Helar Connect</p>
                  <h3 className="mt-3 font-heading text-[1.7rem] leading-[1.2] text-white">Ask, discuss, and learn faster.</h3>
                </div>
                <Link
                  className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/6 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                  to="/connect"
                >
                  Visit Helar Connect
                </Link>
              </div>

              <p className="mt-4 text-[15px] leading-7 text-white/78">
                Connect with a growing legal learning community—post questions, get answers, and stay engaged while studying.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {[
                    { label: "Hot", value: "hot" as const },
                    { label: "Interesting", value: "interesting" as const },
                    { label: "This week", value: "week" as const }
                  ].map((item) => (
                    <button
                      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                        connectSort === item.value ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/5 text-white/72 hover:bg-white/10"
                      }`}
                      key={item.value}
                      onClick={() => setConnectSort(item.value)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="rounded-full border border-white/12 bg-white/5 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                    Questions: <span className="text-white">{connectQuestionCountLabel}</span>
                  </p>
                </div>
              </div>

              {connectStatus === "loading" ? (
                <p className="mt-6 text-sm text-white/65">Loading Helar Connect highlights...</p>
              ) : connectStatus === "error" ? (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/65">Unable to load Helar Connect highlights right now.</p>
                  <button
                    className="rounded-full border border-white/14 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
                    onClick={() => setHighlightsRefreshKey((current) => current + 1)}
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:auto]">
                    {(connectSnapshot?.items ?? []).slice(0, 3).map((question) => {
                      const href = `/connect?sort=${connectSort}&question=${encodeURIComponent(question.id)}`;
                      const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${href}` : "";

                      return (
                        <div
                          className="min-w-[18rem] snap-start rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:bg-white/10"
                          key={question.id}
                        >
                          <Link className="block" to={href}>
                            <p className="font-semibold text-white">{question.title}</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{question.excerpt}</p>
                          </Link>
                          <div className="mt-4 flex items-center justify-end">
                            <ShareButton
                              buttonLabel="Share"
                              size="sm"
                              text={question.excerpt}
                              title={question.title}
                              url={shareUrl}
                              variant="ghost"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.article>

            <motion.article
              className="futuristic-panel-dark p-7 lg:p-8"
              onPointerLeave={publicationsTilt.onPointerLeave}
              onPointerMove={publicationsTilt.onPointerMove}
              onViewportEnter={() => setLatestPublicationsActive(true)}
              style={publicationsTilt.style}
              transition={{ duration: 0.25 }}
              viewport={{ amount: 0.3, once: true }}
              whileHover={{ y: -6 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Latest publications</p>
                  <h3 className="mt-3 font-heading text-[1.7rem] leading-[1.2] text-white">
                    Fresh additions to the library.
                  </h3>
                </div>
                <Link
                  className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/6 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                  to="/app/dashboard"
                >
                  Explore
                </Link>
              </div>

              <div className="mt-6 rounded-full border border-white/12 bg-white/5 px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                  Showing: <span className="text-white">{latestPublicationsCountLabel}</span> latest items
                </p>
              </div>

              {latestPublicationsStatus === "loading" ? (
                <p className="mt-6 text-sm text-white/65">Loading latest publications...</p>
              ) : latestPublicationsStatus === "error" ? (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/65">Unable to load latest publications right now.</p>
                  <button
                    className="rounded-full border border-white/14 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
                    onClick={() => setHighlightsRefreshKey((current) => current + 1)}
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              ) : latestPublications.length === 0 ? (
                <p className="mt-6 text-sm text-white/65">No publications available yet.</p>
              ) : (
                <div className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:auto]">
                  {latestPublications.slice(0, 6).map((publication) => {
                    const label =
                      publication.category?.slug === "law-reports"
                        ? "Law report"
                        : publication.category?.slug === "helarpedia"
                          ? "Helarpedia"
                          : publication.category?.name ?? "Publication";
                    const dateLabel = formatDateDMY(publication.reportDate ?? publication.createdAt, "Not dated");
                    const href = getPublicationHref(publication);
                    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${href}` : "";

                    return (
                      <div
                        className="min-w-[18rem] snap-start rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                        key={publication.id}
                      >
                        <Link className="block" to={href}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">{label}</p>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">{dateLabel}</p>
                          </div>
                          <p className="mt-3 font-semibold text-white">{publication.title}</p>
                          {publication.reportNumber ? (
                            <p className="mt-2 text-sm text-white/70">Report number: {publication.reportNumber}</p>
                          ) : null}
                        </Link>
                        <div className="mt-4 flex items-center justify-end">
                          <ShareButton buttonLabel="Share" size="sm" title={publication.title} url={shareUrl} variant="ghost" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.article>
          </div>
        </motion.div>
      </section>

      <motion.section
        className="section-shell space-y-10 pt-28 lg:pt-32"
        onViewportEnter={() => setCoreCountersActive(true)}
        viewport={{ amount: 0.25, once: true }}
      >
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="futuristic-panel-dark p-8 lg:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65">Core Library</p>
            <h2 className="mt-4 font-heading text-[2.2rem] leading-[1.2] text-white lg:text-[3rem]">
              Everything you need for serious legal study.
            </h2>
            <p className="mt-5 text-[1rem] leading-8 text-white/80">
              Helar brings research, revision, and Bar preparation into one clear library—with fewer distractions and stronger structure.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-105"
                to="/auth/sign-up"
              >
                Get Started
              </Link>
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/16 bg-white/6 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                to="/pricing"
              >
                View Pricing
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { id: "core-materials", label: coreMaterialCount, value: "essential study materials" },
              { id: "core-library", label: coreLibraryCount, value: "organized digital library" },
              { id: "core-nls", label: "NLS", value: "revision and Bar support" }
            ].map((item) => (
              <motion.div
                className="futuristic-card-dark rounded-[1.6rem] p-6 text-center"
                key={item.id}
                transition={{ duration: 0.25 }}
                whileHover={{ y: -6 }}
              >
                <p className="font-heading text-[2.5rem] leading-none text-[color:var(--color-accent-strong)]">{item.label}</p>
                <p className="mt-3 text-sm uppercase tracking-[0.14em] text-white/72">{item.value}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {expertiseAreas.map((item, index) => {
            const Icon = item.icon;
            const isSoloLastCard = expertiseAreas.length % 3 === 1 && index === expertiseAreas.length - 1;

            return (
              <motion.article
                className={`futuristic-card-dark rounded-[1.6rem] p-7${isSoloLastCard ? " xl:col-span-3 xl:max-w-[30rem] xl:justify-self-center" : ""}`}
                key={item.title}
                transition={{ duration: 0.25 }}
                whileHover={{ y: -8 }}
              >
                <div className="futuristic-icon-badge">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="mt-5 font-heading text-[1.65rem] leading-[1.25] text-white">{item.title}</h3>
                <p className="mt-4 text-[15px] leading-7 text-white/72">{item.body}</p>
              </motion.article>
            );
          })}
        </div>
      </motion.section>

      <section className="section-shell pt-28 lg:pt-32">
        <div className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <motion.div className="futuristic-panel-dark overflow-hidden p-0" transition={{ duration: 0.25 }} whileHover={{ y: -6 }}>
            <img
              alt="Helar legal learning overview"
              className="h-[360px] w-full object-cover lg:h-[460px]"
              loading="lazy"
              src={aboutImage}
            />
          </motion.div>

          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65">
              Why Helar Works
            </p>
            <h2 className="font-heading text-[2.35rem] leading-[1.18] text-white lg:text-[3rem]">
              Clear structure that helps students move faster.
            </h2>
            <p className="max-w-2xl text-[15px] leading-7 text-white/75">
              The library is designed around what law students actually look for day-to-day, so you spend less time searching and more time learning.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "Read law reports without wasting time searching across multiple sources.",
                "Use subject summary notes to simplify wider course topics before deeper study.",
                "Study faculty textbook cases and ratios with better structure and recall.",
                "Prepare for NLS and BAR exams with focused, exam-relevant materials."
              ].map((item) => (
                <motion.div className="futuristic-card-dark rounded-[1.4rem] p-5" key={item} transition={{ duration: 0.25 }} whileHover={{ y: -6 }}>
                  <div className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/5">
                      <Check className="h-4 w-4 text-[color:var(--color-accent)]" />
                    </span>
                    <p className="text-sm leading-7 text-white/72">{item}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
