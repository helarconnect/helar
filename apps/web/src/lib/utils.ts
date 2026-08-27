import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
