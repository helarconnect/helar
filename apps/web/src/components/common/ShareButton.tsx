import { ExternalLink, Link as LinkIcon, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type ShareTarget =
  | "copy"
  | "native"
  | "whatsapp"
  | "x"
  | "facebook"
  | "linkedin"
  | "telegram"
  | "email";

type Props = {
  url: string;
  title?: string;
  text?: string;
  className?: string;
  buttonClassName?: string;
  buttonLabel?: string;
  size?: "sm" | "md";
  variant?: "solid" | "ghost";
};

function normalizeUrl(url: string) {
  return url.trim();
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function buildShareUrl(target: Exclude<ShareTarget, "copy" | "native">, params: { url: string; title?: string; text?: string }) {
  const url = normalizeUrl(params.url);
  const title = params.title?.trim() ?? "";
  const text = params.text?.trim() ?? "";

  switch (target) {
    case "whatsapp":
      return `https://wa.me/?text=${encode(text ? `${text}\n${url}` : url)}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${encode(url)}${title ? `&text=${encode(title)}` : ""}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encode(url)}${title ? `&text=${encode(title)}` : ""}`;
    case "email":
      return `mailto:?subject=${encode(title || "Shared link")}&body=${encode(text ? `${text}\n\n${url}` : url)}`;
  }
}

export function ShareButton({ url, title, text, className, buttonClassName, buttonLabel = "Share", size = "md", variant = "solid" }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const normalizedUrl = useMemo(() => normalizeUrl(url), [url]);
  const hasNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const isDisabled = !normalizedUrl;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  async function handleShare(target: ShareTarget) {
    if (isDisabled) {
      return;
    }

    if (target === "native") {
      try {
        await navigator.share({
          title: title?.trim() || undefined,
          text: text?.trim() || undefined,
          url: normalizedUrl
        });
        setIsOpen(false);
        return;
      } catch {
        setIsOpen(true);
        return;
      }
    }

    if (target === "copy") {
      const ok = await copyToClipboard(normalizedUrl);
      if (!ok) {
        window.prompt("Copy this link:", normalizedUrl);
      }
      setIsOpen(false);
      return;
    }

    const shareUrl = buildShareUrl(target, { title, text, url: normalizedUrl });
    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  }

  return (
    <div className={cn("relative inline-flex", className)} ref={rootRef}>
      <button
        aria-label={buttonLabel}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition",
          size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-sm",
          variant === "ghost"
            ? "border-transparent bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
            : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
          isDisabled ? "cursor-not-allowed opacity-60" : ""
          ,buttonClassName
        )}
        disabled={isDisabled}
        onClick={() => {
          if (hasNativeShare) {
            void handleShare("native");
            return;
          }
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <Share2 className="h-4 w-4" />
        <span>{buttonLabel}</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[150] w-64 overflow-hidden rounded-2xl border bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-800">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Share</p>
            <button
              aria-label="Close share menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-2">
            {hasNativeShare ? (
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={() => void handleShare("native")}
                type="button"
              >
                <Share2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span>Share...</span>
              </button>
            ) : null}

            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => void handleShare("copy")}
              type="button"
            >
              <LinkIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>Copy link</span>
            </button>

            <div className="my-2 h-px bg-slate-200 dark:bg-slate-800" />

            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => void handleShare("whatsapp")}
              type="button"
            >
              <ExternalLink className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>WhatsApp</span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => void handleShare("x")}
              type="button"
            >
              <ExternalLink className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>X (Twitter)</span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => void handleShare("facebook")}
              type="button"
            >
              <ExternalLink className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>Facebook</span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => void handleShare("linkedin")}
              type="button"
            >
              <ExternalLink className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>LinkedIn</span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => void handleShare("telegram")}
              type="button"
            >
              <ExternalLink className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>Telegram</span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => void handleShare("email")}
              type="button"
            >
              <ExternalLink className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>Email</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
