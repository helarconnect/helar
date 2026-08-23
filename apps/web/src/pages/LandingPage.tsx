import { motion } from "framer-motion";
import {
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  GraduationCap,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import uploadedHeroImage from "@/assets/helar-hero-upload.png";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { trustSignals } from "@/lib/mock-api";

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

const advisoryImage = createAiImageUrl(
  "law student reviewing digital law reports, subject notes, and bar exam materials on laptop and tablet in a premium library setting, warm academic lighting, realistic photography, high-end website section image",
  "landscape_16_9"
);

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

const collectionHighlights = [
  {
    image: createAiImageUrl(
      "premium editorial photo of legal study materials including law reports and casebooks on a polished desk, realistic website feature image",
      "portrait_4_3"
    ),
    body: "Built for fast lookup, comparison, and dependable case reference during study or legal writing.",
    title: "Research Collection",
    subtitle: "Law Reports"
  },
  {
    image: createAiImageUrl(
      "premium editorial photo of law subject summary notes and study outlines on tablet and notebook, realistic website feature image",
      "portrait_4_3"
    ),
    body: "Clear, compact learning materials that help students revise broad course topics with less friction.",
    title: "Revision Collection",
    subtitle: "Subject Summary Notes"
  },
  {
    image: createAiImageUrl(
      "premium editorial photo of bar exam practice materials, handbook notes, and case ratio sheets, realistic website feature image",
      "portrait_4_3"
    ),
    body: "Focused NLS materials that support handbook revision, case analysis, and realistic Bar preparation.",
    title: "Bar Prep Collection",
    subtitle: "NLS Resources"
  }
];

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

      <section className="section-shell relative z-20 -mt-8 lg:-mt-10">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              body: "Find law reports, summary notes, textbook cases, and NLS materials without jumping between scattered folders.",
              title: "Everything In One Place"
            },
            {
              body: "The layout is built to help students understand what Helar offers within a few seconds of landing on the page.",
              title: "Clear At First Glance"
            },
            {
              body: "The library supports everyday reading and serious exam preparation with materials that feel curated, not generic.",
              title: "Built For Real Study"
            }
          ].map((item) => (
            <article className="futuristic-panel p-6 lg:p-7" key={item.title}>
              <h3 className="font-heading text-[1.55rem] leading-[1.3] text-[color:var(--color-text)]">{item.title}</h3>
              <p className="body-copy mt-4">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell space-y-10 pt-24">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="futuristic-panel-dark p-8 lg:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65">Core Library</p>
            <h2 className="mt-4 font-heading text-[2.2rem] leading-[1.2] text-white lg:text-[3rem]">
              The Complete Legal Study Stack
            </h2>
            <p className="mt-5 text-[1rem] leading-8 text-white/80">
              These are the six materials the homepage is now built around, presented in a cleaner and more professional structure.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "6", value: "essential study materials" },
              { label: "1", value: "organized digital library" },
              { label: "NLS", value: "revision and Bar support" }
            ].map((item) => (
              <div className="futuristic-panel p-6 text-center" key={item.label}>
                <p className="font-heading text-[2.5rem] leading-none text-[color:var(--color-accent-strong)]">{item.label}</p>
                <p className="mt-3 text-sm uppercase tracking-[0.14em] text-[color:var(--color-subtle)]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {expertiseAreas.map((item) => {
            const Icon = item.icon;

            return (
              <article className="futuristic-card p-6 lg:p-7" key={item.title}>
                <div className="futuristic-icon-badge">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="mt-5 font-heading text-[1.65rem] leading-[1.35] text-[color:var(--color-text)]">{item.title}</h3>
                <p className="body-copy mt-4">{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section-shell pt-24">
        <div className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="futuristic-panel overflow-hidden p-0">
            <img
              alt="Helar legal learning overview"
              className="h-[360px] w-full object-cover lg:h-[460px]"
              loading="lazy"
              src={aboutImage}
            />
          </div>

          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-strong)]">
              Why Helar Works
            </p>
            <h2 className="font-heading text-[2.35rem] leading-[1.25] text-[color:var(--color-text)] lg:text-[3rem]">
              A cleaner path from legal research to revision and exam readiness.
            </h2>
            <p className="body-copy max-w-2xl">
              Helar is designed around the resources students actually search for most. That makes the homepage easier to understand and the product easier to trust.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "Read law reports without wasting time searching across multiple sources.",
                "Use subject summary notes to simplify wider course topics before deeper study.",
                "Study faculty textbook cases and ratios with better structure and recall.",
                "Prepare for NLS and BAR exams with focused, exam-relevant materials."
              ].map((item) => (
                <div className="futuristic-panel p-4" key={item}>
                  <div className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--color-accent-strong)]" />
                    <p className="body-copy">{item}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell space-y-10 pt-24">
        <SectionHeading
          body="These focused collections show the product in a more polished way without overcrowding the page."
          eyebrow="Focused Collections"
          title="Built Around How Students Actually Study"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {collectionHighlights.map((item) => (
            <article className="futuristic-card overflow-hidden p-0" key={item.title}>
              <img
                alt={`${item.title} visual`}
                className="h-72 w-full object-cover"
                loading="lazy"
                src={item.image}
              />
              <div className="p-8">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-muted)]">{item.subtitle}</p>
                <h3 className="mt-3 font-heading text-[1.5rem] text-[color:var(--color-text)]">{item.title}</h3>
                <p className="body-copy mt-4">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell pt-24">
        <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="futuristic-panel-dark px-8 py-10 lg:px-10 lg:py-12">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65">Study Workflow</p>
            <h2 className="mt-4 font-heading text-[2.2rem] leading-[1.28] text-white lg:text-[2.8rem]">
              The homepage now tells one simple story from the first screen onward.
            </h2>
            <p className="mt-5 text-[1rem] leading-8 text-white/78">
              See the six resources immediately, understand the value quickly, then move into the sections that explain how the library supports research, revision, and exam preparation.
            </p>

            <ul className="mt-8 space-y-4">
              {[
                "Visible six-item resource list directly inside the hero",
                "Cleaner section order with less repeated messaging",
                "Stronger card hierarchy and calmer spacing",
                "A more premium first impression without visual clutter"
              ].map((item) => (
                <li className="rounded-2xl border border-white/12 bg-white/5 px-4 py-4 text-[15px] leading-7 text-white/82" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="futuristic-panel-dark relative overflow-hidden p-4 sm:p-6">
            <img
              alt="Helar legal study materials and digital library workflow"
              className="h-[420px] w-full rounded-[1.6rem] object-cover"
              loading="lazy"
              src={advisoryImage}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,19,0.06)_0%,rgba(6,10,19,0.1)_45%,rgba(6,10,19,0.5)_100%)]" />
            <div className="absolute bottom-8 left-8 right-8">
              <div className="rounded-[1.4rem] border border-white/12 bg-[rgba(6,10,19,0.8)] p-5 backdrop-blur-md">
                <p className="text-xs uppercase tracking-[0.18em] text-white/62">Quick overview</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "6", value: "core resources" },
                    { label: "NLS", value: "focused" },
                    { label: "24/7", value: "access" }
                  ].map((item) => (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center" key={item.label}>
                      <p className="font-heading text-2xl text-[color:var(--color-accent)]">{item.label}</p>
                      <p className="mt-2 text-sm uppercase tracking-[0.14em] text-white/72">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell pt-24">
        <div className="futuristic-panel-dark px-8 py-14 text-center lg:px-12">
          <h2 className="font-heading text-[2.1rem] leading-[1.35] text-white lg:text-[2.8rem]">
            Start studying from the legal materials you actually need.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-[18px] leading-[30px] text-white/82">
            Get immediate access to law reports, subject summary notes, faculty textbook cases and ratios, NLS handbook notes, NLS cases and ratios, and NLS (BAR) final exams.
          </p>
          <Link className="mt-10 inline-flex border border-white/18 bg-white/6 px-8 py-4 font-heading text-base text-white backdrop-blur-sm transition hover:bg-white/10" to="/auth/sign-up">
            Explore The Library
          </Link>
        </div>
      </section>

      <section className="section-shell pt-24" id="contact">
        <div className="futuristic-panel grid gap-8 p-8 md:grid-cols-[1fr_1fr]">
          <div>
            <h3 className="font-heading text-[28px] text-[color:var(--color-text)]">Contact Helar</h3>
            <p className="body-copy mt-4 whitespace-pre-line">
              {`Address: 163, Sathcom-K House, Okporo Road. Rumuodara. Port Harcourt

Phone number: 09030009297, 08023035628

Email: info@helar.law`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            {trustSignals.map((signal) => (
              <span key={signal} className="rounded-full border border-[rgba(21,28,50,0.12)] bg-white/70 px-4 py-2 text-sm text-[color:var(--color-text)] backdrop-blur-sm">
                {signal}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
