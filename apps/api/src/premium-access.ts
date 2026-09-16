import { SubscriptionStatus } from "@prisma/client";

import { prisma } from "./lib/prisma.js";

export const PREMIUM_PREVIEW_WORD_LIMIT = 150;
// Character-based preview limit used for the Bar Final section (NLS Theory + MCQ)
// so unsubscribed users cannot read long essay answers or MCQ explanations in full.
export const PREMIUM_PREVIEW_CHAR_LIMIT = 150;

export type PremiumContentAccess = {
  activeSubscriptionEndsAt: Date | null;
  activeSubscriptionId: string | null;
  hasFullAccess: boolean;
  isPreview: boolean;
  previewWordLimit: number;
  previewCharLimit: number;
  requiresSubscription: boolean;
  upgradeMessage: string;
};

export function stripHtmlToText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncateWords(value: string | null | undefined, wordLimit = PREMIUM_PREVIEW_WORD_LIMIT) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return {
      text: "",
      wasTruncated: false,
      wordCount: 0
    };
  }

  const words = normalized.split(" ");

  if (words.length <= wordLimit) {
    return {
      text: normalized,
      wasTruncated: false,
      wordCount: words.length
    };
  }

  return {
    text: `${words.slice(0, wordLimit).join(" ")}...`,
    wasTruncated: true,
    wordCount: wordLimit
  };
}

// Character-based truncation. Prefers to break on whitespace inside the last
// 25% of the slice so we avoid cutting a word mid-way. Only use on plain text
// (call `stripHtmlToText` first when the source is rich HTML).
export function truncateChars(value: string | null | undefined, charLimit = PREMIUM_PREVIEW_CHAR_LIMIT) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return {
      text: "",
      wasTruncated: false,
      charCount: 0
    };
  }

  if (normalized.length <= charLimit) {
    return {
      text: normalized,
      wasTruncated: false,
      charCount: normalized.length
    };
  }

  const sliced = normalized.slice(0, charLimit);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > charLimit * 0.75) {
    return {
      text: `${sliced.slice(0, lastSpace).trimEnd()}…`,
      wasTruncated: true,
      charCount: lastSpace
    };
  }

  return {
    text: `${sliced.trimEnd()}…`,
    wasTruncated: true,
    charCount: charLimit
  };
}

export function createPreviewHtml(value: string | null | undefined, wordLimit = PREMIUM_PREVIEW_WORD_LIMIT) {
  const preview = truncateWords(stripHtmlToText(value), wordLimit);

  if (!preview.text) {
    return "";
  }

  return `<p>${escapeHtml(preview.text)}</p>`;
}

export function createPremiumContentAccess(hasFullAccess: boolean, endsAt: Date | null, subscriptionId: string | null): PremiumContentAccess {
  return {
    activeSubscriptionEndsAt: endsAt,
    activeSubscriptionId: subscriptionId,
    hasFullAccess,
    isPreview: !hasFullAccess,
    previewWordLimit: PREMIUM_PREVIEW_WORD_LIMIT,
    previewCharLimit: PREMIUM_PREVIEW_CHAR_LIMIT,
    requiresSubscription: !hasFullAccess,
    upgradeMessage: hasFullAccess
      ? ""
      : "Subscribe to unlock the full content, downloads, and premium study features."
  };
}

export async function getPremiumContentAccess(userId: string, now = new Date()) {
  const elevatedRoles = await prisma.userRole.findMany({
    where: {
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      userId
    },
    include: {
      role: {
        select: {
          code: true
        }
      }
    }
  });

  const hasAdminBypass = elevatedRoles.some((entry) => entry.role.code === "super_admin" || entry.role.code === "content_admin");

  if (hasAdminBypass) {
    return createPremiumContentAccess(true, null, null);
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      deletedAt: null,
      status: SubscriptionStatus.ACTIVE,
      userId
    },
    orderBy: [{ endsAt: "desc" }, { createdAt: "desc" }],
    select: {
      endsAt: true,
      id: true
    }
  });

  const endsAt = subscription?.endsAt ?? null;
  const hasFullAccess = Boolean(endsAt && endsAt.getTime() > now.getTime());

  return createPremiumContentAccess(hasFullAccess, endsAt, subscription?.id ?? null);
}
