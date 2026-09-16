import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Decodes common HTML entities into plain text. Mirrors the server-side helper used in
// apps/api/src/helar-connect.ts and apps/api/src/admin-notifications.ts so excerpts and
// share-text payloads that contain rich HTML markup decode consistently client-side.
export function decodeHtmlEntities(value: string): string {
  if (!value) return "";
  const replaced = value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
  return replaced
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

// Strips HTML tags (plus style/script blocks) from a rich-text string and collapses
// whitespace into a single plain-text string. Defensive counterpart to the server-side
// `stripHtml`; used on collapsed-card excerpts and share-text payloads so raw
// `<div><br></div>` markup never leaks into visible text even when a cached API response
// predates a server-side fix.
export function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Plain-text preview excerpt of an HTML rich-text body. Used as a client-side safety
// layer; server now returns identical semantics via buildHtmlExcerpt().
export function buildPlainTextExcerpt(bodyHtml: string, maxLength = 220): string {
  const plain = stripHtml(decodeHtmlEntities(bodyHtml ?? ""));
  if (plain.length <= maxLength) return plain;
  const sliced = plain.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.75) {
    return `${sliced.slice(0, lastSpace)}…`;
  }
  return `${sliced}…`;
}

const adminRoleCodes = new Set([
  'super_admin',
  'administrator',
  'academic_administrator',
  'finance_officer',
  'moderator',
  'content_admin',
])

export function hasAdminAccess(roleCodes: string[] = []) {
  return roleCodes.some((roleCode) => adminRoleCodes.has(roleCode))
}

export function hasRole(roleCodes: string[] = [], targetRoleCode: string) {
  return roleCodes.includes(targetRoleCode)
}

export function isSuperAdmin(roleCodes: string[] = []) {
  return hasRole(roleCodes, 'super_admin')
}

export function isContentAdmin(roleCodes: string[] = []) {
  return hasRole(roleCodes, 'content_admin')
}

export function hasExecutiveDashboardAccess(roleCodes: string[] = []) {
  return isSuperAdmin(roleCodes) || isContentAdmin(roleCodes)
}

export function canAccessPayments(roleCodes: string[] = []) {
  return hasAdminAccess(roleCodes) && !isContentAdmin(roleCodes)
}

export function canModerateHelarConnect(roleCodes: string[] = []) {
  return roleCodes.some((roleCode) => ['super_admin', 'moderator', 'content_admin'].includes(roleCode))
}

// --- Practitioner role helpers (lawyer / judge are NOT admins, but NOT students either) ---

export function isLawyer(roleCodes: string[] = []) {
  return hasRole(roleCodes, 'lawyer')
}

export function isJudge(roleCodes: string[] = []) {
  return hasRole(roleCodes, 'judge')
}

export function isStudent(roleCodes: string[] = []) {
  return hasRole(roleCodes, 'student')
}

export type WorkspaceTier = 'super_admin' | 'content_admin' | 'admin' | 'judge' | 'lawyer' | 'student'

export function resolveWorkspaceTier(roleCodes: string[] = []): WorkspaceTier {
  if (isSuperAdmin(roleCodes)) return 'super_admin'
  if (isContentAdmin(roleCodes)) return 'content_admin'
  if (hasAdminAccess(roleCodes)) return 'admin'
  if (isJudge(roleCodes)) return 'judge'
  if (isLawyer(roleCodes)) return 'lawyer'
  return 'student'
}

export function getWorkspaceLabel(roleCodes: string[] = []): string {
  const tier = resolveWorkspaceTier(roleCodes)
  switch (tier) {
    case 'super_admin':
      return 'Super admin workspace'
    case 'content_admin':
      return 'Content admin workspace'
    case 'admin':
      return 'Admin workspace'
    case 'judge':
      return 'Judge workspace'
    case 'lawyer':
      return 'Lawyer workspace'
    case 'student':
    default:
      return 'Student workspace'
  }
}

export function getPrimaryRoleLabel(roleCodes: string[] = []): string {
  const tier = resolveWorkspaceTier(roleCodes)
  switch (tier) {
    case 'super_admin':
      return 'Super admin account'
    case 'content_admin':
      return 'Content admin account'
    case 'admin':
      return 'Admin account'
    case 'judge':
      return 'Judge account'
    case 'lawyer':
      return 'Lawyer account'
    case 'student':
    default:
      return 'Student account'
  }
}
