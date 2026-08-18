import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Copy, FileSearch, Link2, Scale, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import {
  createLawReportReadingSession,
  fetchAdminLibraryMaterial,
  fetchLibraryMaterial,
  fetchStudentStudyProgress,
  saveStudentStudyProgress,
  updateLawReportReadingSession,
  type AdminLibrarySection
} from "@/lib/admin-api";
import { queryKeys } from "@/lib/query-keys";
import { cn, hasAdminAccess } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

function formatDate(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prettifyCourt(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(text: string, query: string, highlightClassName: string, sectionId?: SearchSectionId) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return text;
  }

  const pattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi");
  const parts = text.split(pattern);

  let matchIndex = 0;

  return parts.map((part, index) => {
    if (part.toLowerCase() === normalizedQuery.toLowerCase()) {
      const matchId = sectionId ? `${sectionId}-${matchIndex}` : undefined;
      matchIndex += 1;

      return (
        <mark className={highlightClassName} data-search-match-id={matchId} key={`${part}-${index}`}>
          {part}
        </mark>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function highlightHtmlContent(html: string, query: string, highlightClassName: string, sectionId: SearchSectionId) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery || typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = documentRoot.body.firstElementChild;

  if (!container) {
    return html;
  }

  const pattern = new RegExp(escapeRegExp(normalizedQuery), "gi");
  const walker = documentRoot.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let matchIndex = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const parentElement = currentNode.parentElement;

    if (parentElement && !["MARK", "SCRIPT", "STYLE"].includes(parentElement.tagName) && currentNode.textContent?.trim()) {
      textNodes.push(currentNode as Text);
    }

    currentNode = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const originalText = textNode.textContent ?? "";

    if (!pattern.test(originalText)) {
      pattern.lastIndex = 0;
      continue;
    }

    pattern.lastIndex = 0;
    const fragment = documentRoot.createDocumentFragment();
    let lastIndex = 0;
    let match = pattern.exec(originalText);

    while (match) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      if (matchStart > lastIndex) {
        fragment.append(documentRoot.createTextNode(originalText.slice(lastIndex, matchStart)));
      }

      const mark = documentRoot.createElement("mark");
      mark.className = highlightClassName;
      mark.setAttribute("data-search-match-id", `${sectionId}-${matchIndex}`);
      mark.textContent = originalText.slice(matchStart, matchEnd);
      fragment.append(mark);
      lastIndex = matchEnd;
      matchIndex += 1;
      match = pattern.exec(originalText);
    }

    if (lastIndex < originalText.length) {
      fragment.append(documentRoot.createTextNode(originalText.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return container.innerHTML;
}

function Surface({ children, className, isDark }: { children: ReactNode; className?: string; isDark: boolean }) {
  return (
    <section
      className={cn(
        "rounded-[28px] border shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
        isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white",
        className
      )}
    >
      {children}
    </section>
  );
}

function EmptyState({ isDark, message }: { isDark: boolean; message: string }) {
  return (
    <div
      className={cn(
        "rounded-[24px] border px-6 py-8 text-sm leading-7",
        isDark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {message}
    </div>
  );
}

type SearchSectionId = "body" | "court" | "date" | "report-number" | "suit-number" | "summary" | "title";

type SearchResult = {
  id: string;
  label: string;
  snippet: string;
  sectionId: SearchSectionId;
};

function findSectionMatches(sectionId: SearchSectionId, label: string, text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery || !text.trim()) {
    return [];
  }

  const haystack = text.toLowerCase();
  const matches: SearchResult[] = [];
  let cursor = 0;
  let matchIndex = 0;

  while (cursor < haystack.length) {
    const foundAt = haystack.indexOf(normalizedQuery, cursor);

    if (foundAt === -1) {
      break;
    }

    const start = Math.max(0, foundAt - 60);
    const end = Math.min(text.length, foundAt + normalizedQuery.length + 90);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < text.length ? "..." : "";

    matches.push({
      id: `${sectionId}-${matchIndex}`,
      label,
      sectionId,
      snippet: `${prefix}${text.slice(start, end).trim()}${suffix}`
    });

    cursor = foundAt + normalizedQuery.length;
    matchIndex += 1;
  }

  return matches;
}

function buildSearchResults(query: string, report: {
  body: string;
  materialType: string;
  reportDate: string | null;
  reportNumber: string | null;
  storageUrl: string;
  summary: string;
  title: string;
}, options: { isHelarpedia: boolean } = { isHelarpedia: false }) {
  const materialTypeLabel = options.isHelarpedia ? "Entry type" : "Court";
  const serialLabel = options.isHelarpedia ? "Serial no." : "Case Number";
  const storageLabel = options.isHelarpedia ? "Cross-reference" : "Suit Number";
  const prettifyType = (value: string) => {
    if (options.isHelarpedia) {
      return value === "REFERENCE_ENTRY" ? "Helarpedia entry" : value.replace(/_/g, " ");
    }
    return prettifyCourt(value);
  };
  return [
    ...findSectionMatches("title", "Title", report.title, query),
    ...findSectionMatches("court", materialTypeLabel, prettifyType(report.materialType), query),
    ...findSectionMatches("date", "Date", formatDate(report.reportDate), query),
    ...findSectionMatches("report-number", serialLabel, report.reportNumber ?? "Pending assignment", query),
    ...findSectionMatches("suit-number", storageLabel, report.storageUrl, query),
    ...findSectionMatches("summary", "Summary", stripHtml(report.summary), query),
    ...findSectionMatches("body", "Body", stripHtml(report.body), query)
  ];
}

function scrollContainerToElement(container: HTMLElement, element: HTMLElement, offset = 24) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const nextScrollTop = elementRect.top - containerRect.top + container.scrollTop - offset;

  container.scrollTo({
    behavior: "smooth",
    top: Math.max(0, nextScrollTop)
  });
}

function emphasizeMatchedElement(element: HTMLElement, isDark: boolean) {
  const previousTransition = element.style.transition;
  const previousBoxShadow = element.style.boxShadow;
  const previousBackgroundColor = element.style.backgroundColor;
  const previousBorderRadius = element.style.borderRadius;

  element.style.transition = "box-shadow 180ms ease, background-color 180ms ease";
  element.style.borderRadius = "0.35rem";
  element.style.boxShadow = isDark ? "0 0 0 2px rgba(251, 191, 36, 0.55)" : "0 0 0 2px rgba(245, 158, 11, 0.55)";
  element.style.backgroundColor = isDark ? "rgba(251, 191, 36, 0.16)" : "rgba(253, 230, 138, 0.9)";

  window.setTimeout(() => {
    element.style.transition = previousTransition;
    element.style.boxShadow = previousBoxShadow;
    element.style.backgroundColor = previousBackgroundColor;
    element.style.borderRadius = previousBorderRadius;
  }, 1600);
}

type ParsedContentBlock = {
  html: string;
  id: string;
};

function parseHtmlBlocks(html: string) {
  if (typeof DOMParser === "undefined") {
    return [] as ParsedContentBlock[];
  }

  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = documentRoot.body.firstElementChild;

  if (!container) {
    return [] as ParsedContentBlock[];
  }

  const escapeHtmlText = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const root =
    container.children.length === 1 &&
    container.firstElementChild?.tagName === "DIV" &&
    container.firstElementChild.children.length > 0
      ? container.firstElementChild
      : container;

  const blocks = Array.from(root.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        return text ? `<p>${escapeHtmlText(text)}</p>` : "";
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as Element).outerHTML;
      }

      return "";
    })
    .filter((value) => value.trim());

  return blocks.map((block, index) => ({
    html: block,
    id: `p-${index + 1}`
  }));
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is unavailable.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function createShareToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }

  return Math.random().toString(36).slice(2, 10);
}

function findQuoteRange(target: HTMLElement, quote: string) {
  const normalizedQuote = quote.trim();

  if (!normalizedQuote) {
    return null;
  }

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const haystack = textNode.textContent ?? "";
    const directIndex = haystack.indexOf(normalizedQuote);
    const normalizedIndex = directIndex === -1 ? haystack.toLowerCase().indexOf(normalizedQuote.toLowerCase()) : directIndex;

    if (normalizedIndex !== -1) {
      const range = document.createRange();
      range.setStart(textNode, normalizedIndex);
      range.setEnd(textNode, normalizedIndex + normalizedQuote.length);
      return range;
    }

    node = walker.nextNode();
  }

  return null;
}

function selectQuoteRange(range: Range) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

export function AdminLawReportReader() {
  const { isDark } = useTheme();
  const { materialId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const roleCodes = useAuthStore((state) => state.session?.user.roleCodes ?? []);
  const isStudentReader = location.pathname.startsWith("/app/library/");
  const canUseAdminLibraryEndpoint = hasAdminAccess(roleCodes);

  // Derive numbered-section from the URL path — the same reader powers both
  // law reports (/app/*/library/law-reports/:id) and Helarpedia
  // (/app/*/library/helarpedia/:id). Copy (labels, back link, bookmark keys,
  // API section param, summary search captions) is all switched through these
  // two predicates so the shared body/summary/deeplink/search engine stays
  // identical for both citation series.
  const isHelarpedia = /\/library\/helarpedia\//.test(location.pathname);
  const section: AdminLibrarySection = isHelarpedia ? "helarpedia" : "law-reports";
  const studyContentTypeKey = isHelarpedia ? "HELARPEDIA" : "LAW_REPORT";
  const backPath = isStudentReader
    ? isHelarpedia
      ? "/app/library/helarpedia"
      : "/app/library/law-reports"
    : isHelarpedia
      ? "/app/admin/library/helarpedia"
      : "/app/admin/library/law-reports";
  const backLabel = isHelarpedia ? "Back to Helarpedia" : isStudentReader ? "Back to library" : "Back to law reports";
  const singularNoun = isHelarpedia ? "Helarpedia entry" : "law report";
  const singularNounCapitalized = isHelarpedia ? "Helarpedia Entry" : "Law Report";
  const crossReferenceLabel = isHelarpedia ? "Cross-reference" : "Suit Number";
  const serialNumberLabel = isHelarpedia ? "Serial no." : "Case Number";
  const [searchTerm, setSearchTerm] = useState("");
  const [shareNotice, setShareNotice] = useState<null | { message: string; tone: "green" | "red" }>(null);
  const skipNextDeepLinkEffectRef = useRef(false);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const readingSessionIdRef = useRef<string | null>(null);
  const trackedVisibleMsRef = useRef(0);
  const lastVisibilityTickRef = useRef<number | null>(null);
  const hasRestoredStudyProgressRef = useRef(false);
  const incomingSearchState = location.state as
    | {
        librarySearchItemId?: string;
        librarySearchQuery?: string;
        librarySearchScope?: "body" | "reportNumber" | "storageUrl" | "summary" | "title";
      }
    | null;

  const reportQuery = useQuery({
    enabled: Boolean(materialId),
    gcTime: 120_000,
    queryFn: () =>
      canUseAdminLibraryEndpoint ? fetchAdminLibraryMaterial(section, materialId) : fetchLibraryMaterial(section, materialId),
    queryKey: queryKeys.adminLibraryDetail(section, materialId),
    staleTime: 45_000
  });
  const studyProgressQuery = useQuery({
    enabled: isStudentReader && Boolean(materialId),
    gcTime: 120_000,
    queryFn: () => fetchStudentStudyProgress(`${studyContentTypeKey}:${materialId}`),
    queryKey: queryKeys.studentStudyProgress(`${studyContentTypeKey}:${materialId}`),
    staleTime: 45_000
  });

  const report = reportQuery.data?.material;
  const contentAccess = reportQuery.data?.access;
  const highlightClassName = cn(
    "rounded px-1 py-0.5",
    isDark ? "bg-amber-400/30 text-amber-100" : "bg-amber-200 text-slate-950"
  );
  const searchResults = useMemo(() => {
    if (!report) {
      return [];
    }

    return buildSearchResults(searchTerm, report, { isHelarpedia });
  }, [report, searchTerm, isHelarpedia]);
  const highlightedSummary = useMemo(
    () => highlightHtmlContent(report?.summary ?? "", searchTerm, highlightClassName, "summary"),
    [highlightClassName, report?.summary, searchTerm]
  );
  const highlightedBody = useMemo(
    () => highlightHtmlContent(report?.body ?? "", searchTerm, highlightClassName, "body"),
    [highlightClassName, report?.body, searchTerm]
  );
  const isDeepLinkEnabled = Boolean(report?.sharingEnabled);
  const canUseSharingTools = hasAdminAccess(roleCodes) && isDeepLinkEnabled;
  const bodyBlocks = useMemo(() => (isDeepLinkEnabled ? parseHtmlBlocks(highlightedBody) : []), [highlightedBody, isDeepLinkEnabled]);

  useEffect(() => {
    if (!shareNotice) {
      return;
    }

    const timer = window.setTimeout(() => setShareNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [shareNotice]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (skipNextDeepLinkEffectRef.current) {
      skipNextDeepLinkEffectRef.current = false;
      return;
    }

    if (!isDeepLinkEnabled) {
      return;
    }

    const rawHash = location.hash.replace(/^#/, "");

    if (!rawHash || !rawHash.startsWith("p-")) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const dlToken = params.get("dl")?.trim() ?? "";
    const quote = params.get("quote")?.trim() ?? "";
    let timer: number | null = null;
    let didCancel = false;

    function stripDlToken() {
      if (!dlToken) {
        return;
      }

      params.delete("dl");
      const nextSearch = params.toString();
      const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
      skipNextDeepLinkEffectRef.current = true;
      navigate(nextUrl, { replace: true, state: location.state });
    }

    function attemptJump(attemptIndex: number) {
      if (didCancel) {
        return;
      }

      const paragraphElement = document.getElementById(rawHash);

      if (!paragraphElement) {
        if (attemptIndex < 10) {
          timer = window.setTimeout(() => attemptJump(attemptIndex + 1), 60);
        } else {
          setShareNotice({
            message: quote
              ? "The shared excerpt could not be loaded. It may be locked behind a subscription or no longer available."
              : "The shared paragraph could not be loaded. It may be locked behind a subscription or no longer available.",
            tone: "red"
          });
          stripDlToken();
        }
        return;
      }

      const scrollContainer = contentScrollRef.current;

      window.requestAnimationFrame(() => {
        if (didCancel) {
          return;
        }

        if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 2) {
          scrollContainerToElement(scrollContainer, paragraphElement, 32);
        } else {
          paragraphElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        emphasizeMatchedElement(paragraphElement, isDark);

        if (quote) {
          const range = findQuoteRange(paragraphElement, quote);
          if (range) {
            selectQuoteRange(range);
          }
          setShareNotice({ message: "Jumped to the shared excerpt.", tone: "green" });
        }

        stripDlToken();
      });
    }

    attemptJump(0);

    return () => {
      didCancel = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [bodyBlocks.length, isDeepLinkEnabled, isDark, location.hash, location.key, location.search, location.pathname, navigate]);

  async function handleCopyDeepLink(paragraphId: string, quote?: string) {
    if (typeof window === "undefined") {
      return;
    }

    const basePath =
      report?.publicationStatus === "PUBLISHED"
        ? `/app/library/law-reports/${materialId}`
        : `/app/admin/library/law-reports/${materialId}`;
    const url = new URL(`${window.location.origin}${basePath}`);
    url.hash = paragraphId;
    url.searchParams.set("dl", createShareToken());

    if (quote) {
      url.searchParams.set("quote", quote.slice(0, 180));
    } else {
      url.searchParams.delete("quote");
    }

    try {
      await copyToClipboard(url.toString());
      setShareNotice({
        message: quote ? "Deep link to selection copied." : "Deep link copied.",
        tone: "green"
      });
    } catch {
      setShareNotice({ message: "Could not copy link. Copy it from the address bar instead.", tone: "red" });
    }
  }

  function findParagraphIdForSelection() {
    if (typeof window === "undefined") {
      return null;
    }

    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const node = selection.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const paragraphElement = element?.closest?.("[data-helar-paragraph='true']") as HTMLElement | null;

    return paragraphElement?.id ?? null;
  }

  async function handleShareSelection() {
    if (typeof window === "undefined") {
      return;
    }

    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      return;
    }

    const quote = selection.toString().trim();

    if (quote.length < 2) {
      return;
    }

    const paragraphId = findParagraphIdForSelection();

    if (!paragraphId) {
      setShareNotice({ message: "Select text inside a paragraph to share it.", tone: "red" });
      return;
    }

    await handleCopyDeepLink(paragraphId, quote);
  }

  useEffect(() => {
    hasRestoredStudyProgressRef.current = false;
  }, [materialId]);

  function computeReadingProgress() {
    if (typeof window === "undefined") {
      return 0;
    }

    const scrollContainer = contentScrollRef.current;

    if (scrollContainer) {
      const maxScrollableDistance = scrollContainer.scrollHeight - scrollContainer.clientHeight;

      if (maxScrollableDistance <= 0) {
        return 100;
      }

      return Math.max(0, Math.min(100, (scrollContainer.scrollTop / maxScrollableDistance) * 100));
    }

    const contentArea = contentAreaRef.current;

    if (!contentArea) {
      return 0;
    }

    const viewportHeight = window.innerHeight;
    const contentTop = contentArea.offsetTop;
    const contentHeight = contentArea.scrollHeight;
    const maxScrollableDistance = Math.max(1, contentHeight - viewportHeight);
    const currentScroll = Math.max(0, window.scrollY - contentTop);

    return Math.max(0, Math.min(100, (currentScroll / maxScrollableDistance) * 100));
  }

  function syncTrackedVisibleTime() {
    if (typeof document === "undefined") {
      return;
    }

    const now = Date.now();

    if (document.visibilityState === "visible" && lastVisibilityTickRef.current) {
      trackedVisibleMsRef.current += Math.max(0, now - lastVisibilityTickRef.current);
    }

    lastVisibilityTickRef.current = now;
  }

  useEffect(() => {
    if (!incomingSearchState?.librarySearchQuery) {
      return;
    }

    setSearchTerm((current) => (current === incomingSearchState.librarySearchQuery ? current : incomingSearchState.librarySearchQuery));
  }, [incomingSearchState?.librarySearchQuery]);

  function scrollToMatch(result: SearchResult) {
    const exactMatch =
      typeof document !== "undefined"
        ? document.querySelector(`[data-search-match-id="${result.id}"]`)
        : null;

    if (exactMatch instanceof HTMLElement) {
      if (contentScrollRef.current) {
        scrollContainerToElement(contentScrollRef.current, exactMatch, 32);
      } else {
        exactMatch.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      emphasizeMatchedElement(exactMatch, isDark);
      return;
    }

    const fallbackElement =
      result.sectionId === "summary"
        ? summaryRef.current
        : result.sectionId === "body"
          ? bodyRef.current
          : result.sectionId === "title"
            ? titleRef.current
            : overviewRef.current;

    if (!fallbackElement) {
      return;
    }

    if (contentScrollRef.current) {
      scrollContainerToElement(contentScrollRef.current, fallbackElement, 32);
    } else {
      fallbackElement.scrollIntoView({ behavior: "smooth", block: "start" });
      window.scrollBy({ behavior: "smooth", top: -28 });
    }

    emphasizeMatchedElement(fallbackElement, isDark);
  }

  useEffect(() => {
    if (!isStudentReader || hasRestoredStudyProgressRef.current || incomingSearchState?.librarySearchQuery || !report) {
      return;
    }

    const savedProgress = studyProgressQuery.data;

    if (!savedProgress || typeof savedProgress.scrollProgressPct !== "number") {
      return;
    }

    const scrollContainer = contentScrollRef.current;

    if (!scrollContainer) {
      return;
    }

    hasRestoredStudyProgressRef.current = true;

    window.requestAnimationFrame(() => {
      const maxScrollableDistance = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      scrollContainer.scrollTop = (savedProgress.scrollProgressPct / 100) * maxScrollableDistance;
    });
  }, [incomingSearchState?.librarySearchQuery, isStudentReader, report, studyProgressQuery.data]);

  useEffect(() => {
    if (!report || !incomingSearchState?.librarySearchQuery) {
      return;
    }

    const targetResult = buildSearchResults(incomingSearchState.librarySearchQuery, report).find((result) => {
      if (!incomingSearchState.librarySearchScope) {
        return true;
      }

      return (
        (incomingSearchState.librarySearchScope === "title" && result.sectionId === "title") ||
        (incomingSearchState.librarySearchScope === "reportNumber" && result.sectionId === "report-number") ||
        (incomingSearchState.librarySearchScope === "storageUrl" && result.sectionId === "suit-number") ||
        (incomingSearchState.librarySearchScope === "summary" && result.sectionId === "summary") ||
        (incomingSearchState.librarySearchScope === "body" && result.sectionId === "body")
      );
    });

    if (targetResult) {
      window.setTimeout(() => {
        scrollToMatch(targetResult);
      }, 80);
    }
  }, [incomingSearchState?.librarySearchQuery, incomingSearchState?.librarySearchScope, report]);

  useEffect(() => {
    if (!materialId || !report) {
      return;
    }

    let isCancelled = false;
    let intervalId: number | null = null;

    async function startReadingSession() {
      try {
        const session = await createLawReportReadingSession(materialId);

        if (isCancelled) {
          return;
        }

        readingSessionIdRef.current = session.id;
        trackedVisibleMsRef.current = 0;
        lastVisibilityTickRef.current = Date.now();

        const flushSession = () => {
          syncTrackedVisibleTime();

          if (!readingSessionIdRef.current) {
            return;
          }

          void updateLawReportReadingSession(readingSessionIdRef.current, {
            progressPct: computeReadingProgress(),
            timeSpentSeconds: Math.round(trackedVisibleMsRef.current / 1000)
          });

          if (isStudentReader) {
            void saveStudentStudyProgress({
              contentKey: `${studyContentTypeKey}:${materialId}`,
              contentType: studyContentTypeKey as "LAW_REPORT" | "HELARPEDIA",
              lastPositionLabel: `${Math.round(computeReadingProgress())}% through ${singularNoun}`,
              path: isHelarpedia ? `/app/library/helarpedia/${materialId}` : `/app/library/law-reports/${materialId}`,
              readingProgressPct: computeReadingProgress(),
              scrollProgressPct: computeReadingProgress(),
              timeSpentSeconds: Math.round(trackedVisibleMsRef.current / 1000),
              title: report.title
            });
          }
        };

        const handleVisibilityChange = () => {
          syncTrackedVisibleTime();

          if (document.visibilityState === "hidden") {
            flushSession();
          }
        };

        intervalId = window.setInterval(flushSession, 15000);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("beforeunload", flushSession);

        return () => {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          window.removeEventListener("beforeunload", flushSession);
          if (intervalId) {
            window.clearInterval(intervalId);
          }
          flushSession();
          readingSessionIdRef.current = null;
        };
      } catch {
        return undefined;
      }
    }

    let cleanupSession: (() => void) | undefined;

    void startReadingSession().then((cleanup) => {
      cleanupSession = cleanup;
    });

    return () => {
      isCancelled = true;
      cleanupSession?.();
    };
  }, [isStudentReader, materialId, report]);

  if (reportQuery.isLoading) {
    return (
      <div className="grid gap-6">
        <div className={cn("h-14 animate-pulse rounded-[24px]", isDark ? "bg-slate-800" : "bg-slate-100")} />
        <div className={cn("h-48 animate-pulse rounded-[28px]", isDark ? "bg-slate-800" : "bg-slate-100")} />
        <div className={cn("h-[420px] animate-pulse rounded-[28px]", isDark ? "bg-slate-800" : "bg-slate-100")} />
      </div>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <div className="space-y-5">
        <Link
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
            isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-950"
          )}
          to={backPath}
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <EmptyState isDark={isDark} message={`Could not load this ${singularNoun}. Return to the ${isHelarpedia ? "Helarpedia" : "law reports"} page and open it again.`} />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 xl:h-[calc(100vh-8rem)] xl:overflow-hidden">
      {shareNotice ? (
        <div className="pointer-events-none fixed right-5 top-5 z-[120]">
          <div
            className={cn(
              "pointer-events-auto rounded-[22px] border px-4 py-3 text-sm shadow-[0_18px_60px_rgba(15,23,42,0.18)]",
              shareNotice.tone === "green"
                ? isDark
                  ? "border-emerald-500/30 bg-slate-950/95 text-emerald-100"
                  : "border-emerald-200 bg-white text-emerald-800"
                : isDark
                  ? "border-rose-500/30 bg-slate-950/95 text-rose-100"
                  : "border-rose-200 bg-white text-rose-800"
            )}
            role="status"
          >
            {shareNotice.message}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4 min-w-0">
        <div ref={titleRef} className="min-w-0 w-full md:w-auto md:flex-1">
          <Link
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
              isDark
                ? "border-slate-700 bg-slate-900 text-white hover:border-slate-600"
                : "border-slate-200 bg-white text-slate-950 hover:border-slate-300"
            )}
            to={backPath}
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <p className={cn("mt-4 text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>Law report reader</p>
          <h1 className={cn("mt-2 font-heading text-3xl sm:text-4xl leading-tight break-words max-w-full", isDark ? "text-white" : "text-slate-950")}>
            {renderHighlightedText(report.title, searchTerm, highlightClassName, "title")}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 min-w-0">
          {[
            report.reportNumber ?? "Pending case number",
            prettifyCourt(report.materialType),
            report.estimatedMins ? `${report.estimatedMins} min read` : "Reading time pending"
          ].map((item) => (
            <span
              className={cn(
                "rounded-full border px-4 py-2 text-sm break-words max-w-full",
                isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"
              )}
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="items-start gap-6 min-w-0 xl:grid xl:h-[calc(100%-8.5rem)] xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch xl:overflow-hidden" ref={contentAreaRef}>
        <div className="space-y-6 min-w-0 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-2" ref={contentScrollRef}>
          <Surface className="p-5 sm:p-6 lg:p-7 min-w-0" isDark={isDark}>
            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 min-w-0" ref={overviewRef}>
              {(
                [
                  {
                    icon: Scale,
                    id: "court",
                    label: isHelarpedia ? "Entry type" : "Court",
                    value: isHelarpedia ? (report.materialType === "REFERENCE_ENTRY" ? "Helarpedia entry" : report.materialType.replace(/_/g, " ")) : prettifyCourt(report.materialType)
                  },
                  { icon: CalendarDays, id: "date", label: "Date", value: formatDate(report.reportDate) },
                  { icon: FileSearch, id: "report-number", label: serialNumberLabel, value: report.reportNumber ?? "Pending assignment" },
                  { icon: FileSearch, id: "suit-number", label: crossReferenceLabel, value: report.storageUrl || "—" }
                ] as const
              ).map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    className={cn(
                      "rounded-[22px] border p-4",
                      isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
                    )}
                    key={item.label}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
                      <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                    </div>
                    <p className={cn("mt-3 text-sm font-medium leading-6", isDark ? "text-white" : "text-slate-950")}>
                      {renderHighlightedText(
                        item.value,
                        searchTerm,
                        highlightClassName,
                        item.id
                      )}
                    </p>
                  </div>
                );
              })}
            </section>
          </Surface>

          <Surface className="p-5 sm:p-6 lg:p-7 min-w-0 overflow-hidden" isDark={isDark}>
            {isStudentReader && contentAccess?.isPreview ? (
              <div
                className={cn(
                  "mb-6 rounded-[24px] border px-4 sm:px-5 py-4 min-w-0",
                  isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800"
                )}
              >
                <p className="text-xs uppercase tracking-[0.18em]">Preview only</p>
                <p className="mt-2 text-sm leading-7 break-words">
                  {contentAccess.upgradeMessage} You can read up to {contentAccess.previewWordLimit} words until a subscription is active.
                </p>
                <Link className="mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-medium break-words" to="/app/subscription">
                  View subscription plans
                </Link>
              </div>
            ) : null}
            <section ref={summaryRef}>
              <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Summary</p>
              {stripHtml(report.summary) ? (
                <div
                  className={cn(
                    "mt-4 rounded-[24px] border px-4 sm:px-5 py-5 leading-8 min-w-0 overflow-hidden rich-text-content",
                    isDark ? "border-slate-800 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
                  )}
                  dangerouslySetInnerHTML={{ __html: highlightedSummary }}
                />
              ) : (
                <EmptyState isDark={isDark} message={`No summary has been added to this ${singularNoun} yet.`} />
              )}
            </section>
          </Surface>

          <Surface className="p-5 sm:p-6 lg:p-7 min-w-0 overflow-hidden" isDark={isDark}>
            <section ref={bodyRef}>
              <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>
                {isStudentReader && contentAccess?.isPreview ? "Full report locked" : "Full report"}
              </p>
              {stripHtml(report.body) ? (
                <div
                  className={cn(
                    "mt-4 rounded-[24px] border px-4 sm:px-5 py-6 leading-8 min-w-0 overflow-hidden rich-text-content",
                    isDark ? "border-slate-800 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-700"
                  )}
                  onMouseUp={() => {
                    if (canUseSharingTools) {
                      void handleShareSelection();
                    }
                  }}
                >
                  {isDeepLinkEnabled && bodyBlocks.length ? (
                    <div className="space-y-4 min-w-0">
                      {bodyBlocks.map((block) => (
                        <div
                          className={cn(
                            "group relative scroll-mt-24 rounded-[18px] px-2 py-1 transition min-w-0 break-words",
                            isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
                          )}
                          data-helar-paragraph="true"
                          id={block.id}
                          key={block.id}
                        >
                          {canUseSharingTools ? (
                            <button
                              className={cn(
                                "absolute -left-3 top-2 hidden h-9 w-9 items-center justify-center rounded-2xl border backdrop-blur-sm transition group-hover:inline-flex shrink-0",
                                isDark
                                  ? "border-slate-700 bg-slate-900/90 text-slate-200 hover:border-slate-600 hover:text-white"
                                  : "border-slate-200 bg-white/90 text-slate-600 hover:border-slate-300 hover:text-slate-950"
                              )}
                              onClick={() => void handleCopyDeepLink(block.id)}
                              title="Copy paragraph link"
                              type="button"
                            >
                              <Link2 className="h-4 w-4" />
                            </button>
                          ) : null}
                          <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: block.html }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: highlightedBody }} />
                  )}

                  {canUseSharingTools ? (
                    <div className={cn("mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-sm", isDark ? "border-slate-800 bg-slate-950/60 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700")}>
                      <div>
                        <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>Sharing tools</p>
                        <p className="mt-1 leading-6">Hover a paragraph to copy a deep link, or select text to copy a share link with a quote.</p>
                      </div>
                      <button
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                          isDark
                            ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
                        )}
                        onClick={() => void handleShareSelection()}
                        type="button"
                      >
                        <Copy className="h-4 w-4" />
                        Copy link to selection
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  isDark={isDark}
                  message={
                    isStudentReader && contentAccess?.isPreview
                      ? `Subscribe to unlock the full ${singularNoun} body after the preview.`
                      : `This ${singularNoun} does not have a full body yet.`
                  }
                />
              )}
            </section>
          </Surface>
        </div>

        <aside className="xl:h-full xl:min-h-0 xl:self-start">
          <Surface className="overflow-hidden p-5 xl:flex xl:h-full xl:min-h-0 xl:max-h-full xl:flex-col" isDark={isDark}>
            <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Search report</p>
            <label
              className={cn(
                "mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3",
                isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50"
              )}
            >
              <Search className={cn("h-4 w-4", isDark ? "text-slate-500" : "text-slate-400")} />
              <input
                className={cn(
                  "w-full bg-transparent text-sm outline-none",
                  isDark ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400"
                )}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search all contents of this report"
                type="text"
                value={searchTerm}
              />
            </label>

            <div
              className={cn(
                "mt-4 h-[22rem] overflow-y-auto overscroll-y-contain pr-1 xl:min-h-0 xl:h-auto xl:flex-1 [scrollbar-gutter:stable]",
                isDark ? "scrollbar-thumb-slate-700 scrollbar-track-slate-900" : "scrollbar-thumb-slate-300 scrollbar-track-slate-100"
              )}
              onWheelCapture={(event) => event.stopPropagation()}
            >
              {!searchTerm.trim() ? (
                <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-600")}>
                  Search across the overview, summary, and full body of this {singularNoun}.
                </p>
              ) : searchResults.length ? (
                <div className="space-y-3">
                  <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-950")}>
                    {searchResults.length} match{searchResults.length === 1 ? "" : "es"} found
                  </p>
                  {searchResults.map((result) => (
                    <button
                      className={cn(
                        "w-full rounded-[20px] border px-4 py-3 text-left transition",
                        isDark
                          ? "border-slate-800 bg-slate-950 hover:border-slate-700"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300"
                      )}
                      key={result.id}
                      onClick={() => scrollToMatch(result)}
                      type="button"
                    >
                      <p className={cn("text-xs uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-400")}>{result.label}</p>
                      <p className={cn("mt-2 text-sm leading-6", isDark ? "text-slate-200" : "text-slate-700")}>
                        {renderHighlightedText(result.snippet, searchTerm, highlightClassName)}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={cn("text-sm leading-7", isDark ? "text-slate-400" : "text-slate-600")}>
                  No matches were found in this report. Try a different word or phrase.
                </p>
              )}
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
